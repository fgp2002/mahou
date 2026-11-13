import { supabaseServer } from "../supabase/server";
import { loadAllStores, loadCompletedDates, loadSettings } from "./load";
import { fetchAll, loadAgreements, loadCatalog, loadPayments } from "./economy";
import { complianceInRange, pct, sumCompliance, type StoreCompliance } from "../domain/report";
import { effectiveFrequency } from "../domain/periodicity";
import { madridDate } from "../domain/dates";
import { addMonths, committedIn, lastMonths, monthEnd, previousRange, totals, type Range, type Unit } from "../economy";
import { isPresent, type EquipmentStatus } from "../equipment";
import { isOpen } from "../incidents";
import type { Store } from "../types";

export interface ReportScope { banner: string[]; store: string[] }
export interface ReportStoreRow { id: string; name: string; banner: string | null; town: string | null; frequency: string; audit: boolean; visits: number; comp: StoreCompliance; executed: number; cash: number; inKind: number; elements: Record<string, number>; incOpen: number }

export interface Report {
  range: Range; prev: Range; scopeLabel: string; generatedAt: string;
  activity: { comp: StoreCompliance; pct: number | null; byFreq: Record<string, StoreCompliance>; audit: StoreCompliance; cancelled: number; storesInScope: number };
  productivity: { visits: number; minutes: number; avgMinutes: number | null; plannedMinutes: number; realMinutes: number; comparable: number; driveMinutes: number; km: number; routeDays: number };
  commercial: {
    totals: ReturnType<typeof totals>; committed: number; byCategory: { name: string; executed: number; units: Partial<Record<Unit, number>> }[];
    agreementsActive: number; installed: number; removed: number; elementsNow: Record<string, number>; incOpened: number; incResolved: number; incOpenNow: number;
  };
  previous: { pct: number | null; visits: number; minutes: number; executed: number; installed: number; incOpened: number };
  trend: { m: string; pct: number | null; visits: number; executed: number; installed: number; removed: number }[];
  stores: ReportStoreRow[];
}

type Visit = { store_id: string; visit_date: string; status: string; duration_minutes: number | null; planned_minutes: number | null };
type Ev = { store_id: string; event_type: string; occurred_on: string; equipment_id: string };
type Inc = { store_id: string; status: string; opened_on: string; resolved_on: string | null };
type Stop = { store_id: string; drive_seconds_from_prev: number | null; distance_m_from_prev: number | null; routes: { route_date: string; status: string } | null };

/** Informe de actividad, productividad, gestión comercial y evolución para un periodo y un alcance (todas, enseñas o tiendas). */
export async function buildReport(range: Range, scope: ReportScope): Promise<Report> {
  const sb = await supabaseServer();
  const today = madridDate();
  const prev = previousRange(range);
  const months = lastMonths(range.to, 6);
  const from = [prev.from, months[0]].sort()[0];
  const [settings, allStores, dates, { types, categories }, payments, agreements, visits, events, incidents, stops, equipment] = await Promise.all([
    loadSettings(), loadAllStores(), loadCompletedDates(), loadCatalog(), loadPayments(from, range.to), loadAgreements(),
    fetchAll<Visit>((a, b) => sb.from("visits").select("store_id,visit_date,status,duration_minutes,planned_minutes").gte("visit_date", from).lte("visit_date", range.to).in("status", ["completed", "cancelled"]).range(a, b)),
    fetchAll<Ev>((a, b) => sb.from("equipment_events").select("store_id,event_type,occurred_on,equipment_id").gte("occurred_on", from).lte("occurred_on", range.to).in("event_type", ["alta", "instalacion", "retirada"]).range(a, b)),
    fetchAll<Inc>((a, b) => sb.from("incidents").select("store_id,status,opened_on,resolved_on").is("deleted_at", null).range(a, b)),
    fetchAll<Stop>((a, b) => sb.from("route_stops").select("store_id,drive_seconds_from_prev,distance_m_from_prev,routes!inner(route_date,status)").gte("routes.route_date", range.from).lte("routes.route_date", range.to).in("routes.status", ["accepted", "completed"]).range(a, b) as unknown as PromiseLike<{ data: Stop[] | null }>),
    fetchAll<{ store_id: string; type_id: string; status: EquipmentStatus; quantity: number }>((a, b) => sb.from("store_equipment").select("store_id,type_id,status,quantity").is("deleted_at", null).range(a, b)),
  ]);

  const stores: Store[] = allStores.filter((s) => (!scope.banner.length || scope.banner.includes(s.banner ?? "")) && (!scope.store.length || scope.store.includes(s.id)));
  const ids = new Set(stores.map((s) => s.id));
  const typeById = new Map(types.map((t) => [t.id, t]));
  const catById = new Map(categories.map((c) => [c.id, c]));
  const inR = (d: string, r: { from: string; to: string }) => d >= r.from && d <= r.to;
  const pays = payments.filter((p) => ids.has(p.store_id)).map((p) => ({ ...p, amount: Number(p.amount) }));
  const vis = visits.filter((v) => ids.has(v.store_id));
  const evs = events.filter((e) => ids.has(e.store_id));
  const incs = incidents.filter((i) => ids.has(i.store_id));
  const ags = agreements.filter((a) => ids.has(a.store_id)).map((a) => ({ ...a, amount: Number(a.amount) }));

  const compFor = (s: Store, r: { from: string; to: string }) => complianceInRange(s.frequency, s.audit, dates.get(s.id) ?? [], r.from, r.to, today, settings.tracking_start);
  const executedOf = (list: typeof pays) => list.filter((p) => p.status === "comprobado" || p.status === "abonado").reduce((s, p) => s + p.amount, 0);
  const installedIn = (r: { from: string; to: string }) => evs.filter((e) => inR(e.occurred_on, r) && (e.event_type === "instalacion" || e.event_type === "alta")).length;

  // Actividad
  const rows = stores.map((s) => ({ s, comp: compFor(s, range) }));
  const comp = sumCompliance(rows.map((r) => r.comp));
  const byFreq: Record<string, StoreCompliance> = {};
  for (const f of ["semanal", "quincenal", "mensual"]) byFreq[f] = sumCompliance(rows.filter((r) => effectiveFrequency(r.s.frequency, r.s.audit) === f).map((r) => r.comp));
  const audit = sumCompliance(rows.filter((r) => r.s.audit).map((r) => r.comp));
  const curVis = vis.filter((v) => inR(v.visit_date, range));
  const done = curVis.filter((v) => v.status === "completed");

  // Productividad
  const minutes = done.reduce((s, v) => s + (v.duration_minutes ?? 0), 0);
  const both = done.filter((v) => v.duration_minutes != null && v.planned_minutes != null);
  const st = stops.filter((x) => ids.has(x.store_id));

  // Gestión comercial
  const curPays = pays.filter((p) => inR(p.payment_date, range));
  const byCat = new Map<string, { name: string; executed: number; units: Partial<Record<Unit, number>> }>();
  for (const p of curPays) {
    if (p.status !== "comprobado" && p.status !== "abonado") continue;
    const c = catById.get(typeById.get(p.payment_type_id ?? "")?.category_id ?? "");
    const k = c?.id ?? "sin";
    const row = byCat.get(k) ?? { name: c?.name ?? "Sin categoría", executed: 0, units: {} };
    row.executed += p.amount;
    if (p.unit && p.unit !== "eur" && p.quantity) row.units[p.unit] = (row.units[p.unit] ?? 0) + Number(p.quantity);
    byCat.set(k, row);
  }
  const elementsNow: Record<string, number> = {};
  const elemByStore = new Map<string, Record<string, number>>();
  for (const e of equipment) {
    if (!ids.has(e.store_id) || !isPresent(e.status)) continue;
    const n = typeById.get(e.type_id)?.name ?? "Elemento";
    elementsNow[n] = (elementsNow[n] ?? 0) + e.quantity;
    const m = elemByStore.get(e.store_id) ?? {};
    m[n] = (m[n] ?? 0) + e.quantity;
    elemByStore.set(e.store_id, m);
  }

  const prevComp = sumCompliance(stores.map((s) => compFor(s, prev)));
  const prevDone = vis.filter((v) => inR(v.visit_date, prev) && v.status === "completed");

  const trend = months.map((m) => {
    const r = { from: m, to: monthEnd(m) };
    const c = sumCompliance(stores.map((s) => compFor(s, r)));
    return { m, pct: pct(c.done, c.required), visits: vis.filter((v) => inR(v.visit_date, r) && v.status === "completed").length, executed: executedOf(pays.filter((p) => inR(p.payment_date, r))), installed: installedIn(r), removed: evs.filter((e) => inR(e.occurred_on, r) && e.event_type === "retirada").length };
  });

  const storeRows: ReportStoreRow[] = rows.map(({ s, comp }) => {
    const ps = curPays.filter((p) => p.store_id === s.id);
    const t = totals(ps);
    return { id: s.id, name: s.name, banner: s.banner, town: s.town, frequency: s.frequency, audit: s.audit, visits: comp.visits, comp, executed: t.executed, cash: t.paidCash, inKind: t.paidInKind, elements: elemByStore.get(s.id) ?? {}, incOpen: incs.filter((i) => i.store_id === s.id && isOpen(i.status as never)).length };
  }).filter((r) => r.comp.required || r.visits || r.executed || Object.keys(r.elements).length || r.incOpen || scope.store.length)
    .sort((a, b) => b.executed - a.executed || b.visits - a.visits || a.name.localeCompare(b.name, "es"));

  const scopeLabel = scope.store.length === 1 ? stores[0]?.name ?? "Tienda" : scope.store.length ? `${scope.store.length} tiendas` : scope.banner.length ? scope.banner.join(", ") : "Todas las tiendas";
  return {
    range, prev, scopeLabel, generatedAt: new Date().toISOString(),
    activity: { comp, pct: pct(comp.done, comp.required), byFreq, audit, cancelled: curVis.filter((v) => v.status === "cancelled").length, storesInScope: stores.length },
    productivity: {
      visits: done.length, minutes, avgMinutes: done.length ? Math.round(minutes / done.length) : null,
      plannedMinutes: both.reduce((s, v) => s + (v.planned_minutes ?? 0), 0), realMinutes: both.reduce((s, v) => s + (v.duration_minutes ?? 0), 0), comparable: both.length,
      driveMinutes: Math.round(st.reduce((s, x) => s + (x.drive_seconds_from_prev ?? 0), 0) / 60), km: Math.round(st.reduce((s, x) => s + (x.distance_m_from_prev ?? 0), 0) / 100) / 10,
      routeDays: new Set(st.map((x) => x.routes?.route_date)).size,
    },
    commercial: {
      totals: totals(curPays), committed: ags.reduce((s, a) => s + committedIn(a, range.from, range.to).amount, 0),
      byCategory: [...byCat.values()].sort((a, b) => b.executed - a.executed),
      agreementsActive: ags.filter((a) => (a.status === "en_ejecucion" || a.status === "aprobado") && a.start_date <= range.to && (!a.end_date || a.end_date >= range.from)).length,
      installed: installedIn(range), removed: evs.filter((e) => inR(e.occurred_on, range) && e.event_type === "retirada").length, elementsNow,
      incOpened: incs.filter((i) => inR(i.opened_on, range)).length, incResolved: incs.filter((i) => i.resolved_on && inR(i.resolved_on, range)).length, incOpenNow: incs.filter((i) => isOpen(i.status as never)).length,
    },
    previous: { pct: pct(prevComp.done, prevComp.required), visits: prevDone.length, minutes: prevDone.reduce((s, v) => s + (v.duration_minutes ?? 0), 0), executed: executedOf(pays.filter((p) => inR(p.payment_date, prev))), installed: installedIn(prev), incOpened: incs.filter((i) => inR(i.opened_on, prev)).length },
    trend,
    stores: storeRows,
  };
}

export { addMonths };
