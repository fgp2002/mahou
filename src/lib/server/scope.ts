import { cache } from "react";
import { supabaseServer } from "../supabase/server";
import { loadAllStores, loadCompletedDates, loadSettings, withObligations, type StoreWithObligation } from "./load.ts";
import { complianceInRange, sumCompliance, type StoreCompliance } from "../domain/report.ts";
import { madridDate, monthStart } from "../domain/dates.ts";
import { monthEnd } from "../economy.ts";

// Datos del ámbito de la persona conectada (la base de datos ya filtra lo que puede ver) agrupados por
// unidad de la organización y por persona. Sirve al inicio de responsables, a «Mi equipo» y al panel de dirección.

export interface Unit { id: string; parent_id: string | null; kind: string; name: string; sort_order: number; active: boolean }
export interface Member {
  user_id: string; full_name: string; email: string | null; position: string | null; phone: string | null; role: string; unit_id: string | null;
  manager_id: string | null; status: string; organization_id: string; valid_from: string; valid_to: string | null;
}
export interface Task {
  id: string; store_id: string; kind: string; title: string; description: string | null; priority: string; due_date: string | null; status: string;
  assignee_id: string | null; company_id: string | null; created_by: string; created_at: string; completed_at: string | null; equipment_id: string | null; incident_id: string | null;
}
export const TASK_COLS = "id,store_id,kind,title,description,priority,due_date,status,assignee_id,company_id,created_by,created_at,completed_at,equipment_id,incident_id";
export const OPEN_TASK = ["pendiente", "asignada", "en_curso", "pendiente_validacion", "rechazada"];

export interface Bucket {
  key: string; name: string; stores: number; compliance: StoreCompliance; atrasadas: number;
  incidents: number; incidentsHigh: number; equipmentIssues: number; tasksOpen: number; tasksToValidate: number; tasksOverdue: number; visitsToday: number;
}

const empty = (key: string, name: string): Bucket => ({ key, name, stores: 0, compliance: { required: 0, done: 0, pending: 0, missed: 0, visits: 0 }, atrasadas: 0, incidents: 0, incidentsHigh: 0, equipmentIssues: 0, tasksOpen: 0, tasksToValidate: 0, tasksOverdue: 0, visitsToday: 0 });

export const loadOrg = cache(async () => {
  const sb = await supabaseServer();
  const [{ data: units }, { data: members }, { data: orgs }] = await Promise.all([
    sb.from("org_units").select("id,parent_id,kind,name,sort_order,active").order("sort_order").order("name"),
    sb.from("members").select("user_id,full_name,email,position,phone,role,unit_id,manager_id,status,organization_id,valid_from,valid_to").order("full_name"),
    sb.from("organizations").select("id,name,kind,parent_org_id,active,tax_id,notes").order("name"),
  ]);
  return { units: (units ?? []) as Unit[], members: (members ?? []) as Member[], orgs: (orgs ?? []) as { id: string; name: string; kind: string; parent_org_id: string | null; active: boolean; tax_id: string | null; notes: string | null }[] };
});

/** Ids de la unidad y de todas las que cuelgan de ella. */
export function subtree(units: Unit[], root: string): Set<string> {
  const out = new Set([root]);
  let grew = true;
  while (grew) { grew = false; for (const u of units) if (u.parent_id && out.has(u.parent_id) && !out.has(u.id)) { out.add(u.id); grew = true; } }
  return out;
}
export function unitPath(units: Unit[], id: string | null): string {
  const names: string[] = [];
  let cur = units.find((u) => u.id === id);
  while (cur) { names.unshift(cur.name); cur = units.find((u) => u.id === cur!.parent_id); }
  return names.join(" › ");
}

export interface ScopeData {
  today: string;
  rows: (StoreWithObligation & { unit_id: string | null })[];
  units: Unit[];
  members: Member[];
  tasks: Task[];
  byUnit: Bucket[];
  byPerson: (Bucket & { member: Member; portfolio: number; lastVisit: string | null })[];
  total: Bucket;
}

/** Cifras del ámbito, opcionalmente limitadas a una unidad (y lo que cuelga de ella). */
export async function loadScope(unitFilter?: string | null): Promise<ScopeData> {
  const sb = await supabaseServer();
  const today = madridDate();
  const m0 = monthStart(today), m1 = monthEnd(m0);
  const [settings, stores, dates, org] = await Promise.all([loadSettings(), loadAllStores(), loadCompletedDates(), loadOrg()]);
  const [{ data: unitRows }, { data: inc }, { data: eq }, { data: tasks }, { data: vis }, { data: assign }, { data: lastV }] = await Promise.all([
    sb.from("stores").select("id,unit_id").eq("active", true).limit(10000),
    sb.from("incidents").select("store_id,priority").is("deleted_at", null).in("status", ["abierta", "en_seguimiento"]).limit(5000),
    sb.from("store_equipment").select("store_id").is("deleted_at", null).in("status", ["deteriorado", "pendiente_revision", "pendiente_instalacion"]).limit(10000),
    sb.from("tasks").select(TASK_COLS).is("deleted_at", null).order("due_date", { ascending: true, nullsFirst: false }).limit(2000),
    sb.from("visits").select("store_id,created_by,status,visit_date").gte("visit_date", m0).lte("visit_date", today).eq("status", "completed").limit(10000),
    sb.from("store_assignments").select("store_id,user_id,company_id,function,valid_from,valid_to").limit(20000),
    sb.from("visits").select("created_by,visit_date").eq("status", "completed").order("visit_date", { ascending: false }).limit(3000),
  ]);
  const unitOf = new Map((unitRows ?? []).map((r) => [r.id as string, r.unit_id as string | null]));
  let rows = withObligations(stores, dates, settings, today).map((r) => ({ ...r, unit_id: unitOf.get(r.id) ?? null }));
  if (unitFilter) { const ok = subtree(org.units, unitFilter); rows = rows.filter((r) => r.unit_id && ok.has(r.unit_id)); }
  const inScope = new Set(rows.map((r) => r.id));
  const allTasks = ((tasks ?? []) as Task[]).filter((t) => inScope.has(t.store_id));

  // Unidades a mostrar: las hijas de la unidad elegida (o las de primer nivel con tiendas) hasta llegar a zonas.
  const childrenOf = (id: string | null) => org.units.filter((u) => u.parent_id === id);
  let level = unitFilter ? childrenOf(unitFilter) : org.units.filter((u) => !u.parent_id || !org.units.some((p) => p.id === u.parent_id));
  // Si solo hay un nivel con un único elemento (p. ej. España), se baja hasta que haya reparto.
  // (solo si la unidad no tiene tiendas propias: si las tiene, se queda en ese nivel).
  while (level.length === 1 && childrenOf(level[0].id).length && !rows.some((r) => r.unit_id === level[0].id)) level = childrenOf(level[0].id);
  const groupOf = new Map<string, string>();
  for (const u of level) for (const id of subtree(org.units, u.id)) groupOf.set(id, u.id);

  const buckets = new Map(level.map((u) => [u.id, empty(u.id, u.name)]));
  const none = empty("none", "Sin unidad asignada");
  const total = empty("total", "Total");
  const storeBucket = new Map<string, Bucket>();
  for (const r of rows) {
    const b = (r.unit_id && buckets.get(groupOf.get(r.unit_id) ?? "")) || (unitFilter && r.unit_id === unitFilter ? total : none);
    storeBucket.set(r.id, b);
    const c = complianceInRange(r.frequency, r.audit, dates.get(r.id) ?? [], m0, m1, today, settings.tracking_start);
    for (const x of b === total ? [total] : [b, total]) {
      x.stores++; x.compliance = sumCompliance([x.compliance, c]); if (r.ob.state === "atrasada") x.atrasadas++;
    }
  }
  const bump = (storeId: string, f: (b: Bucket) => void) => { const b = storeBucket.get(storeId); if (!b) return; f(b); if (b !== total) f(total); };
  for (const i of inc ?? []) bump(i.store_id, (b) => { b.incidents++; if (i.priority === "alta") b.incidentsHigh++; });
  for (const e of eq ?? []) bump(e.store_id, (b) => { b.equipmentIssues++; });
  for (const t of allTasks) bump(t.store_id, (b) => {
    if (OPEN_TASK.includes(t.status)) b.tasksOpen++;
    if (t.status === "pendiente_validacion") b.tasksToValidate++;
    if (OPEN_TASK.includes(t.status) && t.due_date && t.due_date < today) b.tasksOverdue++;
  });
  for (const v of vis ?? []) if (v.visit_date === today) bump(v.store_id, (b) => { b.visitsToday++; });

  // Por persona: su cartera vigente, sus visitas y sus tareas.
  const live = (a: { valid_from: string; valid_to: string | null }) => a.valid_from <= today && (!a.valid_to || a.valid_to >= today);
  const lastBy = new Map<string, string>();
  for (const v of lastV ?? []) if (v.created_by && !lastBy.has(v.created_by)) lastBy.set(v.created_by, v.visit_date);
  const byPerson = org.members.filter((m) => m.status === "activo").map((m) => {
    const port = new Set((assign ?? []).filter((a) => a.user_id === m.user_id && live(a) && inScope.has(a.store_id)).map((a) => a.store_id));
    const b = empty(m.user_id, m.full_name);
    b.stores = port.size;
    for (const r of rows) if (port.has(r.id)) { b.compliance = sumCompliance([b.compliance, complianceInRange(r.frequency, r.audit, dates.get(r.id) ?? [], m0, m1, today, settings.tracking_start)]); if (r.ob.state === "atrasada") b.atrasadas++; }
    for (const v of vis ?? []) if (v.created_by === m.user_id && v.visit_date === today) b.visitsToday++;
    for (const t of allTasks) if (t.assignee_id === m.user_id) {
      if (OPEN_TASK.includes(t.status)) b.tasksOpen++;
      if (t.status === "pendiente_validacion") b.tasksToValidate++;
      if (OPEN_TASK.includes(t.status) && t.due_date && t.due_date < today) b.tasksOverdue++;
    }
    return { ...b, member: m, portfolio: port.size, lastVisit: lastBy.get(m.user_id) ?? null };
  }).filter((p) => !unitFilter || p.portfolio > 0 || (p.member.unit_id && subtree(org.units, unitFilter).has(p.member.unit_id)));

  const byUnit = [...buckets.values()].filter((b) => b.stores > 0);
  if (none.stores) byUnit.push(none);
  return { today, rows, units: org.units, members: org.members, tasks: allTasks, byUnit, byPerson, total };
}

export const pct = (c: StoreCompliance) => (c.required ? Math.round((c.done / c.required) * 100) : null);
