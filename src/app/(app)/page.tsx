import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { loadAllStores, loadCompletedDates, loadSettings, withObligations } from "@/lib/server/load";
import { addDays, formatLong, madridDate, monthStart } from "@/lib/domain/dates";
import { googleMapsRouteUrl } from "@/lib/domain/geo";
import { StateBadge, FeasibilityCard } from "@/components/ui";
import { loadFeasibility } from "@/lib/server/feasibility";
import { StartVisitButton } from "@/components/StartVisitButton";
import { GenerateRoute } from "@/components/GenerateRoute";
import { OfflineWarmup } from "@/components/OfflineWarmup";
import { complianceInRange, sumCompliance } from "@/lib/domain/report";
import { monthEnd } from "@/lib/economy";
import { INCIDENT_COLS, INCIDENT_TYPE_LABEL, PRIORITY_LABEL, PRIORITY_STYLE, daysOpen, sortIncidents, type Incident } from "@/lib/incidents";
import { MahouEmblem } from "@/components/MahouLogo";
import { AlertTriangle, CalendarClock, ChevronRight, Clock, Euro, FileSignature, ShieldCheck, Wrench } from "lucide-react";
import { getMe } from "@/lib/server/me";
import { can, TASK_STATUS } from "@/lib/enterprise/roles";
import { ManagerHome } from "@/components/enterprise/ManagerHome";
import { OPEN_TASK, TASK_COLS, type Task } from "@/lib/server/scope";

// Perfiles que supervisan: su inicio es el estado de su ámbito, no una ruta propia.
const MANAGERS = new Set(["direccion_nacional", "direccion_regional", "jefe_comercial", "jefe_gpv", "analista", "administrador", "supervisor_conveniencia"]);

const eur = (n: number) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** A dónde lleva cada alerta al pulsarla. */
function alertHref(a: { kind: string | null; dedupe_key: string | null }): string | null {
  const date = a.dedupe_key?.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if ((a.kind === "route_proposed" || a.kind === "route_unscheduled") && date) return `/routes/${date}`;
  return null;
}

interface Stop {
  id: string; store_id: string; position: number; planned_arrival: string | null; planned_minutes: number;
  stores: { name: string; town: string | null; address: string | null; postal_code: string | null; lat: number | null; lng: number | null; audit: boolean };
}

export default async function Today() {
  const sb = await supabaseServer();
  const today = madridDate();
  const me = await getMe();
  const hour0 = Number(new Intl.DateTimeFormat("es-ES", { hour: "numeric", hour12: false, timeZone: "Europe/Madrid" }).format(new Date())) % 24;
  if (me && !me.isOwner && me.role && MANAGERS.has(me.role)) {
    return <ManagerHome me={me} greeting={hour0 < 6 ? "Buenas noches" : hour0 < 14 ? "Buenos días" : hour0 < 21 ? "Buenas tardes" : "Buenas noches"} />;
  }
  const perms = me?.permissions ?? ["todo.todo"];
  const uid = me?.userId ?? "";
  const [settings, stores, dates] = await Promise.all([loadSettings(), loadAllStores(), loadCompletedDates()]);
  const rows = withObligations(stores, dates, settings, today);
  const feas = await loadFeasibility(rows, settings);

  const [{ data: route }, { data: tomorrow }, { data: open }, { data: alerts }, { data: monthVisits }] = await Promise.all([
    sb.from("routes").select("id,status").eq("route_date", today).eq("user_id", uid).maybeSingle(),
    sb.from("routes").select("id,status,route_date").eq("user_id", uid).gt("route_date", today).lte("route_date", addDays(today, 4)).eq("status", "proposed").order("route_date").limit(1).maybeSingle(),
    sb.from("visits").select("id,stores(name)").eq("status", "in_progress").eq("created_by", uid).limit(1).maybeSingle(),
    sb.from("alerts").select("id,message,severity,kind,dedupe_key").is("resolved_at", null).order("created_at", { ascending: false }).limit(5),
    sb.from("visits").select("id", { count: "exact", head: false }).eq("status", "completed").gte("visit_date", monthStart(today)).lte("visit_date", today),
  ]);
  const soonEnd = addDays(today, 60);
  const [{ data: incData }, { data: pend }, { count: toReview }, { count: agSoon }, { data: myTasks }] = await Promise.all([
    sb.from("incidents").select(INCIDENT_COLS).is("deleted_at", null).in("status", ["abierta", "en_seguimiento"]).limit(500),
    sb.from("payment_records").select("amount").is("deleted_at", null).in("status", ["previsto", "aprobado", "comprobado"]).limit(2000),
    sb.from("store_equipment").select("id", { count: "exact", head: true }).is("deleted_at", null).in("status", ["deteriorado", "pendiente_revision", "pendiente_instalacion"]),
    sb.from("agreements").select("id", { count: "exact", head: true }).is("deleted_at", null).in("status", ["aprobado", "en_ejecucion"]).gte("end_date", today).lte("end_date", soonEnd),
    can(perms, "tareas.consultar") && me && !me.isOwner
      ? sb.from("tasks").select(TASK_COLS).is("deleted_at", null).eq("assignee_id", uid).in("status", OPEN_TASK).order("due_date", { ascending: true, nullsFirst: false }).limit(20)
      : Promise.resolve({ data: [] as Task[] }),
  ]);
  const tasksMine = (myTasks ?? []) as Task[];
  const openInc = sortIncidents((incData ?? []) as Incident[]);
  const pendAmount = (pend ?? []).reduce((a, p) => a + Number(p.amount), 0);

  let stops: Stop[] = [];
  const visitByStop = new Map<string, { id: string; status: string }>();
  if (route && route.status !== "rejected") {
    const [{ data: st }, { data: vs }] = await Promise.all([
      sb.from("route_stops").select("id,store_id,position,planned_arrival,planned_minutes,stores(name,town,address,postal_code,lat,lng,audit)").eq("route_id", route.id).order("position"),
      sb.from("visits").select("id,route_stop_id,status").eq("visit_date", today).not("route_stop_id", "is", null),
    ]);
    stops = (st ?? []) as unknown as Stop[];
    for (const v of vs ?? []) visitByStop.set(v.route_stop_id, { id: v.id, status: v.status });
  }

  const hour = Number(new Intl.DateTimeFormat("es-ES", { hour: "numeric", hour12: false, timeZone: "Europe/Madrid" }).format(new Date())) % 24;
  const greeting = hour < 6 ? "Buenas noches" : hour < 14 ? "Buenos días" : hour < 21 ? "Buenas tardes" : "Buenas noches";
  const doneStops = stops.filter((s) => visitByStop.get(s.id)?.status === "completed").length;
  const pendientes = rows.filter((r) => r.ob.pending > 0);
  const atrasadas = rows.filter((r) => r.ob.state === "atrasada").length;
  const proximas = rows.filter((r) => r.ob.state === "proxima").length;
  const conObl = rows.filter((r) => r.ob.state !== "sin_obligacion").length;
  const cumplidas = rows.filter((r) => r.ob.state === "cumplida").length;
  const noGeo = rows.filter((r) => r.lat == null).length;
  const next = stops.find((s) => visitByStop.get(s.id)?.status !== "completed");
  const url = googleMapsRouteUrl(stops.map((s) => ({ lat: s.stores.lat, lng: s.stores.lng, address: s.stores.address, town: s.stores.town, postal_code: s.stores.postal_code })));
  const top = [...pendientes].sort((a, b) => b.score - a.score).slice(0, 5);
  // Visitas obligatorias del mes en curso: cuántas faltan (ventanas abiertas sin visita).
  const m0 = monthStart(today);
  const month = sumCompliance(rows.map((r) => complianceInRange(r.frequency, r.audit, dates.get(r.id) ?? [], m0, monthEnd(m0), today, settings.tracking_start)));
  const audits = rows.filter((r) => r.audit && r.ob.pending > 0).length;
  const storeName = new Map(rows.map((r) => [r.id, r.name]));
  const allTiles: { href: string; label: string; value: string | number; hint?: string; tone: string; icon: React.ReactNode; perm?: string }[] = [
    { href: "/stores?state=atrasada", label: "Atrasadas", value: atrasadas, hint: "fuera de plazo", tone: atrasadas ? "text-st-late" : "", icon: <AlertTriangle size={16} /> },
    { href: "/stores?state=proxima", label: "Vencen pronto", value: proximas, hint: "en los próximos días", tone: proximas ? "text-st-soon" : "", icon: <Clock size={16} /> },
    { href: "/stores?audit=1&state=atrasada&state=proxima&state=pendiente", label: "Audit pendientes", value: audits, tone: "", icon: <ShieldCheck size={16} /> },
    { href: "/incidents", label: "Incidencias abiertas", value: openInc.length, hint: openInc.filter((i) => i.priority === "alta").length ? `${openInc.filter((i) => i.priority === "alta").length} de prioridad alta` : undefined, tone: openInc.length ? "text-st-late" : "", icon: <AlertTriangle size={16} /> },
    { href: `/economy?period=${today.slice(0, 4)}&status=previsto&status=aprobado&status=comprobado`, label: "Pagos pendientes", value: (pend ?? []).length, hint: (pend ?? []).length ? eur(pendAmount) : undefined, tone: "", icon: <Euro size={16} />, perm: "pagos.consultar" },
    { href: "/inventory?status=deteriorado&status=pendiente_revision&status=pendiente_instalacion", label: "Elementos por revisar", value: toReview ?? 0, hint: "deteriorados o pendientes", tone: toReview ? "text-st-soon" : "", icon: <Wrench size={16} />, perm: "inventario.consultar" },
    { href: "/agreements?venc=60", label: "Acuerdos que vencen", value: agSoon ?? 0, hint: "en 60 días", tone: agSoon ? "text-st-soon" : "", icon: <FileSignature size={16} />, perm: "acuerdos.consultar" },
    ...(tasksMine.length ? [{ href: "/tasks?tab=mias", label: "Mis tareas", value: tasksMine.length, hint: tasksMine.some((t) => t.due_date && t.due_date < today) ? "alguna fuera de plazo" : "pendientes", tone: tasksMine.some((t) => t.due_date && t.due_date < today) ? "text-st-late" : "", icon: <CalendarClock size={16} /> }] : []),
  ];
  // Sin datos económicos para quien no tiene permiso (la base de datos tampoco se los da).
  const tiles = allTiles.filter((t) => !t.perm || can(perms, t.perm));

  return (
    <div className="space-y-6">
      <header>
        <p className="t-eyebrow">{formatLong(today)}</p>
        <h1 className="t-display mt-1">{greeting}{me && !me.isOwner && me.name ? `, ${me.name.split(" ")[0]}` : ""}</h1>
      </header>

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Link href="/stores?state=pendiente&state=proxima&state=atrasada" className="card tap relative flex min-h-[13rem] flex-col justify-between gap-3 overflow-hidden !border-brand-700 !bg-brand-600 !p-5 text-[#fff] shadow-brand md:!p-6">
          <MahouEmblem size={190} tone="white" className="pointer-events-none absolute -bottom-8 -right-6 opacity-[0.09]" />
          <span className="relative text-sm font-semibold text-[#fff]/90">Visitas que faltan este mes</span>
          <span className="relative text-7xl font-extrabold leading-none tracking-[-0.04em] tabular-nums">{month.pending}</span>
          <span className="relative text-sm text-[#fff]/90">{month.done} de {month.required} hechas{month.missed ? ` · ${month.missed} sin hacer en plazos ya cerrados` : ""}</span>
          <span className="relative h-2 overflow-hidden rounded-full bg-white/25"><span className="block h-full rounded-full bg-[#fff]" style={{ width: `${month.required ? Math.round((month.done / month.required) * 100) : 0}%` }} /></span>
        </Link>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 xl:gap-3">
          {tiles.map((t) => (
            <Link key={t.label} href={t.href} className="card tap flex min-h-[6.25rem] flex-col justify-between gap-1 !p-3.5">
              <span className="flex items-start gap-1.5 text-xs font-semibold leading-tight text-slate-500"><span className="mt-px shrink-0">{t.icon}</span>{t.label}</span>
              <span className={`text-[1.75rem] font-extrabold leading-none tracking-[-0.03em] tabular-nums ${t.tone}`}>{t.value}</span>
              {t.hint ? <span className="truncate text-[11px] text-slate-500">{t.hint}</span> : <span />}
            </Link>
          ))}
          <Link href={`/routes/${today}`} className="card tap flex min-h-[6.25rem] flex-col justify-between gap-1 !p-3.5">
            <span className="text-xs font-semibold text-slate-500">Ruta de hoy</span>
            <span className="text-[1.75rem] font-extrabold leading-none tracking-[-0.03em] tabular-nums">{stops.length ? `${doneStops}/${stops.length}` : "—"}</span>
            <span className="text-[11px] text-slate-500">{stops.length ? "paradas hechas" : "sin ruta"}</span>
          </Link>
        </div>
      </section>

      <FeasibilityCard f={feas} compact />
      {route && <OfflineWarmup urls={[`/routes/${today}`, ...stops.map((s) => `/stores/${s.store_id}`)]} />}

      {open && (
        <Link href={`/visits/${open.id}`} className="card tap flex items-center justify-between gap-3 !border-brand-600/40 !bg-brand-50">
          <span className="min-w-0"><span className="flex items-center gap-1.5 text-xs font-bold text-brand-700"><span className="h-2 w-2 animate-pulse rounded-full bg-brand-600" />Visita en curso</span><b className="block truncate">{(open.stores as unknown as { name: string } | null)?.name}</b></span>
          <span className="link shrink-0 text-sm">Continuar</span>
        </Link>
      )}

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="t-section">Ruta de hoy</h2>
          {route && <Link href={`/routes/${today}`} className="link text-sm">{route.status === "proposed" ? "Revisar y aceptar" : "Ver ruta"}</Link>}
        </div>
        {!route || route.status === "rejected" ? (
          <>
            <p className="text-sm text-slate-500">No hay ruta para hoy.</p>
            <GenerateRoute embedded defaultDate={today} routeStart={settings.route_start} />
          </>
        ) : stops.length === 0 ? (
          <p className="text-sm text-slate-500">La ruta no tiene paradas.</p>
        ) : (
          <>
            {route.status === "proposed" && <p className="rounded-xl bg-amber-50 p-2 text-sm text-amber-800">Ruta propuesta: acéptala para convertirla en visitas planificadas.</p>}
            <ol className="divide-y divide-slate-200">
              {stops.map((s) => {
                const v = visitByStop.get(s.id);
                const isNext = next?.id === s.id;
                return (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                    <Link href={`/stores/${s.store_id}`} className="min-w-0">
                      <span className="block text-xs text-slate-500">{s.planned_arrival?.slice(0, 5)} · {s.planned_minutes} min</span>
                      <span className={isNext ? "block truncate font-semibold" : "block truncate"}>{s.position}. {s.stores.name}</span>
                      <span className="block truncate text-xs text-slate-500">{s.stores.address}, {s.stores.town}</span>
                    </Link>
                    {v?.status === "completed" ? <span className="badge bg-green-100 text-green-700">Hecha</span>
                      : v?.status === "in_progress" ? <Link className="btn-secondary" href={`/visits/${v.id}`}>En curso</Link>
                      : route.status === "accepted" || isNext ? <StartVisitButton storeId={s.store_id} plannedVisitId={v?.id} routeStopId={s.id} minutes={s.planned_minutes} /> : null}
                  </li>
                );
              })}
            </ol>
            {url && <a className="btn-secondary w-full" href={url} target="_blank" rel="noreferrer">Navegar la ruta en Google Maps</a>}
          </>
        )}
      </section>

      {tomorrow && (
        <Link href={`/routes/${tomorrow.route_date}`} className="card tap block text-sm">
          Ruta propuesta para {formatLong(tomorrow.route_date)} <span className="underline">— revisar y aceptar</span>
        </Link>
      )}


      {tasksMine.length > 0 && (
        <section className="card space-y-2">
          <div className="flex items-center justify-between gap-2"><h2 className="t-section">Mis tareas</h2><Link href="/tasks?tab=mias" className="link text-sm">Ver todas</Link></div>
          <ul className="divide-y divide-slate-200">
            {tasksMine.slice(0, 5).map((t) => (
              <li key={t.id}>
                <Link href="/tasks?tab=mias" className="row-link -mx-2 flex min-h-12 items-center justify-between gap-2 rounded-xl px-2 py-2 text-sm">
                  <span className="min-w-0"><b className="block truncate">{t.title}</b><span className="block truncate text-xs text-slate-500">{storeName.get(t.store_id) ?? "Tienda"}{t.due_date ? ` · hasta el ${t.due_date.slice(8, 10)}/${t.due_date.slice(5, 7)}` : ""}</span></span>
                  <span className={`badge ${t.due_date && t.due_date < today ? "bg-red-100 text-red-700" : TASK_STATUS[t.status]?.tone}`}>{t.due_date && t.due_date < today ? "Fuera de plazo" : TASK_STATUS[t.status]?.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <section className="card">
          <h2 className="t-section mb-2">Prioritarias ahora</h2>
          {top.length === 0 ? <p className="text-sm text-slate-500">Nada pendiente. El seguimiento arranca el {settings.tracking_start}.</p> : (
            <ul className="divide-y divide-slate-200">
              {top.map((s) => (
                <li key={s.id}>
                  <Link href={`/stores/${s.id}`} className="row-link -mx-2 flex min-h-12 items-center justify-between gap-2 rounded-xl px-2 py-2 text-sm">
                    <span className="min-w-0 truncate">{s.audit && <span className="badge mr-1 bg-slate-900 text-slate-50">Audit</span>}{s.name}</span>
                    <StateBadge state={s.ob.state} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <h2 className="t-section mb-2">Alertas</h2>
          {(alerts ?? []).length === 0 ? <p className="text-sm text-slate-500">Sin alertas.</p> : (
            <ul className="divide-y divide-slate-200 text-sm">{alerts!.map((a) => {
              const href = alertHref(a);
              const cls = a.severity === "error" ? "text-red-600" : a.severity === "warning" ? "text-amber-700" : "text-slate-600";
              return <li key={a.id}>{href ? <Link href={href} className={`row-link -mx-2 flex min-h-12 items-center justify-between gap-2 rounded-xl px-2 py-2 ${cls}`}><span>{a.message}</span><ChevronRight size={16} className="shrink-0" /></Link> : <p className={`py-2 ${cls}`}>{a.message}</p>}</li>;
            })}</ul>
          )}
          <p className="mt-3 text-xs text-slate-400">{(monthVisits ?? []).length} visitas completadas este mes</p>
        </section>
      </div>

      <section className="card">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="t-section">Incidencias abiertas</h2>
          <Link href="/incidents" className="link text-sm">Ver todas</Link>
        </div>
        {openInc.length === 0 ? <p className="text-sm text-slate-500">No hay incidencias abiertas.</p> : (
          <ul className="divide-y divide-slate-200">
            {openInc.slice(0, 5).map((i) => (
              <li key={i.id}>
                <Link href={`/stores/${i.store_id}?tab=incidencias&inc=${i.id}`} className="row-link -mx-2 flex min-h-12 items-center justify-between gap-2 rounded-xl px-2 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{storeName.get(i.store_id) ?? "Tienda"} · {INCIDENT_TYPE_LABEL[i.type]}</span>
                    <span className="block truncate text-xs text-slate-500">{i.description || "Sin descripción"} · hace {daysOpen(i, today)} días</span>
                  </span>
                  <span className={`badge shrink-0 ${PRIORITY_STYLE[i.priority]}`}>{PRIORITY_LABEL[i.priority]}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {noGeo > 0 && <div className="card border-amber-300 bg-amber-50 text-sm">{noGeo} tiendas sin ubicación en el mapa. Ve a <Link className="underline" href="/settings">Ajustes</Link> y pulsa «Geocodificar pendientes».</div>}
    </div>
  );
}
