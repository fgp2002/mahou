import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { UsersAdmin } from "@/components/enterprise/UsersAdmin";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe } from "@/lib/server/me";
import { loadOrg, unitPath } from "@/lib/server/scope";
import { can } from "@/lib/enterprise/roles";

export const metadata = { title: "Usuarios · Mahou" };

export default async function UsersPage() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (!can(me.permissions, "usuarios.consultar")) return <p className="text-sm text-slate-500">Tu perfil no tiene acceso a la gestión de usuarios.</p>;
  const sb = await supabaseServer();
  const [org, { data: grants }, { data: assigns }, { data: owners }] = await Promise.all([
    loadOrg(),
    sb.from("permission_grants").select("id,user_id,permission,effect,unit_id,store_id,valid_from,valid_to,reason,granted_by,created_at,revoked_at").is("revoked_at", null).order("created_at", { ascending: false }),
    sb.from("store_assignments").select("user_id,valid_from,valid_to").not("user_id", "is", null).limit(20000),
    sb.from("organizations").select("owner_user_id").eq("kind", "propietaria"),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const portfolio: Record<string, number> = {};
  for (const a of assigns ?? []) if (a.valid_from <= today && (!a.valid_to || a.valid_to >= today)) portfolio[a.user_id!] = (portfolio[a.user_id!] ?? 0) + 1;
  const ownerIds = (owners ?? []).map((o) => o.owner_user_id).filter(Boolean) as string[];
  return (
    <div className="space-y-5">
      <PageHeader title="Usuarios" count={org.members.filter((m) => m.status === "activo").length} subtitle="Personas con acceso, su perfil, su ámbito y sus permisos individuales" />
      <UsersAdmin
        me={{ id: me.userId, perms: me.permissions, isOwner: me.isOwner }}
        members={org.members} ownerIds={ownerIds}
        units={org.units.map((u) => ({ id: u.id, name: unitPath(org.units, u.id), kind: u.kind, active: u.active }))}
        companies={org.orgs.filter((o) => o.kind === "externa").map((o) => ({ id: o.id, name: o.name, active: o.active }))}
        grants={grants ?? []} portfolio={portfolio} />
    </div>
  );
}
