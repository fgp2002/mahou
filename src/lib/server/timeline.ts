import { supabaseServer } from "../supabase/server";
import { describeEvent, type EquipmentEvent } from "../equipment";
import { INCIDENT_TYPE_LABEL, type IncidentType } from "../incidents";
import { AGREEMENT_LABEL, PAY_LABEL, type AgreementStatus, type PayStatus } from "../economy";
import { VISIT_TYPES } from "../types";
import { eur } from "../format";

export type TimelineKind = "visita" | "foto" | "lineal" | "pago" | "acuerdo" | "elemento" | "incidencia" | "cambio";
export interface TimelineItem { key: string; date: string; at: string; kind: TimelineKind; title: string; detail?: string; href: string }

/** Cronología unificada de una tienda: visitas, fotos, pagos, acuerdos, inventario, incidencias y cambios. Más reciente primero. */
export async function loadStoreTimeline(storeId: string, limit = 300): Promise<TimelineItem[]> {
  const sb = await supabaseServer();
  const base = `/stores/${storeId}`;
  const [{ data: visits }, { data: photos }, { data: pays }, { data: ags }, { data: evs }, { data: incs }] = await Promise.all([
    sb.from("visits").select("id,visit_date,status,visit_type,duration_minutes,started_at,ended_at").eq("store_id", storeId).in("status", ["completed", "cancelled", "in_progress"]).order("visit_date", { ascending: false }).limit(200),
    sb.from("visit_photos").select("id,kind,taken_at,visit_id").eq("store_id", storeId).is("deleted_at", null).order("taken_at", { ascending: false }).limit(500),
    sb.from("payment_records").select("id,payment_date,concept_name,concept,amount,status,settlement,created_at").eq("store_id", storeId).is("deleted_at", null).order("payment_date", { ascending: false }).limit(200),
    sb.from("agreements").select("id,title,type_id,start_date,end_date,status,amount,created_at,payment_types(name)").eq("store_id", storeId).is("deleted_at", null).limit(100),
    sb.from("equipment_events").select("id,equipment_id,event_type,from_status,to_status,changes,visit_id,note,occurred_on,created_at,store_equipment(code,name,brand_name,payment_types(name))").eq("store_id", storeId).order("occurred_on", { ascending: false }).limit(200),
    sb.from("incidents").select("id,type,description,status,opened_on,resolved_on,created_at,updated_at").eq("store_id", storeId).is("deleted_at", null).limit(100),
  ]);
  const out: TimelineItem[] = [];
  for (const v of visits ?? []) {
    out.push({
      key: `v${v.id}`, date: v.visit_date, at: v.ended_at ?? v.started_at ?? `${v.visit_date}T12:00:00`, kind: "visita",
      title: v.status === "completed" ? "Visita realizada" : v.status === "cancelled" ? "Visita cancelada" : "Visita en curso",
      detail: [VISIT_TYPES[v.visit_type] ?? v.visit_type, v.duration_minutes != null ? `${v.duration_minutes} min` : null].filter(Boolean).join(" · "), href: `/visits/${v.id}`,
    });
  }
  // Fotos agrupadas por día y tipo para no llenar la cronología.
  const groups = new Map<string, { n: number; at: string; kind: string; visit: string | null }>();
  for (const p of photos ?? []) {
    const day = new Date(p.taken_at).toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
    const k = `${day}|${p.kind}`;
    const g = groups.get(k) ?? { n: 0, at: p.taken_at, kind: p.kind, visit: p.visit_id };
    g.n++;
    groups.set(k, g);
  }
  for (const [k, g] of groups) {
    const day = k.split("|")[0];
    out.push({
      key: `f${k}`, date: day, at: g.at, kind: g.kind === "lineal" ? "lineal" : "foto",
      title: g.kind === "lineal" ? "Fotografía del lineal actualizada" : `${g.n} foto${g.n === 1 ? "" : "s"} ${g.kind === "elemento" ? "de elementos" : g.kind === "incidencia" ? "de incidencias" : "de visita"}`,
      href: g.kind === "visita" && g.visit ? `/visits/${g.visit}` : `${base}?tab=fotos`,
    });
  }
  for (const p of pays ?? []) {
    out.push({
      key: `p${p.id}`, date: p.payment_date, at: p.created_at, kind: "pago",
      title: `Pago ${PAY_LABEL[p.status as PayStatus]?.toLowerCase() ?? p.status}: ${p.concept_name ?? p.concept}`,
      detail: `${eur(Number(p.amount))}${p.settlement === "especie" ? " en especie" : ""}`, href: `${base}?tab=pagos&pay=${p.id}`,
    });
  }
  for (const a of ags ?? []) {
    const name = a.title || (a.payment_types as unknown as { name: string } | null)?.name || "Acuerdo";
    out.push({ key: `a${a.id}`, date: a.start_date, at: a.created_at, kind: "acuerdo", title: `Acuerdo: ${name}`, detail: `${AGREEMENT_LABEL[a.status as AgreementStatus]} · ${eur(Number(a.amount))}`, href: `${base}?tab=pagos&ag=${a.id}` });
    if (a.end_date && (a.status === "finalizado" || a.end_date <= new Date().toISOString().slice(0, 10))) out.push({ key: `ae${a.id}`, date: a.end_date, at: `${a.end_date}T23:00:00`, kind: "acuerdo", title: `Fin del acuerdo: ${name}`, href: `${base}?tab=pagos&ag=${a.id}` });
  }
  for (const e of evs ?? []) {
    const eq = e.store_equipment as unknown as { code: string | null; name: string | null; brand_name: string | null; payment_types: { name: string } | null } | null;
    const label = [eq?.name || eq?.payment_types?.name, eq?.brand_name].filter(Boolean).join(" · ") || "Elemento";
    const what = e.event_type === "alta" ? (e.note ? "Elemento registrado" : "Elemento dado de alta") : describeEvent(e as unknown as EquipmentEvent);
    out.push({ key: `e${e.id}`, date: e.occurred_on, at: e.created_at, kind: "elemento", title: `${label}: ${what.charAt(0).toLowerCase()}${what.slice(1)}`, detail: eq?.code ?? undefined, href: `${base}?tab=inventario&eq=${e.equipment_id}` });
  }
  for (const i of incs ?? []) {
    const t = INCIDENT_TYPE_LABEL[i.type as IncidentType] ?? "Incidencia";
    out.push({ key: `i${i.id}`, date: i.opened_on, at: i.created_at, kind: "incidencia", title: `Incidencia abierta: ${t}`, detail: i.description ?? undefined, href: `${base}?tab=incidencias&inc=${i.id}` });
    if (i.resolved_on) out.push({ key: `ir${i.id}`, date: i.resolved_on, at: i.updated_at, kind: "incidencia", title: `Incidencia ${i.status === "descartada" ? "descartada" : "resuelta"}: ${t}`, href: `${base}?tab=incidencias&inc=${i.id}` });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at)).slice(0, limit);
}
