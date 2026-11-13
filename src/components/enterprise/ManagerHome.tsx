import Link from "next/link";
import { ChevronRight, ClipboardCheck, LayoutDashboard, ShieldCheck, Users } from "lucide-react";
import { formatLong } from "@/lib/domain/dates";
import { supabaseServer } from "@/lib/supabase/server";
import { loadScope } from "@/lib/server/scope";
import { can, roleName, TASK_STATUS, type Me } from "@/lib/enterprise/roles";
import { MahouEmblem } from "../MahouLogo";
import { KpiRow, UnitTable } from "./ScopeViews";

/** Inicio de los perfiles que supervisan (dirección, jefes, supervisores, analistas y administración). */
export async function ManagerHome({ me, greeting }: { me: Me; greeting: string }) {
  // Sin acceso a la ejecución (p. ej. administrador de plataforma): inicio de administración.
  if (!can(me.permissions, "visitas.consultar")) return <AdminHome me={me} greeting={greeting} />;
  const s = await loadScope();
  const p = s.total.compliance.required ? Math.round((s.total.compliance.done / s.total.compliance.required) * 100) : null;
  const toValidate = s.tasks.filter((t) => t.status === "pendiente_validacion");
  const overdue = s.tasks.filter((t) => ["pendiente", "asignada", "en_curso", "rechazada"].includes(t.status) && t.due_date && t.due_date < s.today);
  const people = s.byPerson.filter((x) => x.member.user_id !== me.userId && x.portfolio > 0);
  const idle = people.filter((x) => x.visitsToday === 0);
  const worst = [...people].filter((x) => x.atrasadas > 0).sort((a, b) => b.atrasadas - a.atrasadas).slice(0, 5);
  const storeName = new Map(s.rows.map((r) => [r.id, r.name]));
  const scopeLabel = me.unitName ?? (me.orgKind === "externa" ? me.orgName : "Toda la organización");
  const links = [
    can(me.permissions, "informes.exportar") || can(me.permissions, "panel.exportar") ? { href: "/direction", label: "Panel de dirección", icon: <LayoutDashboard size={18} /> } : null,
    can(me.permissions, "usuarios.consultar") ? { href: "/team", label: "Mi equipo", icon: <Users size={18} /> } : null,
    can(me.permissions, "tareas.consultar") ? { href: "/tasks", label: "Tareas", icon: <ClipboardCheck size={18} /> } : null,
    can(me.permissions, "usuarios.crear") ? { href: "/admin/users", label: "Usuarios y permisos", icon: <ShieldCheck size={18} /> } : null,
  ].filter(Boolean) as { href: string; label: string; icon: React.ReactNode }[];
  return (
    <div className="space-y-6">
      <header>
        <p className="t-eyebrow">{formatLong(s.today)}</p>
        <h1 className="t-display mt-1">{greeting}{me.name ? `, ${me.name.split(" ")[0]}` : ""}</h1>
        <p className="mt-1 text-sm text-slate-500">{roleName(me.role)} · {scopeLabel}</p>
      </header>

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <div className="card relative flex min-h-[12rem] flex-col justify-between gap-3 overflow-hidden !border-brand-700 !bg-brand-600 !p-5 text-[#fff] shadow-brand md:!p-6">
          <MahouEmblem size={190} tone="white" className="pointer-events-none absolute -bottom-8 -right-6 opacity-[0.09]" />
          <span className="relative text-sm font-semibold text-[#fff]/90">Cumplimiento de visitas este mes</span>
          <span className="relative text-7xl font-extrabold leading-none tracking-[-0.04em] tabular-nums">{p == null ? "—" : `${p}%`}</span>
          <span className="relative text-sm text-[#fff]/90">{s.total.compliance.done} de {s.total.compliance.required} visitas · {s.total.stores} tiendas en tu ámbito</span>
          <span className="relative h-2 overflow-hidden rounded-full bg-white/25"><span className="block h-full rounded-full bg-[#fff]" style={{ width: `${p ?? 0}%` }} /></span>
        </div>
        <div className="grid content-start gap-2.5 sm:grid-cols-2">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="card tap flex min-h-16 items-center gap-3 !p-4 font-semibold">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">{l.icon}</span>{l.label}<ChevronRight size={18} className="ml-auto text-slate-400" />
            </Link>
          ))}
        </div>
      </section>

      <KpiRow b={s.total} />

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <section className="card space-y-2">
          <h2 className="t-section">Requiere tu atención</h2>
          <ul className="divide-y divide-slate-200 text-sm">
            {toValidate.length > 0 && <li><Link href="/tasks?tab=validar" className="row-link -mx-2 flex min-h-12 items-center justify-between gap-2 rounded-xl px-2"><span>{toValidate.length} tareas hechas esperando tu validación</span><span className={`badge ${TASK_STATUS.pendiente_validacion.tone}`}>Validar</span></Link></li>}
            {overdue.length > 0 && <li><Link href="/tasks?tab=equipo" className="row-link -mx-2 flex min-h-12 items-center justify-between gap-2 rounded-xl px-2"><span>{overdue.length} tareas fuera de plazo</span><span className="badge bg-red-100 text-red-700">Revisar</span></Link></li>}
            {s.total.incidentsHigh > 0 && <li><Link href="/incidents?priority=alta" className="row-link -mx-2 flex min-h-12 items-center justify-between gap-2 rounded-xl px-2"><span>{s.total.incidentsHigh} incidencias de prioridad alta abiertas</span><ChevronRight size={16} /></Link></li>}
            {people.length > 0 && <li className="flex min-h-12 items-center justify-between gap-2"><span>{idle.length ? `${idle.length} de ${people.length} personas aún sin visitas hoy` : "Todo el equipo tiene visitas hoy"}</span>{can(me.permissions, "usuarios.consultar") && <Link className="link" href="/team">Ver equipo</Link>}</li>}
            {!toValidate.length && !overdue.length && !s.total.incidentsHigh && !people.length && <li className="py-2 text-slate-500">Nada urgente ahora mismo.</li>}
          </ul>
          {overdue.length > 0 && (
            <ul className="space-y-1 pt-1 text-[13px] text-slate-600">{overdue.slice(0, 4).map((t) => <li key={t.id} className="truncate">· {t.title} — {storeName.get(t.store_id) ?? "tienda"}</li>)}</ul>
          )}
        </section>
        <section className="card space-y-2">
          <h2 className="t-section">Más tiendas atrasadas</h2>
          {worst.length === 0 ? <p className="text-sm text-slate-500">{people.length ? "Nadie de tu equipo tiene tiendas atrasadas." : "Cuando haya personas con cartera en tu ámbito verás aquí quién necesita apoyo."}</p> : (
            <ul className="divide-y divide-slate-200 text-sm">{worst.map((x) => (
              <li key={x.key} className="flex min-h-12 items-center justify-between gap-2"><span className="min-w-0 truncate">{x.member.full_name}</span><span className="badge bg-st-late text-[#fff]">{x.atrasadas} atrasadas</span></li>
            ))}</ul>
          )}
        </section>
      </div>

      {s.byUnit.length > 1 && (
        <section className="card space-y-3">
          <div className="flex items-center justify-between gap-2"><h2 className="t-section">Por unidad</h2>{links[0]?.href === "/direction" && <Link className="link text-sm" href="/direction">Abrir panel</Link>}</div>
          <UnitTable rows={s.byUnit} />
        </section>
      )}
    </div>
  );
}

async function AdminHome({ me, greeting }: { me: Me; greeting: string }) {
  const sb = await supabaseServer();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: members }, { data: stores }, { data: assigns }, { data: orgs }, { data: audit }] = await Promise.all([
    sb.from("members").select("user_id,role,status,unit_id"),
    sb.from("stores").select("id,unit_id").eq("active", true).limit(20000),
    sb.from("store_assignments").select("store_id,user_id,function,valid_from,valid_to").limit(50000),
    sb.from("organizations").select("id,kind,active"),
    sb.from("access_audit").select("id,action,created_at").order("created_at", { ascending: false }).limit(5),
  ]);
  const live = (assigns ?? []).filter((a) => a.valid_from <= today && (!a.valid_to || a.valid_to >= today));
  const act = (members ?? []).filter((m) => m.status === "activo");
  const field = act.filter((m) => ["gpv", "reponedor", "reponedor_conveniencia"].includes(m.role));
  const noPortfolio = field.filter((m) => !live.some((a) => a.user_id === m.user_id)).length;
  const st = stores ?? [];
  const tiles = [
    { href: "/admin/users", label: "Usuarios activos", value: act.length, hint: `${(members ?? []).length - act.length} suspendidos o de baja` },
    { href: "/admin/portfolios", label: "Personas de campo sin cartera", value: noPortfolio, warn: noPortfolio > 0 },
    { href: "/admin/structure", label: "Tiendas sin unidad", value: st.filter((x) => !x.unit_id).length, warn: st.some((x) => !x.unit_id) },
    { href: "/admin/portfolios", label: "Tiendas sin GPV", value: st.filter((x) => !live.some((a) => a.store_id === x.id && a.function === "gpv")).length },
    { href: "/admin/portfolios", label: "Tiendas sin reposición", value: st.filter((x) => !live.some((a) => a.store_id === x.id && a.function !== "gpv")).length },
    { href: "/admin/structure", label: "Empresas de servicio", value: (orgs ?? []).filter((o) => o.kind === "externa" && o.active).length },
  ];
  return (
    <div className="space-y-6">
      <header>
        <p className="t-eyebrow">{formatLong(today)}</p>
        <h1 className="t-display mt-1">{greeting}{me.name ? `, ${me.name.split(" ")[0]}` : ""}</h1>
        <p className="mt-1 text-sm text-slate-500">{roleName(me.role)} · {me.orgName ?? "Tu organización"}</p>
      </header>
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="card tap flex min-h-[6.5rem] flex-col justify-between gap-1 !p-3.5">
            <span className="text-xs font-semibold leading-tight text-slate-500">{t.label}</span>
            <span className={`text-[1.75rem] font-extrabold leading-none tracking-[-0.03em] tabular-nums ${t.warn ? "text-st-soon" : ""}`}>{t.value}</span>
            {t.hint ? <span className="truncate text-[11px] text-slate-500">{t.hint}</span> : <span />}
          </Link>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <section className="card space-y-2">
          <h2 className="t-section">Accesos rápidos</h2>
          <ul className="divide-y divide-slate-200 text-sm">
            {[["/admin/users", "Dar de alta o editar usuarios"], ["/admin/structure", "Regiones, zonas, equipos y empresas"], ["/admin/portfolios", "Asignar carteras de tiendas"], ["/admin/permissions", "Ver qué puede hacer cada perfil"]].map(([h, l]) => (
              <li key={h}><Link href={h} className="row-link -mx-2 flex min-h-12 items-center justify-between rounded-xl px-2">{l}<ChevronRight size={16} className="text-slate-400" /></Link></li>
            ))}
          </ul>
        </section>
        <section className="card space-y-2">
          <div className="flex items-center justify-between"><h2 className="t-section">Últimos cambios</h2>{can(me.permissions, "auditoria.consultar") && <Link className="link text-sm" href="/admin/audit">Auditoría</Link>}</div>
          {(audit ?? []).length === 0 ? <p className="text-sm text-slate-500">Sin movimientos.</p> : (
            <ul className="divide-y divide-slate-200 text-sm">{audit!.map((a) => <li key={a.id} className="flex min-h-11 items-center justify-between gap-2"><span>{a.action.charAt(0).toUpperCase() + a.action.slice(1).replace(/_/g, " ")}</span><span className="text-xs text-slate-500">{new Date(a.created_at).toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" })}</span></li>)}</ul>
          )}
        </section>
      </div>
      <p className="text-xs text-slate-500">Tu perfil no ve la actividad comercial ni los datos económicos. Si lo necesitas, pide un permiso individual con motivo y fecha de fin.</p>
    </div>
  );
}
