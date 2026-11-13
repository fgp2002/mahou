"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Copy, KeyRound, Plus, Search, ShieldMinus, ShieldPlus } from "lucide-react";
import { ACTIONS, can, EXTERNAL_ROLES, MODULES, permLabel, ROLES, roleName, roleShort } from "@/lib/enterprise/roles";
import { dmy } from "@/lib/format";
import { Sheet } from "../Sheet";
import { toast } from "../Toast";
import { EmptyState } from "../ui";
import { adminOp } from "./adminApi";

interface Member { user_id: string; full_name: string; email: string | null; position: string | null; phone: string | null; role: string; unit_id: string | null; manager_id: string | null; status: string; organization_id: string; valid_from: string; valid_to: string | null }
interface Grant { id: string; user_id: string; permission: string; effect: string; unit_id: string | null; store_id: string | null; valid_from: string; valid_to: string | null; reason: string; granted_by: string; created_at: string }
interface UnitOpt { id: string; name: string; kind: string; active: boolean }
interface Company { id: string; name: string; active: boolean }
interface Me { id: string; perms: string[]; isOwner: boolean }

const STATUS: Record<string, string> = { activo: "bg-green-100 text-green-700", suspendido: "bg-amber-50 text-amber-800", baja: "bg-slate-100 text-slate-500" };
const STATUS_L: Record<string, string> = { activo: "Activo", suspendido: "Suspendido", baja: "Baja" };

export function UsersAdmin({ me, members, ownerIds, units, companies, grants, portfolio }: {
  me: Me; members: Member[]; ownerIds: string[]; units: UnitOpt[]; companies: Company[]; grants: Grant[]; portfolio: Record<string, number>;
}) {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("activo");
  const [edit, setEdit] = useState<Member | null>(null);
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null);
  const unitName = useMemo(() => new Map(units.map((u) => [u.id, u.name])), [units]);
  const compName = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);
  const byId = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);
  const rows = members.filter((m) => (!status || m.status === status) && (!role || m.role === role) &&
    (!q || `${m.full_name} ${m.email ?? ""} ${m.position ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  const scope = (m: Member) => (EXTERNAL_ROLES.includes(m.role as never) ? compName.get(m.organization_id) ?? "Empresa externa" : m.unit_id ? unitName.get(m.unit_id)?.split(" › ").at(-1) : "Toda la organización");
  const canCreate = can(me.perms, "usuarios.crear");
  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <label className="relative min-w-[12rem] flex-1"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input !pl-9" placeholder="Buscar por nombre, correo o puesto…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar usuario" /></label>
        <select className="input !w-auto" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Perfil"><option value="">Todos los perfiles</option>{ROLES.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</select>
        <select className="input !w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Estado"><option value="">Todos</option><option value="activo">Activos</option><option value="suspendido">Suspendidos</option><option value="baja">De baja</option></select>
        {canCreate && <button className="btn" onClick={() => setCreating(true)}><Plus size={18} /> Nuevo usuario</button>}
      </div>
      {secret && (
        <div className="card space-y-2 !border-brand-600/40 !bg-brand-50" role="status">
          <p className="text-sm"><b>Contraseña provisional de {secret.email}</b> — se muestra solo ahora. Entrégala por un canal seguro; la persona puede cambiarla desde «¿Olvidaste tu contraseña?».</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-lg bg-white px-3 py-2 font-mono text-base font-bold tracking-wide">{secret.password}</code>
            <button className="btn-secondary" onClick={() => { navigator.clipboard?.writeText(secret.password); toast("Copiada"); }}><Copy size={16} /> Copiar</button>
            <button className="btn-ghost" onClick={() => setSecret(null)}>Ocultar</button>
          </div>
        </div>
      )}
      {rows.length === 0 ? <div className="card"><EmptyState title="Sin usuarios" text={canCreate ? "Da de alta a las personas de tu equipo y asígnales su perfil y su ámbito." : undefined} /></div> : (
        <>
          <div className="card hidden !p-0 md:block">
            <table className="data-table">
              <thead><tr><th className="pl-5">Persona</th><th>Perfil</th><th>Ámbito</th><th>Responsable</th><th className="text-right">Cartera</th><th>Permisos extra</th><th>Estado</th></tr></thead>
              <tbody>{rows.map((m) => {
                const g = grants.filter((x) => x.user_id === m.user_id).length;
                return (
                  <tr key={m.user_id} className="cursor-pointer hover:bg-slate-50" onClick={() => setEdit(m)}>
                    <td className="pl-5"><b className="block">{m.full_name}{ownerIds.includes(m.user_id) && <span className="badge ml-1.5 bg-brand-600 text-[#fff]">Propietario</span>}</b><span className="text-xs text-slate-500">{m.email}</span></td>
                    <td>{roleShort(m.role)}</td><td>{scope(m)}</td><td>{m.manager_id ? byId.get(m.manager_id)?.full_name ?? "—" : "—"}</td>
                    <td className="text-right tabular-nums">{portfolio[m.user_id] ?? 0}</td>
                    <td>{g ? <span className="badge bg-brand-50 text-brand-700">{g}</span> : "—"}</td>
                    <td><span className={clsx("badge", STATUS[m.status])}>{STATUS_L[m.status]}</span></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          <ul className="space-y-2 md:hidden">{rows.map((m) => (
            <li key={m.user_id}><button className="card tap flex w-full flex-col gap-1 text-left" onClick={() => setEdit(m)}>
              <span className="flex items-center justify-between gap-2"><b className="truncate">{m.full_name}</b><span className={clsx("badge", STATUS[m.status])}>{STATUS_L[m.status]}</span></span>
              <span className="text-sm text-slate-600">{roleShort(m.role)} · {scope(m)}</span>
              <span className="truncate text-xs text-slate-500">{[m.email, `${portfolio[m.user_id] ?? 0} tiendas`].filter(Boolean).join(" · ")}</span>
            </button></li>))}
          </ul>
        </>
      )}
      {creating && <UserForm me={me} units={units} companies={companies} members={members} onClose={() => setCreating(false)} onCreated={(email, password) => { setCreating(false); setSecret({ email, password }); }} />}
      {edit && <UserSheet me={me} m={edit} isOwnerRow={ownerIds.includes(edit.user_id)} units={units} companies={companies} members={members} grants={grants.filter((g) => g.user_id === edit.user_id)} byId={byId} onClose={() => setEdit(null)} onSecret={(p) => { setSecret({ email: edit.email ?? edit.full_name, password: p }); setEdit(null); }} />}
    </>
  );
}

function UserForm({ me, units, companies, members, onClose, onCreated }: { me: Me; units: UnitOpt[]; companies: Company[]; members: Member[]; onClose: () => void; onCreated: (email: string, password: string) => void }) {
  const router = useRouter();
  const [f, setF] = useState({ full_name: "", email: "", role: "reponedor", unit_id: "", organization_id: "", manager_id: "", position: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const external = EXTERNAL_ROLES.includes(f.role as never);
  async function save() {
    setErr(null);
    if (f.full_name.trim().length < 2) return setErr("Escribe el nombre completo");
    if (!/^\S+@\S+\.\S+$/.test(f.email)) return setErr("Correo no válido");
    if (external && !f.organization_id) return setErr("Elige la empresa externa");
    setBusy(true);
    const r = await adminOp<{ password: string }>({ op: "create_user", full_name: f.full_name, email: f.email, role: f.role, unit_id: external ? null : f.unit_id || null,
      organization_id: external ? f.organization_id : null, manager_id: f.manager_id || null, position: f.position || undefined, phone: f.phone || undefined });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    toast("Usuario creado"); router.refresh(); onCreated(f.email, r.data.password);
  }
  const managers = members.filter((m) => m.status === "activo" && !["reponedor", "reponedor_conveniencia", "analista"].includes(m.role));
  return (
    <Sheet title="Nuevo usuario" subtitle="Tendrá acceso con su correo y una contraseña provisional" onClose={onClose}
      footer={<div className="flex gap-2"><button className="btn-secondary flex-1" onClick={onClose}>Cancelar</button><button className="btn flex-1" disabled={busy} onClick={save}>{busy ? "Creando…" : "Crear usuario"}</button></div>}>
      <div className="space-y-4">
        <label className="block"><span className="label">Nombre y apellidos</span><input className="input" autoComplete="off" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></label>
        <label className="block"><span className="label">Correo</span><input className="input" type="email" autoComplete="off" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label className="block"><span className="label">Perfil</span>
          <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            {ROLES.filter((r) => me.isOwner || r.key !== "administrador").map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
          </select></label>
        <RoleSummary role={f.role} />
        {external ? (
          <label className="block"><span className="label">Empresa externa</span>
            <select className="input" value={f.organization_id} onChange={(e) => setF({ ...f, organization_id: e.target.value })}>
              <option value="">Elige…</option>{companies.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {!companies.length && <span className="mt-1 block text-xs text-slate-500">Primero registra la empresa en Administración → Organización.</span>}</label>
        ) : (
          <label className="block"><span className="label">Unidad (ámbito)</span>
            <select className="input" value={f.unit_id} onChange={(e) => setF({ ...f, unit_id: e.target.value })}>
              <option value="">Toda la organización</option>{units.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select></label>
        )}
        <label className="block"><span className="label">Responsable directo</span>
          <select className="input" value={f.manager_id} onChange={(e) => setF({ ...f, manager_id: e.target.value })}>
            <option value="">Ninguno</option>{managers.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name} · {roleShort(m.role)}</option>)}
          </select></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="label">Puesto (opcional)</span><input className="input" value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} /></label>
          <label className="block"><span className="label">Teléfono (opcional)</span><input className="input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
        </div>
        {err && <p className="field-error" role="alert">{err}</p>}
      </div>
    </Sheet>
  );
}

const ROLE_HINT: Record<string, string> = {
  administrador: "Gestiona usuarios, estructura, carteras y catálogos. No ve pagos ni acuerdos salvo permiso expreso.",
  direccion_nacional: "Ve toda la organización: panel, tiendas, ejecución, inventario y economía. Solo consulta.",
  direccion_regional: "Ve su región; aprueba acuerdos y pagos y reasigna carteras de su ámbito.",
  jefe_comercial: "Ve su ámbito, crea y aprueba acuerdos, crea y asigna tareas.",
  jefe_gpv: "Supervisa a sus GPV y reponedores: rutas, visitas, tareas, inventario y pagos de su unidad.",
  gpv: "Trabaja su cartera de tiendas: visitas, rutas, inventario, acuerdos, pagos y tareas.",
  reponedor: "Solo sus tiendas asignadas: visitas, fotos, estado de neveras e incidencias. Sin datos económicos.",
  supervisor_conveniencia: "Empresa externa: ve las tiendas que tiene contratadas su empresa y organiza a sus reponedores.",
  reponedor_conveniencia: "Empresa externa: solo sus tareas y tiendas asignadas. Sin datos económicos.",
  analista: "Consulta y exporta datos de su ámbito, incluida la auditoría. No modifica nada.",
};
function RoleSummary({ role }: { role: string }) {
  return <p className="rounded-xl bg-slate-100 px-3 py-2 text-[13px] text-slate-600">{ROLE_HINT[role]}</p>;
}

function UserSheet({ me, m, isOwnerRow, units, companies, members, grants, byId, onClose, onSecret }: {
  me: Me; m: Member; isOwnerRow: boolean; units: UnitOpt[]; companies: Company[]; members: Member[]; grants: Grant[]; byId: Map<string, Member>; onClose: () => void; onSecret: (p: string) => void;
}) {
  const router = useRouter();
  const [f, setF] = useState({ full_name: m.full_name, role: m.role, unit_id: m.unit_id ?? "", manager_id: m.manager_id ?? "", position: m.position ?? "", phone: m.phone ?? "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [g, setG] = useState({ module: "pagos", action: "consultar", effect: "allow", unit_id: "", valid_to: "", reason: "" });
  const editable = can(me.perms, "usuarios.editar") && !isOwnerRow && m.user_id !== me.id;
  const canGrant = can(me.perms, "usuarios.asignar") && !isOwnerRow && m.user_id !== me.id;
  const external = EXTERNAL_ROLES.includes(m.role as never);
  async function run(body: Record<string, unknown>, msg: string, close = true) {
    setBusy(true); setErr(null);
    const r = await adminOp<{ password?: string }>(body);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return false; }
    toast(msg); router.refresh();
    if (r.data.password) onSecret(r.data.password); else if (close) onClose();
    return true;
  }
  const save = () => run({ op: "update_user", user_id: m.user_id, full_name: f.full_name, role: f.role !== m.role ? f.role : undefined, unit_id: external ? undefined : f.unit_id || null, manager_id: f.manager_id || null, position: f.position || null, phone: f.phone || null }, "Cambios guardados");
  const managers = members.filter((x) => x.user_id !== m.user_id && x.status === "activo" && !["reponedor", "reponedor_conveniencia", "analista"].includes(x.role));
  return (
    <Sheet title={m.full_name} subtitle={`${roleName(m.role)} · ${m.email ?? ""}`} onClose={onClose}
      footer={editable ? <div className="flex gap-2"><button className="btn-secondary flex-1" onClick={onClose}>Cerrar</button><button className="btn flex-1" disabled={busy} onClick={save}>Guardar cambios</button></div> : undefined}>
      <div className="space-y-5">
        {isOwnerRow && <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-800">Propietario de la organización: tiene acceso total y no se puede modificar desde aquí.</p>}
        <fieldset disabled={!editable} className="space-y-4">
          <label className="block"><span className="label">Nombre y apellidos</span><input className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></label>
          <label className="block"><span className="label">Perfil</span>
            <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              {ROLES.filter((r) => EXTERNAL_ROLES.includes(r.key as never) === external && (me.isOwner || r.key !== "administrador" || m.role === "administrador")).map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
            </select></label>
          {f.role !== m.role && <RoleSummary role={f.role} />}
          {external ? <p className="text-sm text-slate-600">Empresa: <b>{companies.find((c) => c.id === m.organization_id)?.name ?? "—"}</b></p> : (
            <label className="block"><span className="label">Unidad (ámbito)</span>
              <select className="input" value={f.unit_id} onChange={(e) => setF({ ...f, unit_id: e.target.value })}>
                <option value="">Toda la organización</option>{units.filter((u) => u.active || u.id === m.unit_id).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select></label>
          )}
          <label className="block"><span className="label">Responsable directo</span>
            <select className="input" value={f.manager_id} onChange={(e) => setF({ ...f, manager_id: e.target.value })}>
              <option value="">Ninguno</option>{managers.map((x) => <option key={x.user_id} value={x.user_id}>{x.full_name} · {roleShort(x.role)}</option>)}
            </select></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="label">Puesto</span><input className="input" value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} /></label>
            <label className="block"><span className="label">Teléfono</span><input className="input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
          </div>
        </fieldset>
        {err && <p className="field-error" role="alert">{err}</p>}

        {editable && (
          <section className="space-y-2">
            <h3 className="t-section !text-sm">Acceso</h3>
            <div className="flex flex-wrap gap-2">
              {m.status !== "activo" && <button className="btn-secondary" disabled={busy} onClick={() => run({ op: "update_user", user_id: m.user_id, status: "activo" }, "Acceso reactivado")}>Reactivar</button>}
              {m.status === "activo" && <button className="btn-secondary" disabled={busy} onClick={() => run({ op: "update_user", user_id: m.user_id, status: "suspendido" }, "Acceso suspendido")}>Suspender acceso</button>}
              {m.status !== "baja" && <button className="btn-secondary !text-red-700" disabled={busy} onClick={() => { if (confirmBaja()) run({ op: "update_user", user_id: m.user_id, status: "baja" }, "Usuario dado de baja"); }}>Dar de baja</button>}
              <button className="btn-ghost" disabled={busy} onClick={() => run({ op: "reset_password", user_id: m.user_id }, "Contraseña restablecida", false)}><KeyRound size={16} /> Nueva contraseña</button>
            </div>
            <p className="text-xs text-slate-500">Suspender bloquea la entrada sin tocar nada. La baja también libera su cartera (queda en el histórico). Sus visitas y registros se conservan.</p>
          </section>
        )}

        <section className="space-y-2">
          <h3 className="t-section !text-sm">Permisos individuales</h3>
          <p className="text-xs text-slate-500">Excepciones al perfil: se suman (conceder) o se quitan (denegar), con motivo y fecha de fin. La denegación manda.</p>
          {grants.length === 0 ? <p className="text-sm text-slate-500">Sin excepciones: tiene exactamente los permisos de su perfil.</p> : (
            <ul className="divide-y divide-slate-200 text-sm">{grants.map((x) => (
              <li key={x.id} className="flex items-start justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className={clsx("badge mr-1.5", x.effect === "allow" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>{x.effect === "allow" ? "Concedido" : "Denegado"}</span>
                  <b>{permLabel(x.permission)}</b>
                  {x.unit_id && <span className="text-slate-500"> · {units.find((u) => u.id === x.unit_id)?.name.split(" › ").at(-1)}</span>}
                  <span className="block text-xs text-slate-500">{x.reason} · por {byId.get(x.granted_by)?.full_name ?? "—"} el {dmy(x.created_at.slice(0, 10))}{x.valid_to ? ` · hasta el ${dmy(x.valid_to.slice(0, 10))}` : ""}</span>
                </span>
                {canGrant && <button className="icon-btn shrink-0" title="Retirar" aria-label="Retirar permiso" disabled={busy} onClick={() => { const reason = window.prompt("Motivo para retirar este permiso"); if (reason && reason.trim().length >= 3) run({ op: "revoke", id: x.id, reason }, "Permiso retirado", false); }}><ShieldMinus size={16} /></button>}
              </li>))}
            </ul>
          )}
          {canGrant && (
            <div className="panel space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <select className="input" aria-label="Módulo" value={g.module} onChange={(e) => setG({ ...g, module: e.target.value })}>{MODULES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                <select className="input" aria-label="Acción" value={g.action} onChange={(e) => setG({ ...g, action: e.target.value })}>{ACTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                <select className="input col-span-2 sm:col-span-1" aria-label="Efecto" value={g.effect} onChange={(e) => setG({ ...g, effect: e.target.value })}><option value="allow">Conceder</option><option value="deny">Denegar</option></select>
                <select className="input col-span-2" aria-label="Limitado a unidad" value={g.unit_id} onChange={(e) => setG({ ...g, unit_id: e.target.value })}><option value="">Sin límite de unidad</option>{units.map((u) => <option key={u.id} value={u.id}>Solo en {u.name}</option>)}</select>
                <label className="col-span-2 sm:col-span-1"><span className="sr-only">Hasta</span><input type="date" className="input" value={g.valid_to} onChange={(e) => setG({ ...g, valid_to: e.target.value })} title="Hasta (opcional)" /></label>
              </div>
              <input className="input" placeholder="Motivo (obligatorio): p. ej. sustituye a su jefe en vacaciones" value={g.reason} maxLength={500} onChange={(e) => setG({ ...g, reason: e.target.value })} />
              <button className="btn-secondary w-full" disabled={busy || g.reason.trim().length < 3} onClick={async () => {
                if (await run({ op: "grant", user_id: m.user_id, permission: `${g.module}.${g.action}`, effect: g.effect, unit_id: g.unit_id || null, valid_to: g.valid_to || null, reason: g.reason }, g.effect === "allow" ? "Permiso concedido" : "Permiso denegado", false)) setG({ ...g, reason: "" });
              }}><ShieldPlus size={16} /> {g.effect === "allow" ? "Conceder" : "Denegar"} {permLabel(`${g.module}.${g.action}`).toLowerCase()}</button>
            </div>
          )}
        </section>
      </div>
    </Sheet>
  );
}

function confirmBaja() {
  return window.confirm("¿Dar de baja a esta persona? Perderá el acceso y su cartera quedará libre. Sus registros se conservan.");
}
