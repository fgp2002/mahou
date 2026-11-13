import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer, supabaseService } from "@/lib/supabase/server";
import { EXTERNAL_ROLES, ROLES } from "@/lib/enterprise/roles";
import { madridDate, addDays } from "@/lib/domain/dates";

// Administración de Mahou Enterprise: usuarios, estructura, empresas, carteras y permisos individuales.
// Cada operación: 1) comprueba el permiso de quien la pide con SU sesión (la base de datos decide),
// 2) comprueba que el objetivo está dentro de su ámbito, 3) escribe con la clave de servicio y 4) deja auditoría.

const uuid = z.string().uuid();
const roleKey = z.enum(ROLES.map((r) => r.key) as [string, ...string[]]);
const PERM = /^[a-z_]+\.[a-z_]+$/;

const Op = z.discriminatedUnion("op", [
  z.object({ op: z.literal("create_user"), email: z.string().email().max(200), full_name: z.string().trim().min(2).max(120), role: roleKey,
    unit_id: uuid.nullable().optional(), organization_id: uuid.nullable().optional(), manager_id: uuid.nullable().optional(),
    position: z.string().max(120).optional(), phone: z.string().max(40).optional() }),
  z.object({ op: z.literal("update_user"), user_id: uuid, full_name: z.string().trim().min(2).max(120).optional(), role: roleKey.optional(),
    unit_id: uuid.nullable().optional(), manager_id: uuid.nullable().optional(), status: z.enum(["activo", "suspendido", "baja"]).optional(),
    position: z.string().max(120).nullable().optional(), phone: z.string().max(40).nullable().optional(), reason: z.string().trim().max(500).optional() }),
  z.object({ op: z.literal("reset_password"), user_id: uuid }),
  z.object({ op: z.literal("create_unit"), parent_id: uuid, kind: z.enum(["region", "zona", "equipo"]), name: z.string().trim().min(1).max(80) }),
  z.object({ op: z.literal("update_unit"), id: uuid, name: z.string().trim().min(1).max(80).optional(), active: z.boolean().optional() }),
  z.object({ op: z.literal("create_company"), name: z.string().trim().min(2).max(120), tax_id: z.string().max(20).optional(), notes: z.string().max(500).optional() }),
  z.object({ op: z.literal("update_company"), id: uuid, name: z.string().trim().min(2).max(120).optional(), active: z.boolean().optional() }),
  z.object({ op: z.literal("set_store_unit"), store_ids: z.array(uuid).min(1).max(5000), unit_id: uuid }),
  z.object({ op: z.literal("assign"), store_ids: z.array(uuid).min(1).max(2000), user_id: uuid.optional(), company_id: uuid.optional(),
    function: z.enum(["gpv", "reponedor", "servicio"]), replace: z.boolean().optional() }),
  z.object({ op: z.literal("unassign"), ids: z.array(uuid).min(1).max(2000) }),
  z.object({ op: z.literal("grant"), user_id: uuid, permission: z.string().regex(PERM), effect: z.enum(["allow", "deny"]),
    unit_id: uuid.nullable().optional(), store_id: uuid.nullable().optional(), valid_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), reason: z.string().trim().min(3).max(500) }),
  z.object({ op: z.literal("revoke"), id: uuid, reason: z.string().trim().min(3).max(500) }),
]);
type OpT = z.infer<typeof Op>;

const NEEDS: Record<OpT["op"], string[]> = {
  create_user: ["usuarios.crear"], update_user: ["usuarios.editar"], reset_password: ["usuarios.editar"],
  create_unit: ["estructura.crear"], update_unit: ["estructura.editar"], create_company: ["empresas.crear"], update_company: ["empresas.editar"],
  set_store_unit: ["estructura.editar"], assign: ["carteras.asignar"], unassign: ["carteras.asignar"], grant: ["usuarios.asignar"], revoke: ["usuarios.asignar"],
};

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

function tempPassword() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const r = crypto.getRandomValues(new Uint32Array(14));
  return "Mh-" + Array.from(r, (x) => a[x % a.length]).join("");
}

export async function POST(req: Request) {
  const parsed = Op.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, "Datos no válidos: " + parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; "));
  const b = parsed.data;
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return fail(401, "No autenticado");
  const actor = u.user.id;

  // 1) Permiso, decidido por la base de datos con la sesión de quien pide.
  for (const p of NEEDS[b.op]) {
    const { data: ok } = await sb.rpc("has_perm", { p });
    if (!ok) return fail(403, "Tu perfil no tiene permiso para esta operación");
  }
  const { data: ctx } = await sb.rpc("my_context");
  const c = ctx as { is_owner: boolean; data_owner: string; organization: { id: string; kind: string } | null; member: { organization_id: string } | null } | null;
  if (!c?.organization) return fail(400, "Tu usuario no pertenece a ninguna organización");
  const ownOrg = c.organization.kind === "propietaria" ? c.organization.id : null;

  let admin: ReturnType<typeof supabaseService>;
  try { admin = supabaseService(); } catch { return fail(500, "Falta configurar la clave de servicio en el servidor"); }
  const audit = (action: string, detail: Record<string, unknown>, extra: { target_user?: string; entity?: string; entity_id?: string; reason?: string } = {}) =>
    admin.from("access_audit").insert({ organization_id: c.organization!.id, actor, action, detail, ...extra });

  // Unidades y empresas de MI organización (se leen con mi sesión: solo veo las de mi ámbito).
  const visibleUnit = async (id: string) => !!(await sb.from("org_units").select("id").eq("id", id).maybeSingle()).data;
  const visibleMember = async (id: string) => (await sb.from("members").select("user_id,role,organization_id,status,full_name").eq("user_id", id).maybeSingle()).data;
  const visibleStores = async (ids: string[]) => {
    const ok = new Set<string>();
    for (let i = 0; i < ids.length; i += 300) {
      const { data } = await sb.from("stores").select("id").in("id", ids.slice(i, i + 300));
      for (const r of data ?? []) ok.add(r.id);
    }
    return ok;
  };

  switch (b.op) {
    case "create_user": {
      if (!ownOrg) return fail(403, "Solo la organización propietaria da de alta usuarios");
      const external = EXTERNAL_ROLES.includes(b.role as never);
      let orgId = ownOrg;
      if (external) {
        if (!b.organization_id) return fail(400, "Elige la empresa externa a la que pertenece");
        const { data: comp } = await sb.from("organizations").select("id,kind,parent_org_id").eq("id", b.organization_id).maybeSingle();
        if (!comp || comp.kind !== "externa" || comp.parent_org_id !== ownOrg) return fail(400, "Empresa externa no válida");
        orgId = comp.id;
      } else if (b.organization_id && b.organization_id !== ownOrg) return fail(400, "Un perfil interno pertenece a tu organización");
      if (b.unit_id && !(await visibleUnit(b.unit_id))) return fail(403, "Esa unidad no está en tu ámbito");
      if (b.manager_id && !(await visibleMember(b.manager_id))) return fail(403, "Ese responsable no está en tu ámbito");
      if (!c.is_owner && b.role === "administrador") return fail(403, "Solo el propietario crea administradores");
      const password = tempPassword();
      const { data: created, error } = await admin.auth.admin.createUser({ email: b.email.toLowerCase(), password, email_confirm: true, user_metadata: { name: b.full_name } });
      if (error || !created.user) return fail(error?.message?.includes("already") ? 409 : 500, error?.message?.includes("already") ? "Ya existe un usuario con ese correo" : "No se pudo crear el usuario: " + (error?.message ?? ""));
      const id = created.user.id;
      const { error: e2 } = await admin.from("members").insert({ user_id: id, organization_id: orgId, full_name: b.full_name, email: b.email.toLowerCase(), role: b.role,
        unit_id: b.unit_id ?? null, manager_id: b.manager_id ?? null, position: b.position || null, phone: b.phone || null });
      if (e2) { await admin.auth.admin.deleteUser(id); return fail(500, "No se pudo registrar el usuario: " + e2.message); }
      // Ajustes de jornada iniciales: los de la organización.
      const { data: base } = await admin.from("user_settings").select("timezone,work_start,work_end,route_start,transport,visit_durations,planning_prefs,tracking_start,checklist").eq("owner_id", c.data_owner).maybeSingle();
      await admin.from("user_settings").upsert({ owner_id: id, ...(base ?? {}) }, { onConflict: "owner_id" });
      await admin.from("profiles").upsert({ id, display_name: b.full_name }, { onConflict: "id" });
      await audit("usuario_creado", { email: b.email.toLowerCase(), role: b.role, unit_id: b.unit_id ?? null, organization_id: orgId }, { target_user: id, entity: "members", entity_id: id });
      return NextResponse.json({ ok: true, user_id: id, password });
    }
    case "update_user": {
      const m = await visibleMember(b.user_id);
      if (!m) return fail(404, "Usuario no encontrado en tu ámbito");
      if (b.user_id === actor && (b.role || b.status)) return fail(400, "No puedes cambiar tu propio perfil ni tu estado");
      const { data: own } = await admin.from("organizations").select("owner_user_id").eq("owner_user_id", b.user_id).maybeSingle();
      if (own && b.user_id !== actor) return fail(403, "El propietario de la organización no se puede modificar");
      if (b.role === "administrador" && !c.is_owner) return fail(403, "Solo el propietario asigna el perfil de administrador");
      if (b.role && EXTERNAL_ROLES.includes(b.role as never) !== EXTERNAL_ROLES.includes(m.role as never)) return fail(400, "Un usuario interno no puede pasar a un perfil de empresa externa (ni al revés): da de alta un usuario nuevo");
      if (b.unit_id && !(await visibleUnit(b.unit_id))) return fail(403, "Esa unidad no está en tu ámbito");
      if (b.manager_id && (b.manager_id === b.user_id || !(await visibleMember(b.manager_id)))) return fail(400, "Responsable no válido");
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const k of ["full_name", "role", "unit_id", "manager_id", "status", "position", "phone"] as const) if (b[k] !== undefined) patch[k] = b[k];
      if (b.status === "baja") patch.valid_to = madridDate();
      if (b.status === "activo") patch.valid_to = null;
      const { data: before } = await admin.from("members").select("*").eq("user_id", b.user_id).single();
      const { error } = await admin.from("members").update(patch).eq("user_id", b.user_id);
      if (error) return fail(500, error.message);
      if (b.status && b.status !== m.status) await admin.auth.admin.updateUserById(b.user_id, { ban_duration: b.status === "activo" ? "none" : "876000h" });
      if (b.status === "baja") {
        // Al dar de baja, su cartera queda libre (se cierra con fecha de ayer) para reasignarla.
        await admin.from("store_assignments").update({ valid_to: addDays(madridDate(), -1) }).eq("user_id", b.user_id).is("valid_to", null);
      }
      const changes = Object.fromEntries(Object.entries(patch).filter(([k]) => k !== "updated_at").map(([k, v]) => [k, { de: (before as Record<string, unknown>)?.[k] ?? null, a: v }]));
      await audit(b.status && b.status !== m.status ? `usuario_${b.status}` : b.role && b.role !== m.role ? "rol_cambiado" : "usuario_editado", changes, { target_user: b.user_id, entity: "members", entity_id: b.user_id, reason: b.reason });
      return NextResponse.json({ ok: true });
    }
    case "reset_password": {
      const m = await visibleMember(b.user_id);
      if (!m) return fail(404, "Usuario no encontrado en tu ámbito");
      if (b.user_id === actor) return fail(400, "Cambia tu propia contraseña desde Ajustes");
      const password = tempPassword();
      const { error } = await admin.auth.admin.updateUserById(b.user_id, { password });
      if (error) return fail(500, error.message);
      await audit("contrasena_restablecida", {}, { target_user: b.user_id });
      return NextResponse.json({ ok: true, password });
    }
    case "create_unit": {
      if (!(await visibleUnit(b.parent_id))) return fail(403, "Unidad superior no válida");
      const { data: parent } = await admin.from("org_units").select("organization_id,kind").eq("id", b.parent_id).single();
      const order = ["pais", "region", "zona", "equipo"];
      if (order.indexOf(b.kind) <= order.indexOf(parent!.kind)) return fail(400, "El tipo de unidad no encaja bajo la unidad superior");
      const { data, error } = await admin.from("org_units").insert({ organization_id: parent!.organization_id, parent_id: b.parent_id, kind: b.kind, name: b.name }).select("id").single();
      if (error) return fail(500, error.message);
      await audit("unidad_creada", { name: b.name, kind: b.kind, parent_id: b.parent_id }, { entity: "org_units", entity_id: data.id });
      return NextResponse.json({ ok: true, id: data.id });
    }
    case "update_unit": {
      if (!(await visibleUnit(b.id))) return fail(403, "Unidad no válida");
      const patch: Record<string, unknown> = {};
      if (b.name) patch.name = b.name;
      if (b.active !== undefined) patch.active = b.active;
      const { error } = await admin.from("org_units").update(patch).eq("id", b.id);
      if (error) return fail(500, error.message);
      await audit("unidad_editada", patch, { entity: "org_units", entity_id: b.id });
      return NextResponse.json({ ok: true });
    }
    case "create_company": {
      if (!ownOrg) return fail(403, "Solo la organización propietaria registra empresas externas");
      const { data, error } = await admin.from("organizations").insert({ name: b.name, kind: "externa", parent_org_id: ownOrg, tax_id: b.tax_id || null, notes: b.notes || null }).select("id").single();
      if (error) return fail(500, error.message);
      await audit("empresa_creada", { name: b.name }, { entity: "organizations", entity_id: data.id });
      return NextResponse.json({ ok: true, id: data.id });
    }
    case "update_company": {
      const { data: comp } = await sb.from("organizations").select("id,kind,parent_org_id").eq("id", b.id).maybeSingle();
      if (!comp || comp.kind !== "externa" || comp.parent_org_id !== ownOrg) return fail(403, "Empresa no válida");
      const patch: Record<string, unknown> = {};
      if (b.name) patch.name = b.name;
      if (b.active !== undefined) patch.active = b.active;
      const { error } = await admin.from("organizations").update(patch).eq("id", b.id);
      if (error) return fail(500, error.message);
      await audit(b.active === false ? "empresa_desactivada" : "empresa_editada", patch, { entity: "organizations", entity_id: b.id });
      return NextResponse.json({ ok: true });
    }
    case "set_store_unit": {
      if (!(await visibleUnit(b.unit_id))) return fail(403, "Unidad no válida");
      const ok = await visibleStores(b.store_ids);
      if (ok.size !== new Set(b.store_ids).size) return fail(403, "Alguna tienda no está en tu ámbito");
      for (let i = 0; i < b.store_ids.length; i += 300) {
        const { error } = await admin.from("stores").update({ unit_id: b.unit_id }).in("id", b.store_ids.slice(i, i + 300)).eq("owner_id", c.data_owner);
        if (error) return fail(500, error.message);
      }
      await audit("tiendas_a_unidad", { unit_id: b.unit_id, tiendas: b.store_ids.length }, { entity: "org_units", entity_id: b.unit_id });
      return NextResponse.json({ ok: true, updated: b.store_ids.length });
    }
    case "assign": {
      if (!!b.user_id === !!b.company_id) return fail(400, "Elige una persona o una empresa");
      if (b.user_id) {
        const m = await visibleMember(b.user_id);
        if (!m || m.status !== "activo") return fail(403, "Persona no válida o fuera de tu ámbito");
      } else {
        const { data: comp } = await sb.from("organizations").select("id,kind,active").eq("id", b.company_id!).maybeSingle();
        if (!comp || comp.kind !== "externa" || !comp.active) return fail(403, "Empresa no válida");
      }
      const ids = [...new Set(b.store_ids)];
      const ok = await visibleStores(ids);
      if (ok.size !== ids.length) return fail(403, "Alguna tienda no está en tu ámbito");
      const today = madridDate();
      const { data: current } = await admin.from("store_assignments").select("id,store_id,user_id,company_id,valid_from").in("store_id", ids).eq("function", b.function).or(`valid_to.is.null,valid_to.gte.${today}`);
      const already = new Set((current ?? []).filter((a) => (b.user_id ? a.user_id === b.user_id : a.company_id === b.company_id)).map((a) => a.store_id));
      if (b.replace) {
        // Reasignar: se cierra la asignación anterior (queda en el histórico) y se abre la nueva.
        const close = (current ?? []).filter((a) => !already.has(a.store_id));
        for (const a of close) await admin.from("store_assignments").update({ valid_to: a.valid_from >= today ? a.valid_from : addDays(today, -1) }).eq("id", a.id);
      }
      const rows = ids.filter((id) => !already.has(id)).map((store_id) => ({ store_id, user_id: b.user_id ?? null, company_id: b.company_id ?? null, function: b.function, valid_from: today, created_by: actor }));
      if (rows.length) { const { error } = await admin.from("store_assignments").insert(rows); if (error) return fail(500, error.message); }
      await audit("cartera_asignada", { tiendas: rows.length, funcion: b.function, reemplaza: !!b.replace, company_id: b.company_id ?? null }, { target_user: b.user_id, entity: "store_assignments" });
      return NextResponse.json({ ok: true, added: rows.length, skipped: ids.length - rows.length });
    }
    case "unassign": {
      const { data: rows } = await sb.from("store_assignments").select("id,store_id,user_id,company_id,valid_from").in("id", b.ids);
      if ((rows ?? []).length !== new Set(b.ids).size) return fail(403, "Alguna asignación no está en tu ámbito");
      const today = madridDate();
      for (const a of rows ?? []) await admin.from("store_assignments").update({ valid_to: a.valid_from >= today ? a.valid_from : addDays(today, -1) }).eq("id", a.id);
      await audit("cartera_retirada", { asignaciones: b.ids.length }, { target_user: rows?.[0]?.user_id ?? undefined, entity: "store_assignments" });
      return NextResponse.json({ ok: true });
    }
    case "grant": {
      const m = await visibleMember(b.user_id);
      if (!m) return fail(404, "Usuario no encontrado en tu ámbito");
      if (b.user_id === actor) return fail(400, "No puedes concederte permisos a ti mismo");
      if (b.effect === "allow") {
        // Nadie concede lo que no tiene.
        const { data: has } = await sb.rpc("has_perm", { p: b.permission });
        if (!has) return fail(403, "No puedes conceder un permiso que tú no tienes");
      }
      if (b.unit_id && !(await visibleUnit(b.unit_id))) return fail(403, "Unidad no válida");
      if (b.store_id && !(await visibleStores([b.store_id])).size) return fail(403, "Tienda no válida");
      const { data, error } = await admin.from("permission_grants").insert({ user_id: b.user_id, permission: b.permission, effect: b.effect, unit_id: b.unit_id ?? null, store_id: b.store_id ?? null,
        valid_to: b.valid_to ? `${b.valid_to}T23:59:59+01:00` : null, reason: b.reason, granted_by: actor }).select("id").single();
      if (error) return fail(500, error.message);
      await audit(b.effect === "allow" ? "permiso_concedido" : "permiso_denegado", { permiso: b.permission, unit_id: b.unit_id ?? null, store_id: b.store_id ?? null, hasta: b.valid_to ?? null }, { target_user: b.user_id, entity: "permission_grants", entity_id: data.id, reason: b.reason });
      return NextResponse.json({ ok: true, id: data.id });
    }
    case "revoke": {
      const { data: g } = await sb.from("permission_grants").select("id,user_id,permission,revoked_at").eq("id", b.id).maybeSingle();
      if (!g) return fail(404, "Permiso no encontrado en tu ámbito");
      if (g.revoked_at) return NextResponse.json({ ok: true });
      const { error } = await admin.from("permission_grants").update({ revoked_at: new Date().toISOString(), revoked_by: actor }).eq("id", b.id);
      if (error) return fail(500, error.message);
      await audit("permiso_retirado", { permiso: g.permission }, { target_user: g.user_id, entity: "permission_grants", entity_id: b.id, reason: b.reason });
      return NextResponse.json({ ok: true });
    }
  }
}
