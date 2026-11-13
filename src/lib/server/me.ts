import { cache } from "react";
import { supabaseServer } from "../supabase/server";
import { can, type Me, type RoleKey } from "../enterprise/roles";

/** Quién es la persona conectada: rol, organización, unidad y permisos efectivos (una sola consulta por petición). */
export const getMe = cache(async (): Promise<Me | null> => {
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("my_context");
  if (error || !data?.user_id) {
    // Sin la estructura de organización (p. ej. base de datos aún sin migrar): la app funciona como antes.
    // La seguridad no depende de esto, la aplica la base de datos.
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return null;
    return { userId: u.user.id, role: null, isOwner: true, dataOwner: u.user.id, name: "", orgId: null, orgName: null, orgKind: null, unitId: null, unitName: null, permissions: ["todo.todo"], trackingStart: null };
  }
  const c = data as {
    user_id: string; role: string | null; is_owner: boolean; tracking_start: string | null; data_owner: string; permissions: string[] | null;
    member: { full_name: string; organization_id: string; unit_id: string | null } | null;
    organization: { id: string; name: string; kind: "propietaria" | "externa" } | null; unit: { id: string; name: string } | null;
  };
  return {
    userId: c.user_id, role: (c.role as RoleKey) ?? null, isOwner: !!c.is_owner, dataOwner: c.data_owner,
    name: c.member?.full_name ?? "", orgId: c.organization?.id ?? null, orgName: c.organization?.name ?? null, orgKind: c.organization?.kind ?? null,
    unitId: c.unit?.id ?? null, unitName: c.unit?.name ?? null, permissions: c.permissions ?? [], trackingStart: c.tracking_start ?? null,
  };
});

export async function meCan(p: string) {
  const me = await getMe();
  return !!me && can(me.permissions, p);
}
