// Incidencias: tipos, prioridades, estados y reglas puras.
export type IncidentType = "falta_producto" | "reposicion" | "cabecera_desmontada" | "nevera_deteriorada" | "exposicion" | "acceso" | "comercial" | "otros";
export type IncidentStatus = "abierta" | "en_seguimiento" | "resuelta" | "descartada";
export type Priority = "baja" | "media" | "alta";

export interface Incident {
  id: string; store_id: string; visit_id: string | null; equipment_id: string | null; type: IncidentType; description: string | null;
  priority: Priority; status: IncidentStatus; opened_on: string; resolved_on: string | null; resolution: string | null; deleted_at: string | null; created_at: string;
}
export const INCIDENT_COLS = "id,store_id,visit_id,equipment_id,type,description,priority,status,opened_on,resolved_on,resolution,deleted_at,created_at";

export const INCIDENT_TYPE_LABEL: Record<IncidentType, string> = {
  falta_producto: "Falta de producto", reposicion: "Problema de reposición", cabecera_desmontada: "Cabecera desmontada", nevera_deteriorada: "Nevera deteriorada",
  exposicion: "Problema de exposición", acceso: "Problema de acceso", comercial: "Problema comercial", otros: "Otros",
};
export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = { abierta: "Abierta", en_seguimiento: "En seguimiento", resuelta: "Resuelta", descartada: "Descartada" };
export const INCIDENT_STATUS_STYLE: Record<IncidentStatus, string> = {
  abierta: "bg-st-late text-[#fff]", en_seguimiento: "bg-st-soon text-[#fff]", resuelta: "bg-st-ok text-[#fff]", descartada: "bg-slate-100 text-slate-500",
};
export const PRIORITY_LABEL: Record<Priority, string> = { baja: "Baja", media: "Media", alta: "Alta" };
export const PRIORITY_STYLE: Record<Priority, string> = { baja: "bg-slate-100 text-slate-600", media: "bg-st-pend text-black", alta: "bg-st-late text-[#fff]" };

/** ¿Sigue pendiente de cerrar? */
export const isOpen = (s: IncidentStatus) => s === "abierta" || s === "en_seguimiento";

/** Cambios al pasar a otro estado: cerrar fija la fecha de resolución (hoy por defecto); reabrir la quita. */
export function incidentStatusPatch(next: IncidentStatus, today: string, opened: string, date?: string | null): { status: IncidentStatus; resolved_on: string | null } {
  if (isOpen(next)) return { status: next, resolved_on: null };
  const d = date || today;
  return { status: next, resolved_on: d < opened ? opened : d };
}

/** Orden de trabajo: abiertas primero, luego por prioridad y antigüedad. */
export function sortIncidents<T extends Pick<Incident, "status" | "priority" | "opened_on">>(xs: T[]): T[] {
  const p: Record<Priority, number> = { alta: 0, media: 1, baja: 2 };
  return [...xs].sort((a, b) => Number(!isOpen(a.status)) - Number(!isOpen(b.status)) || p[a.priority] - p[b.priority] || a.opened_on.localeCompare(b.opened_on));
}

/** Días que lleva abierta (o que estuvo abierta). */
export function daysOpen(i: Pick<Incident, "opened_on" | "resolved_on">, today: string): number {
  return Math.max(0, Math.round((Date.parse(i.resolved_on ?? today) - Date.parse(i.opened_on)) / 86400000));
}
