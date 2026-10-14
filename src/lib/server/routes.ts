// Generación de rutas. Se usa desde la API (sesión del usuario) y desde el cron (clave de servicio).
// Siempre filtra por owner_id de forma explícita, así funciona igual con ambos clientes.
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, fmtHM, madridDate, parseHM, weekdayMon0 } from "../domain/dates.ts";
import { computeObligation, priorityScore } from "../domain/periodicity.ts";
import { estimateMatrix, googleMatrix, type Matrix } from "../domain/geo.ts";
import { planRoute, scheduleFixedOrder } from "../domain/planner.ts";

export const MAX_CANDIDATES = 25;

export interface OwnerSettings {
  tracking_start: string;
  work_end: string;
  route_start: string;
  visit_durations: Record<string, number>;
  holidays: string[];
  work_days: number[];
  max_stops: number | null;
  audit_first: boolean;
}

export const UNSCHEDULED_LABEL: Record<string, string> = {
  tiempo: "No cabe en el tiempo disponible de la jornada",
  no_cabe: "Su duración supera por sí sola la jornada",
  sin_ubicacion: "Sin ubicación: no se puede calcular el trayecto",
  fuera_candidatos: `Fuera de las ${MAX_CANDIDATES} tiendas más prioritarias consideradas`,
  limite_paradas: "Superaría el máximo de paradas por día",
};

export async function loadOwnerSettings(sb: SupabaseClient, ownerId: string): Promise<OwnerSettings | null> {
  const { data } = await sb.from("user_settings").select("*").eq("owner_id", ownerId).maybeSingle();
  if (!data) return null;
  const pp = (data.planning_prefs ?? {}) as { holidays?: string[]; work_days?: number[]; max_stops_per_day?: number | null; audit_first?: boolean };
  return {
    tracking_start: data.tracking_start ?? madridDate(),
    work_end: String(data.work_end).slice(0, 5),
    route_start: String(data.route_start).slice(0, 5),
    visit_durations: data.visit_durations ?? {},
    holidays: pp.holidays ?? [],
    work_days: pp.work_days ?? [0, 1, 2, 3, 4],
    max_stops: pp.max_stops_per_day ?? null,
    audit_first: pp.audit_first ?? true,
  };
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
  opts: { by: "auto" | "manual"; replaceExisting?: boolean; overrideProtected?: boolean; forcedStoreIds?: string[]; excludeStoreIds?: string[] } = { by: "manual" },
): Promise<GenerateOutcome> {
  const settings = await loadOwnerSettings(sb, ownerId);
  if (!settings) return { status: "skipped", reason: "El usuario no tiene ajustes" };

  const { data: existing } = await sb.from("routes").select("id,status,user_modified").eq("owner_id", ownerId).eq("route_date", date).maybeSingle();
  if (existing) {
    // Nunca se pisa una ruta aceptada, editada o completada salvo confirmación expresa del usuario
    // (overrideProtected). El cron (by: "auto") jamás reemplaza nada.
    const prot = existing.status === "accepted" || existing.user_modified;
    const blocked = opts.by === "auto" || !opts.replaceExisting || existing.status === "completed" || (prot && !opts.overrideProtected);
    if (blocked) return { status: "exists", routeId: existing.id, routeStatus: existing.status };
    const { data: old } = await sb.from("route_stops").select("id").eq("route_id", existing.id).eq("owner_id", ownerId);
    const oldIds = (old ?? []).map((x) => x.id);
    if (oldIds.length) await sb.from("visits").delete().eq("owner_id", ownerId).eq("status", "planned").in("route_stop_id", oldIds);
    await sb.from("route_stops").delete().eq("route_id", existing.id).eq("owner_id", ownerId);
    await sb.from("routes").delete().eq("id", existing.id).eq("owner_id", ownerId);
  }

  // Tiendas candidatas
  const stores: { id: string; name: string; town: string | null; lat: number | null; lng: number | null; frequency: string; audit: boolean }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from("stores").select("id,name,town,lat,lng,frequency,audit").eq("owner_id", ownerId).eq("active", true).range(from, from + 999);
    stores.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const dates = await completedDates(sb, ownerId);
  const { data: sameDay } = await sb.from("visits").select("store_id").eq("owner_id", ownerId).eq("visit_date", date).in("status", ["completed", "in_progress"]);
  const doneToday = new Set((sameDay ?? []).map((v) => v.store_id));
  const exclude = new Set(opts.excludeStoreIds ?? []);
  const forced = new Set(opts.forcedStoreIds ?? []);

  const scored = stores
    .map((s) => {
      const ob = computeObligation(s.frequency as "semanal", date, dates.get(s.id) ?? [], { trackingStart: settings.tracking_start });
      return { s, ob, score: priorityScore(ob, s.audit && settings.audit_first) + (forced.has(s.id) ? 1000 : 0) };
    })
    .filter((x) => !exclude.has(x.s.id) && !doneToday.has(x.s.id) && (forced.has(x.s.id) || (x.ob.pending > 0 && (!x.ob.eligibleFrom || x.ob.eligibleFrom <= date))))
    .sort((a, b) => b.score - a.score);

  const unscheduled: { store_id: string; name: string; reason: string }[] = [];
  const located = scored.filter((x) => x.s.lat != null && x.s.lng != null);
  for (const x of scored) if (x.s.lat == null || x.s.lng == null) unscheduled.push({ store_id: x.s.id, name: x.s.name, reason: "sin_ubicacion" });
  const cand = located.slice(0, MAX_CANDIDATES);
  for (const x of located.slice(MAX_CANDIDATES)) unscheduled.push({ store_id: x.s.id, name: x.s.name, reason: "fuera_candidatos" });

  const startMin = parseHM(settings.route_start);
  const endMin = parseHM(settings.work_end);
  const warnings: string[] = [];
  let matrix: Matrix | null = null;
  let result = null as ReturnType<typeof planRoute> | null;

  if (cand.length) {
    matrix = await matrixFor(cand.map((x) => ({ lat: x.s.lat!, lng: x.s.lng! })));
    if (matrix.estimated) warnings.push("Tiempos de trayecto ESTIMADOS (no por carretera real): la distancia en línea recta se multiplica por 1,35 a 45 km/h.");
    const dur = settings.visit_durations.ordinaria ?? 60;
    result = planRoute({
      stores: cand.map((x) => ({ id: x.s.id, minutes: dur, priority: x.score, forced: forced.has(x.s.id) })),
      dur: matrix.dur, dist: matrix.dist, startMinutes: startMin, endMinutes: endMin,
    });
    if (settings.max_stops && result.stops.length > settings.max_stops) {
      for (const st of result.stops.slice(settings.max_stops)) unscheduled.push({ store_id: st.id, name: cand[st.index].s.name, reason: "limite_paradas" });
      result.stops = result.stops.slice(0, settings.max_stops);
    }
    for (const u of result.unscheduled) unscheduled.push({ store_id: u.id, name: cand[u.index].s.name, reason: u.reason });
  }
  if (!cand.length) warnings.push("No hay tiendas pendientes con ubicación para este día.");

  const { data: route, error } = await sb.from("routes").insert({
    owner_id: ownerId, route_date: date, status: "proposed", start_time: settings.route_start, generated_by: opts.by, user_modified: false,
    routing_provider: matrix ? matrix.provider : null, is_estimate: matrix?.estimated ?? false,
    est_distance_m: result ? Math.round(result.totalDistanceM) : 0, est_drive_seconds: result ? Math.round(result.totalDriveSeconds) : 0,
    est_visit_seconds: result ? result.totalVisitMinutes * 60 : 0, unscheduled, warnings,
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

  const nStops = result?.stops.length ?? 0;
  await sb.from("alerts").upsert({
    owner_id: ownerId, kind: "route_proposed", severity: "info", dedupe_key: `route:${date}`,
    message: `Ruta propuesta para ${date}: ${nStops} paradas${unscheduled.length ? ` y ${unscheduled.length} sin programar` : ""}. Revísala y acéptala.`,
  }, { onConflict: "owner_id,dedupe_key", ignoreDuplicates: true });

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
  const matrix = await matrixFor(list.map((s) => ({ lat: s.stores.lat, lng: s.stores.lng })));
  const r = scheduleFixedOrder(list.map((s) => ({ id: s.id, minutes: s.planned_minutes })), matrix.dur, matrix.dist, parseHM(String(route.start_time).slice(0, 5)));
  for (let i = 0; i < list.length; i++) {
    const st = r.stops[i];
    await sb.from("route_stops").update({
      position: i + 1, planned_arrival: fmtHM(st.arrivalMinutes),
      drive_seconds_from_prev: Math.round(st.driveSecondsFromPrev), distance_m_from_prev: Math.round(st.distanceMFromPrev),
    }).eq("id", list[i].id);
  }
  const warnings: string[] = matrix.estimated ? ["Tiempos de trayecto ESTIMADOS (no por carretera real)."] : [];
  const { data: set } = await sb.from("user_settings").select("work_end").eq("owner_id", ownerId).single();
  if (set && r.endMinutes > parseHM(String(set.work_end).slice(0, 5))) warnings.push(`La ruta termina a las ${fmtHM(r.endMinutes)}, después del fin de jornada (${String(set.work_end).slice(0, 5)}).`);
  await sb.from("routes").update({
    is_estimate: matrix.estimated, routing_provider: matrix.provider, est_distance_m: Math.round(r.totalDistanceM),
    est_drive_seconds: Math.round(r.totalDriveSeconds), est_visit_seconds: r.totalVisitMinutes * 60, warnings, updated_at: new Date().toISOString(),
  }).eq("id", routeId);
  return { estimate: matrix.estimated };
}
