import { redirect } from "next/navigation";
import { PageHeader, EmptyState } from "@/components/ui";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe } from "@/lib/server/me";
import { loadOrg } from "@/lib/server/scope";
import { can, permLabel, roleName } from "@/lib/enterprise/roles";

export const metadata = { title: "Auditoría · Mahou" };

const ACTION: Record<string, string> = {
  organizacion_creada: "Creó la organización", usuario_creado: "Dio de alta a", usuario_editado: "Editó a", rol_cambiado: "Cambió el perfil de",
  usuario_suspendido: "Suspendió el acceso de", usuario_baja: "Dio de baja a", usuario_activo: "Reactivó a", contrasena_restablecida: "Restableció la contraseña de",
  unidad_creada: "Creó la unidad", unidad_editada: "Editó una unidad", empresa_creada: "Registró la empresa", empresa_editada: "Editó una empresa", empresa_desactivada: "Desactivó una empresa",
  tiendas_a_unidad: "Movió tiendas de unidad", cartera_asignada: "Asignó cartera a", cartera_retirada: "Retiró tiendas de la cartera de",
  permiso_concedido: "Concedió un permiso a", permiso_denegado: "Denegó un permiso a", permiso_retirado: "Retiró un permiso a",
};

function detail(action: string, d: Record<string, unknown>): string {
  if (d.permiso) return `${permLabel(String(d.permiso))}${d.hasta ? ` hasta el ${String(d.hasta)}` : ""}`;
  if (action === "usuario_creado") return `${roleName(String(d.role ?? ""))} · ${d.email ?? ""}`;
  if (action === "rol_cambiado" && d.role && typeof d.role === "object") { const r = d.role as { de: string; a: string }; return `${roleName(r.de)} → ${roleName(r.a)}`; }
  if (d.tiendas != null) return `${d.tiendas} tiendas`;
  if (d.name) return String(d.name);
  return "";
}

export default async function AuditPage() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (!can(me.permissions, "auditoria.consultar")) return <p className="text-sm text-slate-500">Tu perfil no tiene acceso a la auditoría.</p>;
  const sb = await supabaseServer();
  const [{ data }, org] = await Promise.all([sb.from("access_audit").select("id,actor,action,target_user,detail,reason,created_at").order("created_at", { ascending: false }).limit(500), loadOrg()]);
  const name = (id: string | null) => (id ? org.members.find((m) => m.user_id === id)?.full_name ?? "Usuario" : "");
  const rows = data ?? [];
  return (
    <div className="space-y-5">
      <PageHeader title="Auditoría" count={rows.length} subtitle="Altas, bajas, perfiles, carteras y permisos: quién, cuándo y por qué. No se puede modificar ni borrar." />
      {rows.length === 0 ? <div className="card"><EmptyState title="Sin movimientos" /></div> : (
        <ol className="card divide-y divide-slate-200 !py-1">
          {rows.map((r) => (
            <li key={r.id} className="grid gap-0.5 py-3 text-sm sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
              <time className="text-xs text-slate-500 sm:pt-0.5">{new Date(r.created_at).toLocaleString("es-ES", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" })}</time>
              <span className="min-w-0">
                <b>{name(r.actor) || "Sistema"}</b> {ACTION[r.action] ?? r.action} {r.target_user && <b>{name(r.target_user)}</b>}
                {detail(r.action, (r.detail ?? {}) as Record<string, unknown>) && <span className="text-slate-600"> · {detail(r.action, (r.detail ?? {}) as Record<string, unknown>)}</span>}
                {r.reason && <span className="block text-xs text-slate-500">Motivo: {r.reason}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
