// Inventario comercial: tipos, estados y reglas puras (sin red), compartidas por la ficha, la visita y el inventario general.

export type EquipmentStatus = "pendiente_instalacion" | "instalado" | "activo" | "deteriorado" | "pendiente_revision" | "retirado";

export interface Equipment {
  id: string;
  store_id: string;
  type_id: string;
  code: string | null;
  name: string | null;
  brand_id: string | null;
  brand_name: string | null;
  quantity: number;
  location: string | null;
  status: EquipmentStatus;
  installed_on: string | null;
  installed_on_estimated: boolean;
  removed_on: string | null;
  last_reviewed_at: string | null;
  reference_amount: number | null;
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
  legacy_concept_id?: string | null;
}

export interface EquipmentEvent {
  id: string;
  equipment_id: string;
  event_type: "alta" | "instalacion" | "cambio_estado" | "revision" | "modificacion" | "retirada" | "papelera" | "restaurado";
  from_status: EquipmentStatus | null;
  to_status: EquipmentStatus | null;
  changes: Record<string, [unknown, unknown]> | null;
  visit_id: string | null;
  note: string | null;
  occurred_on: string;
  created_at: string;
}

export const EQUIPMENT_COLS =
  "id,store_id,type_id,code,name,brand_id,brand_name,quantity,location,status,installed_on,installed_on_estimated,removed_on,last_reviewed_at,reference_amount,notes,deleted_at,created_at,legacy_concept_id";

export const STATUS_LABEL: Record<EquipmentStatus, string> = {
  pendiente_instalacion: "Pendiente de instalación",
  instalado: "Instalado",
  activo: "Activo",
  deteriorado: "Deteriorado",
  pendiente_revision: "Pendiente de revisión",
  retirado: "Retirado",
};

/** Orden en el que se ofrecen los estados. */
export const STATUS_ORDER: EquipmentStatus[] = ["pendiente_instalacion", "instalado", "activo", "deteriorado", "pendiente_revision", "retirado"];

/** Colores de estado (mismos tonos que el resto de la app). */
export const STATUS_STYLE: Record<EquipmentStatus, string> = {
  pendiente_instalacion: "bg-slate-200 text-slate-700",
  instalado: "bg-brand-50 text-brand-700",
  activo: "bg-st-ok text-[#fff]",
  deteriorado: "bg-st-late text-[#fff]",
  pendiente_revision: "bg-st-soon text-[#fff]",
  retirado: "bg-slate-100 text-slate-500",
};

export const STATUS_HINT: Record<EquipmentStatus, string> = {
  pendiente_instalacion: "Acordado o pedido, todavía no está en la tienda.",
  instalado: "Colocado en la tienda, aún sin contraprestación en marcha.",
  activo: "En uso y con acuerdo o pago vigente.",
  deteriorado: "Está, pero dañado o en mal estado.",
  pendiente_revision: "Hay que comprobarlo en la próxima visita.",
  retirado: "Ya no está en la tienda. Se conserva su historial.",
};

export type EquipmentGroup = "actuales" | "revisar" | "retirados";

/** Pestaña de la ficha en la que aparece cada elemento. */
export function groupOf(status: EquipmentStatus): EquipmentGroup {
  if (status === "retirado") return "retirados";
  if (status === "pendiente_instalacion" || status === "deteriorado" || status === "pendiente_revision") return "revisar";
  return "actuales";
}

/** ¿Sigue físicamente (o pendiente de estar) en la tienda? Los retirados no cuentan como instalados. */
export const isPresent = (s: EquipmentStatus) => s !== "retirado" && s !== "pendiente_instalacion";

/** Nombre a mostrar: el propio, o el tipo + marca. */
export function equipmentTitle(e: Pick<Equipment, "name" | "brand_name">, typeName: string): string {
  const base = e.name?.trim() || typeName;
  return e.brand_name && !base.toLowerCase().includes(e.brand_name.toLowerCase()) ? `${base} · ${e.brand_name}` : base;
}

/**
 * Cambios necesarios al pasar a un estado nuevo: la fecha de retirada se pide al retirar y se limpia al reponer;
 * la de instalación se rellena (con hoy) al instalar algo que estaba pendiente.
 */
export function statusPatch(current: Pick<Equipment, "status" | "installed_on" | "removed_on">, next: EquipmentStatus, today: string, date?: string | null): Partial<Equipment> {
  const patch: Partial<Equipment> = { status: next };
  if (next === "retirado") patch.removed_on = date || current.removed_on || today;
  else if (current.status === "retirado") patch.removed_on = null;
  if ((next === "instalado" || next === "activo") && (current.status === "pendiente_instalacion" || !current.installed_on)) {
    patch.installed_on = date || current.installed_on || today;
    patch.installed_on_estimated = false;
  }
  return patch;
}

/** Valida los datos editables de un elemento. Devuelve un mensaje de error o null. */
export function validateEquipment(v: { quantity: number; installed_on: string | null; removed_on: string | null; reference_amount: number | null }): string | null {
  if (!Number.isInteger(v.quantity) || v.quantity < 1 || v.quantity > 100000) return "La cantidad debe ser un número entero mayor que cero.";
  if (v.reference_amount != null && (!Number.isFinite(v.reference_amount) || v.reference_amount < 0)) return "El importe no es válido.";
  if (v.installed_on && v.removed_on && v.removed_on < v.installed_on) return "La retirada no puede ser anterior a la instalación.";
  return null;
}

/** Ubicaciones habituales dentro de una tienda (se puede escribir cualquier otra). */
export const LOCATION_SUGGESTIONS = ["Entrada", "Zona de cajas", "Pasillo de bebidas", "Sección de frío", "Cabecera de pasillo", "Lineal de cervezas", "Almacén"];

const FIELD_LABEL: Record<string, string> = {
  name: "Nombre", type_id: "Tipo", brand_name: "Marca", quantity: "Cantidad", location: "Ubicación",
  installed_on: "Instalación", removed_on: "Retirada", reference_amount: "Importe de referencia", notes: "Observaciones",
};

/** Texto legible de un suceso del historial. */
export function describeEvent(ev: Pick<EquipmentEvent, "event_type" | "from_status" | "to_status" | "changes" | "note">): string {
  const st = (s: EquipmentStatus | null) => (s ? STATUS_LABEL[s] ?? s : "—");
  switch (ev.event_type) {
    case "alta": return ev.note ?? `Alta (${st(ev.to_status)})`;
    case "instalacion": return "Instalado";
    case "retirada": return "Retirado";
    case "revision": return "Revisado";
    case "papelera": return "Enviado a la papelera";
    case "restaurado": return "Recuperado de la papelera";
    case "cambio_estado": return `Estado: ${st(ev.from_status)} → ${st(ev.to_status)}`;
    case "modificacion": {
      const keys = Object.keys(ev.changes ?? {}).filter((k) => k !== "type_id");
      return keys.length ? `Cambios: ${keys.map((k) => FIELD_LABEL[k] ?? k).join(", ")}` : "Datos modificados";
    }
  }
}
