// Generación de rutas. Se usa desde la API (sesión del usuario) y desde el cron (clave de servicio).
// Siempre filtra por owner_id de forma explícita, así funciona igual con ambos clientes.
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, fmtHM, madridDate, parseHM, weekdayMon0 } from "../domain/dates.ts";
import { computeObligation, priorityScore } from "../domain/periodicity.ts";
import { estimateMatrix, googleMatrix, googleRoutePolyline, type Matrix } from "../domain/geo.ts";
import { geocodeOne } from "./geocode.ts";
import { pickZone, planRoute, scheduleFixedOrder, ZONE_DEFAULTS, type Lunch } from "../domain/planner.ts";

import { MAX_CANDIDATES } from "./labels.ts";
export { UNSCHEDULED_LABEL } from "./labels.ts";

export interface OwnerSettings {
  tracking_start: string;
  work_end: string;
  route_start: string;
  visit_durations: Record<string, number>;
  holidays: string[];
  work_days: number[];
  max_stops: number | null;
  audit_first: boolean;
  home: { lat: number; lng: number } | null;
  home_address: string | null;
  lunch: Lunch | null;
  default_minutes: number;
}

/** Peso de los km frente al tiempo (equilibrio): 1 km «cuesta» 0,6 min además de su tiempo. */
const KM_WEIGHT = 0.6;


export async function loadOwnerSettings(sb: SupabaseClient, ownerId: string): Promise<OwnerSettings | null> {
  const { data } = await sb.from("user_settings").select("*").eq("owner_id", ownerId).maybeSingle();
  if (!data) return null;
  const pp = (data.planning_prefs ?? {}) as {
    holidays?: string[]; work_days?: number[]; max_stops_per_day?: number | null; audit_first?: boolean;
    lunch?: { enabled?: boolean; from?: string; to?: string; minutes?: number }; default_visit_minutes?: number;
  };
  const l = pp.lunch;
  return {
    tracking_start: data.tracking_start ?? madridDate(),
    work_end: String(data.work_end).slice(0, 5),
    route_start: String(data.route_start).slice(0, 5),
    visit_durations: data.visit_durations ?? {},
    holidays: pp.holidays ?? [],
    work_days: pp.work_days ?? [0, 1, 2, 3, 4],
    max_stops: pp.max_stops_per_day ?? null,
    audit_first: pp.audit_first ?? true,
    home: data.home_lat != null && data.home_lng != null ? { lat: data.home_lat, lng: data.home_lng } : null,
    home_address: data.home_address ?? null,
    lunch: l && l.enabled === false ? null : { earliest: parseHM(l?.from ?? "13:30"), latest: parseHM(l?.to ?? "16:00"), minutes: l?.minutes ?? 60 },
    default_minutes: pp.default_visit_minutes ?? 45,
  };
}

/** Localiza la dirección de salida (casa) una vez y la guarda. */
async function ensureHome(sb: SupabaseClient, ownerId: string, s: OwnerSettings): Promise<string | null> {
  if (s.home || !s.home_address) return s.home_address ? null : "No hay dirección de salida en Ajustes: la ruta empieza en la primera tienda.";
  const key = process.env.GOOGLE_API_KEY;
  if (!key) return "No se pudo localizar la dirección de salida (falta la clave de Google).";
  const g = await geocodeOne({ address: s.home_address, town: null, postal_code: null, province: null }, key);
  if (g.lat == null || g.lng == null || g.status === "failed") return `No se encontró la dirección de salida «${s.home_address}». Revísala en Ajustes.`;
  s.home = { lat: g.lat, lng: g.lng };
  await sb.from("user_settings").update({ home_lat: g.lat, home_lng: g.lng }).eq("owner_id", ownerId);
  return null;
}

/** Duración aprendida: mediana de las visitas cronometradas de cada tienda (10–180 min). */
async function learnedMinutes(sb: SupabaseClient, ownerId: string, storeIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!storeIds.length) return out;
  const { data } = await sb.from("visits").select("store_id,duration_minutes").eq("owner_id", ownerId).eq("status", "completed")
    .eq("is_manual", false).not("duration_minutes", "is", null).in("store_id", storeIds).order("visit_date", { ascending: false }).limit(2000);
  const by = new Map<string, number[]>();
  for (const v of data ?? []) by.set(v.store_id, [...(by.get(v.store_id) ?? []), v.duration_minutes as number].slice(0, 10));
  for (const [id, xs] of by) {
    const sorted = [...xs].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    out.set(id, Math.min(180, Math.max(10, Math.round(med / 5) * 5)));
  }
  return out;
}

export function isWorkDay(date: string, s: OwnerSettings): boolean {
  return s.work_days.includes(weekdayMon0(date)) && !s.holidays.includes(date);
}

/** Siguiente día laborable estrictamente posterior a `from`. */
export function nextWorkDay(from: string, s: OwnerSettings): string {
  let d = addDays(from, 1);
  for (let i = 0; i < 14 && !isWorkDay(d, s); i++) d = addDays(d, 1);
  return d;
}

async function completedDates(sb: SupabaseClient, ownerId: string): Promise<Map<string, string[]>> {
  const m = new Map<string, string[]>();
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from("visits").select("store_id,visit_date").eq("owner_id", ownerId).eq("status", "completed").range(from, from + 999);
    for (const v of data ?? []) m.set(v.store_id, [...(m.get(v.store_id) ?? []), v.visit_date]);
    if (!data || data.length < 1000) break;
  }
  return m;
}

export async function matrixFor(points: { lat: number; lng: number }[]): Promise<Matrix> {
  const key = process.env.GOOGLE_API_KEY;
  if (key && points.length > 1) {
    try {
      return await googleMatrix(points, key);
    } catch (e) {
      console.error("Routes API falló, uso estimación:", (e as Error).message);
    }
  }
  return estimateMatrix(points);
}

export type GenerateOutcome =
  | { status: "created"; routeId: string; stops: number; unscheduled: number; estimate: boolean }
  | { status: "exists"; routeId: string; routeStatus: string }
  | { status: "skipped"; reason: string };

export async function generateRoute(
  sb: SupabaseClient,
  ownerId: string,
  date: string,
  opts: { by: "auto" | "manual"; replaceExisting?: boolean; overrideProtected?: boolean; forcedStoreIds?: string[]; excludeStoreIds?: string[]; banners?: string[] } = { by: "manual" },
): Promise<GenerateOutcome> {
  const settings = await loadOwnerSettings(sb, ownerId);
  if (!settings) return { status: "skipped", reason: "El usuario no tiene ajustes" };

  const warnings: string[] = [];
  const homeWarn = await ensureHome(sb, ownerId, settings);
  if (homeWarn) warnings.push(homeWarn);

  const { data: existing } = await sb.from("routes").select("id,status,user_modified,banner_filter").eq("owner_id", ownerId).eq("route_date", date).maybeSingle();
  if (existing) {
    // Nunca se pisa una ruta aceptada, editada o completada salvo confirmación expresa del usuario
    // (overrideProtected). El cron (by: "auto") jamás reemplaza nada.
    const prot = existing.status === "accepted" || existing.user_modified;
    const blocked = opts.by === "auto" || !opts.replaceExisting || existing.status === "completed" || (prot && !opts.overrideProtected);
    if (blocked) return { status: "exists", routeId: existing.id, routeStatus: existing.status };
    // Al regenerar se mantiene el filtro de enseñas que tenía la ruta, salvo que se indique otro.
    if (!opts.banners && existing.banner_filter?.length) opts = { ...opts, banners: existing.banner_filter };
    const { data: old } = await sb.from("route_stops").select("id").eq("route_id", existing.id).eq("owner_id", ownerId);
    const oldIds = (old ?? []).map((x) => x.id);
    if (oldIds.length) await sb.from("visits").delete().eq("owner_id", ownerId).eq("status", "planned").in("route_stop_id", oldIds);
    await sb.from("route_stops").delete().eq("route_id", existing.id).eq("owner_id", ownerId);
    await sb.from("routes").delete().eq("id", existing.id).eq("owner_id", ownerId);
  }

  // Tiendas candidatas
  const stores: { id: string; name: string; town: string | null; lat: number | null; lng: number | null; frequency: string; audit: boolean; banner: string | null; geocode_status: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from("stores").select("id,name,town,lat,lng,frequency,audit,banner,geocode_status").eq("owner_id", ownerId).eq("active", true).range(from, from + 999);
    stores.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const dates = await completedDates(sb, ownerId);
  const { data: sameDay } = await sb.from("visits").select("store_id").eq("owner_id", ownerId).eq("visit_date", date).in("status", ["completed", "in_progress"]);
  const doneToday = new Set((sameDay ?? []).map((v) => v.store_id));
  const exclude = new Set(opts.excludeStoreIds ?? []);
  const forced = new Set(opts.forcedStoreIds ?? []);
  const bannerSet = opts.banners?.length ? new Set(opts.banners.map((b) => b.trim().toUpperCase())) : null;

  const scored = stores
    .map((s) => {
      const ob = computeObligation(s.frequency as "semanal", date, dates.get(s.id) ?? [], { trackingStart: settings.tracking_start });
      return { s, ob, score: priorityScore(ob, s.audit && settings.audit_first) + (forced.has(s.id) ? 1000 : 0) };
    })
    .filter((x) => !exclude.has(x.s.id) && !doneToday.has(x.s.id) && (!bannerSet || forced.has(x.s.id) || bannerSet.has((x.s.banner ?? "").replace(/\s+/g, " ").trim().toUpperCase())) && (forced.has(x.s.id) || (x.ob.pending > 0 && (!x.ob.eligibleFrom || x.ob.eligibleFrom <= date))))
    .sort((a, b) => b.score - a.score);

  const unscheduled: { store_id: string; name: string; reason: string }[] = [];
  const located = scored.filter((x) => x.s.lat != null && x.s.lng != null);
  for (const x of scored) if (x.s.lat == null || x.s.lng == null) unscheduled.push({ store_id: x.s.id, name: x.s.name, reason: "sin_ubicacion" });
  // Zona del día: ancla (la más urgente) + pendientes cercanas, con tope de Audit por día.
  const zone = pickZone(located.map((x) => ({
    id: x.s.id, lat: x.s.lat!, lng: x.s.lng!, score: x.score, audit: x.s.audit && settings.audit_first,
    overdue: x.ob.state === "atrasada", forced: forced.has(x.s.id),
  })), { ...ZONE_DEFAULTS, max: MAX_CANDIDATES, home: settings.home });
  const byId = new Map(located.map((x) => [x.s.id, x]));
  const prio = new Map(zone.picked.map((p) => [p.id, p.priority]));
  const cand = zone.picked.map((p) => byId.get(p.id)!);
  for (const d of zone.dropped) { const x = byId.get(d.id)!; unscheduled.push({ store_id: x.s.id, name: x.s.name, reason: d.reason }); }

  const startMin = parseHM(settings.route_start);
  const endMin = parseHM(settings.work_end);
  let matrix: Matrix | null = null;
  let result = null as ReturnType<typeof planRoute> | null;

  if (cand.length) {
    const pts = cand.map((x) => ({ lat: x.s.lat!, lng: x.s.lng! }));
    matrix = await matrixFor(settings.home ? [settings.home, ...pts] : pts);
    if (matrix.estimated) warnings.push("Tiempos de trayecto ESTIMADOS (no por carretera real): la distancia en línea recta se multiplica por 1,35 a 45 km/h.");
    const learned = await learnedMinutes(sb, ownerId, cand.map((x) => x.s.id));
    result = planRoute({
      stores: cand.map((x) => ({ id: x.s.id, minutes: learned.get(x.s.id) ?? settings.default_minutes, priority: prio.get(x.s.id) ?? x.score, forced: forced.has(x.s.id) })),
      dur: matrix.dur, dist: matrix.dist, startMinutes: startMin, endMinutes: endMin,
      hasHome: !!settings.home, lunch: settings.lunch, kmWeight: KM_WEIGHT,
    });
    if (settings.max_stops && result.stops.length > settings.max_stops) {
      for (const st of result.stops.slice(settings.max_stops)) unscheduled.push({ store_id: st.id, name: cand[st.index].s.name, reason: "limite_paradas" });
      result.stops = result.stops.slice(0, settings.max_stops);
    }
    for (const u of result.unscheduled) unscheduled.push({ store_id: u.id, name: cand[u.index].s.name, reason: u.reason });
  }
  if (!cand.length) warnings.push(bannerSet ? "No hay tiendas pendientes de esas enseñas con ubicación para este día." : "No hay tiendas pendientes con ubicación para este día.");
  if (result) {
    const approx = result.stops.filter((st) => cand[st.index].s.geocode_status === "partial").length;
    if (approx) warnings.push(`${approx} paradas tienen la ubicación aproximada: el orden puede no ser exacto. Corrígela en la ficha de la tienda.`);
    if (result.lunch && settings.lunch && result.lunch.start > settings.lunch.latest - settings.lunch.minutes)
      warnings.push(`La pausa para comer empieza a las ${fmtHM(result.lunch.start)}, más tarde de lo previsto.`);
  }

  const { data: route, error } = await sb.from("routes").insert({
    owner_id: ownerId, route_date: date, status: "proposed", start_time: settings.route_start, generated_by: opts.by, user_modified: false,
    routing_provider: matrix ? matrix.provider : null, is_estimate: matrix?.estimated ?? false,
    est_distance_m: result ? Math.round(result.totalDistanceM) : 0, est_drive_seconds: result ? Math.round(result.totalDriveSeconds) : 0,
    est_visit_seconds: result ? result.totalVisitMinutes * 60 : 0, unscheduled, warnings,
    banner_filter: bannerSet ? [...bannerSet] : null,
    lunch_start: result?.lunch ? fmtHM(result.lunch.start) : null, lunch_after_position: result?.lunch ? result.lunch.afterStop + 1 : null,
  }).select("id").single();
  if (error) {
    // Carrera con otra ejecución: la ruta ya existe, no se duplica.
    const { data: again } = await sb.from("routes").select("id,status").eq("owner_id", ownerId).eq("route_date", date).maybeSingle();
    if (again) return { status: "exists", routeId: again.id, routeStatus: again.status };
    throw new Error(error.message);
  }

  if (result && result.stops.length) {
    const { error: e2 } = await sb.from("route_stops").insert(result.stops.map((st, i) => ({
      owner_id: ownerId, route_id: route.id, store_id: st.id, position: i + 1,
      planned_arrival: fmtHM(st.arrivalMinutes), planned_minutes: st.minutes,
      drive_seconds_from_prev: Math.round(st.driveSecondsFromPrev), distance_m_from_prev: Math.round(st.distanceMFromPrev),
      reason: cand[st.index].ob.state === "atrasada" ? "Atrasada" : cand[st.index].s.audit ? "Audit" : cand[st.index].ob.state === "proxima" ? "Vence pronto" : "Pendiente",
      forced_priority: forced.has(st.id),
    })));
    if (e2) throw new Error(e2.message);
  }
  await saveRouteShape(sb, route.id, settings.home, (result?.stops ?? []).map((st) => ({ lat: cand[st.index].s.lat!, lng: cand[st.index].s.lng! })));

  const nStops = result?.stops.length ?? 0;
  await sb.from("alerts").upsert({
    owner_id: ownerId, kind: "route_proposed", severity: "info", dedupe_key: `route:${date}`,
    message: `Ruta propuesta para ${date}: ${nStops} paradas${unscheduled.length ? ` y ${unscheduled.length} sin programar` : ""}. Revísala y acéptala.`,
  }, { onConflict: "owner_id,dedupe_key", ignoreDuplicates: true });

  if (unscheduled.length) {
    await sb.from("alerts").upsert({
      owner_id: ownerId, kind: "route_unscheduled", severity: "warning", dedupe_key: `unsched:${date}`,
      message: `${unscheduled.length} tiendas pendientes no caben en la ruta del ${date}. Mira el motivo en la ruta.`,
    }, { onConflict: "owner_id,dedupe_key", ignoreDuplicates: true });
  }

  return { status: "created", routeId: route.id, stops: nStops, unscheduled: unscheduled.length, estimate: matrix?.estimated ?? false };
}

/** Recalcula horarios y trayectos de una ruta existente tras editarla (orden, altas, bajas, hora de salida). */
export async function recalcRoute(sb: SupabaseClient, ownerId: string, routeId: string): Promise<{ estimate: boolean }> {
  const { data: route } = await sb.from("routes").select("*").eq("id", routeId).eq("owner_id", ownerId).single();
  if (!route) throw new Error("Ruta no encontrada");
  const { data: stops } = await sb.from("route_stops").select("*, stores(lat,lng)").eq("route_id", routeId).eq("owner_id", ownerId).order("position");
  const list = (stops ?? []) as unknown as { id: string; planned_minutes: number; stores: { lat: number; lng: number } }[];
  if (!list.length) {
    await sb.from("routes").update({ est_distance_m: 0, est_drive_seconds: 0, est_visit_seconds: 0, updated_at: new Date().toISOString() }).eq("id", routeId);
    return { estimate: false };
  }
  const settings = await loadOwnerSettings(sb, ownerId);
  if (settings) await ensureHome(sb, ownerId, settings);
  const home = settings?.home ?? null;
  const pts = list.map((s) => ({ lat: s.stores.lat, lng: s.stores.lng }));
  const matrix = await matrixFor(home ? [home, ...pts] : pts);
  const r = scheduleFixedOrder(list.map((s) => ({ id: s.id, minutes: s.planned_minutes })), matrix.dur, matrix.dist, parseHM(String(route.start_time).slice(0, 5)), { hasHome: !!home, lunch: settings?.lunch ?? null });
  for (let i = 0; i < list.length; i++) {
    const st = r.stops[i];
    await sb.from("route_stops").update({
      position: i + 1, planned_arrival: fmtHM(st.arrivalMinutes),
      drive_seconds_from_prev: Math.round(st.driveSecondsFromPrev), distance_m_from_prev: Math.round(st.distanceMFromPrev),
    }).eq("id", list[i].id);
  }
  await saveRouteShape(sb, routeId, home, pts);
  const warnings: string[] = matrix.estimated ? ["Tiempos de trayecto ESTIMADOS (no por carretera real)."] : [];
  const { data: set } = await sb.from("user_settings").select("work_end").eq("owner_id", ownerId).single();
  if (set && r.endMinutes > parseHM(String(set.work_end).slice(0, 5))) warnings.push(`La ruta termina a las ${fmtHM(r.endMinutes)}, después del fin de jornada (${String(set.work_end).slice(0, 5)}).`);
  await sb.from("routes").update({
    is_estimate: matrix.estimated, routing_provider: matrix.provider, est_distance_m: Math.round(r.totalDistanceM),
    est_drive_seconds: Math.round(r.totalDriveSeconds), est_visit_seconds: r.totalVisitMinutes * 60, warnings, updated_at: new Date().toISOString(),
    lunch_start: r.lunch ? fmtHM(r.lunch.start) : null, lunch_after_position: r.lunch ? r.lunch.afterStop + 1 : null,
  }).eq("id", routeId);
  return { estimate: matrix.estimated };
}

/** Guarda el trazado por carretera y el punto de salida para la vista previa de la ruta. */
export async function saveRouteShape(sb: SupabaseClient, routeId: string, home: { lat: number; lng: number } | null, stops: { lat: number; lng: number }[]) {
  const key = process.env.GOOGLE_API_KEY;
  const pts = home ? [home, ...stops] : stops;
  let polyline: string | null = null;
  if (key && pts.length > 1) {
    try { polyline = await googleRoutePolyline(pts, key); } catch { polyline = null; }
  }
  await sb.from("routes").update({ polyline: polyline ?? "", start_lat: home?.lat ?? null, start_lng: home?.lng ?? null }).eq("id", routeId);
  return { polyline, start: home };
}

/** Para rutas antiguas sin trazado: lo calcula una vez al abrirlas. */
export async function ensureRouteShape(sb: SupabaseClient, ownerId: string, routeId: string, stops: { lat: number; lng: number }[]) {
  const settings = await loadOwnerSettings(sb, ownerId);
  if (settings) await ensureHome(sb, ownerId, settings);
  return saveRouteShape(sb, routeId, settings?.home ?? null, stops);
}
