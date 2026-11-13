// Roles, módulos y acciones de Mahou Enterprise. La seguridad real está en la base de datos (RLS y has_perm);
// esto solo decide qué se enseña en pantalla. Sin dependencias de servidor: se usa en cliente y servidor.

export const ROLES = [
  { key: "administrador", name: "Administrador de plataforma", short: "Administrador" },
  { key: "direccion_nacional", name: "Dirección nacional", short: "Dir. nacional" },
  { key: "direccion_regional", name: "Dirección regional", short: "Dir. regional" },
  { key: "jefe_comercial", name: "Jefe comercial", short: "Jefe comercial" },
  { key: "jefe_gpv", name: "Jefe de GPV", short: "Jefe GPV" },
  { key: "gpv", name: "GPV", short: "GPV" },
  { key: "reponedor", name: "Reponedor Mahou", short: "Reponedor" },
  { key: "supervisor_conveniencia", name: "Supervisor de conveniencia", short: "Sup. conveniencia" },
  { key: "reponedor_conveniencia", name: "Reponedor de conveniencia", short: "Rep. conveniencia" },
  { key: "analista", name: "Analista / auditor", short: "Analista" },
] as const;
export type RoleKey = (typeof ROLES)[number]["key"];
export const EXTERNAL_ROLES: RoleKey[] = ["supervisor_conveniencia", "reponedor_conveniencia"];
export const roleName = (k: string | null | undefined) => ROLES.find((r) => r.key === k)?.name ?? (k ?? "—");
export const roleShort = (k: string | null | undefined) => ROLES.find((r) => r.key === k)?.short ?? (k ?? "—");

export const MODULES = [
  ["panel", "Panel"], ["tiendas", "Tiendas"], ["contactos", "Contactos"], ["visitas", "Visitas"], ["rutas", "Rutas"],
  ["inventario", "Inventario"], ["tareas", "Tareas"], ["incidencias", "Incidencias"], ["fotos", "Fotos"], ["acuerdos", "Acuerdos"],
  ["pagos", "Pagos"], ["informes", "Informes"], ["usuarios", "Usuarios"], ["carteras", "Carteras"], ["estructura", "Estructura"],
  ["catalogos", "Catálogos"], ["empresas", "Empresas externas"], ["auditoria", "Auditoría"],
] as const;
export const ACTIONS = [
  ["consultar", "Consultar"], ["crear", "Crear"], ["editar", "Editar"], ["eliminar", "Eliminar"], ["asignar", "Asignar"],
  ["aprobar", "Aprobar"], ["validar", "Validar"], ["exportar", "Exportar"], ["administrar", "Administrar"],
] as const;
export const moduleName = (m: string) => MODULES.find(([k]) => k === m)?.[1] ?? m;
export const actionName = (a: string) => ACTIONS.find(([k]) => k === a)?.[1] ?? a;
export const permLabel = (p: string) => { const [m, a] = p.split("."); return `${moduleName(m)} · ${actionName(a)}`; };

const IMPLIED = new Set(["consultar", "crear", "editar", "eliminar", "asignar"]);
/** Igual que has_perm() en la base de datos: «administrar» incluye las acciones básicas; «todo.todo» es el propietario. */
export function can(perms: readonly string[] | Set<string>, p: string): boolean {
  const s = perms instanceof Set ? perms : new Set(perms);
  if (s.has("todo.todo") || s.has(p)) return true;
  const [m, a] = p.split(".");
  return IMPLIED.has(a) && s.has(`${m}.administrar`);
}

export const UNIT_KINDS = [["pais", "País"], ["region", "Región"], ["zona", "Zona"], ["equipo", "Equipo"]] as const;
export const unitKindName = (k: string) => UNIT_KINDS.find(([x]) => x === k)?.[1] ?? k;
export const childKind = (k: string) => ({ pais: "region", region: "zona", zona: "equipo" } as Record<string, string>)[k] ?? null;

export const TASK_KINDS = [
  ["revisar_nevera", "Revisar nevera"], ["reponer", "Reponer"], ["fotografiar", "Hacer fotografías"], ["revisar_exposicion", "Revisar exposición"],
  ["comprobar_material", "Comprobar material"], ["reparar", "Reparar"], ["visitar", "Visitar tienda"], ["verificar_instalacion", "Verificar instalación"], ["otra", "Otra"],
] as const;
export const TASK_STATUS: Record<string, { label: string; tone: string }> = {
  pendiente: { label: "Pendiente", tone: "bg-slate-100 text-slate-700" },
  asignada: { label: "Asignada", tone: "bg-brand-50 text-brand-700" },
  en_curso: { label: "En curso", tone: "bg-amber-50 text-amber-800" },
  completada: { label: "Completada", tone: "bg-green-100 text-green-700" },
  pendiente_validacion: { label: "Por validar", tone: "bg-orange-100 text-orange-800" },
  validada: { label: "Validada", tone: "bg-green-600 text-[#fff]" },
  rechazada: { label: "Rechazada", tone: "bg-red-100 text-red-700" },
  cancelada: { label: "Cancelada", tone: "bg-slate-100 text-slate-500" },
};
export const taskKindName = (k: string) => TASK_KINDS.find(([x]) => x === k)?.[1] ?? k;

export interface Me {
  userId: string;
  role: RoleKey | null;
  isOwner: boolean;
  dataOwner: string;
  name: string;
  orgId: string | null;
  orgName: string | null;
  orgKind: "propietaria" | "externa" | null;
  unitId: string | null;
  unitName: string | null;
  permissions: string[];
  /** Desde cuándo se controla el cumplimiento en la organización (ajuste del propietario). */
  trackingStart: string | null;
}
