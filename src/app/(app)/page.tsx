import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { loadAllStores, loadCompletedDates, loadSettings, withObligations } from "@/lib/server/load";
import { addDays, formatLong, madridDate, monthStart } from "@/lib/domain/dates";
import { googleMapsRouteUrl } from "@/lib/domain/geo";
import { StateBadge, Ring } from "@/components/ui";
import { StartVisitButton } from "@/components/StartVisitButton";
import { GenerateRoute } from "@/components/GenerateRoute";

interface Stop {
  id: string; store_id: string; position: number; planned_arrival: string | null; planned_minutes: number;
  stores: { name: string; town: string | null; address: string | null; postal_code: string | null; lat: number | null; lng: number | null; audit: boolean };
}

export default async function Today() {
  const sb = await supabaseServer();
  const today = madridDate();
  const [settings, stores, dates] = await Promise.all([loadSettings(), loadAllStores(), loadCompletedDates()]);
  const rows = withObligations(stores, dates, settings, today);

  const [{ data: route }, { data: tomorrow }, { data: open }, { data: alerts }, { data: monthVisits }] = await Promise.all([
    sb.from("routes").select("id,status").eq("route_date", today).maybeSingle(),
    sb.from("routes").select("id,status,route_date").gt("route_date", today).lte("route_date", addDays(today, 4)).eq("status", "proposed").order("route_date").limit(1).maybeSingle(),
    sb.from("visits").select("id,stores(name)").eq("status", "in_progress").limit(1).maybeSingle(),
    sb.from("alerts").select("id,message,severity").is("resolved_at", null).order("created_at", { ascending: false }).limit(4),
    sb.from("visits").select("id", { count: "exact", head: false }).eq("status", "completed").gte("visit_date", monthStart(today)).lte("visit_date", today),
  ]);

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

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-slate-500">{formatLong(today)}</p>
        <h1 className="text-3xl font-bold tracking-tight">{greeting}</h1>
      </header>

      {open && (
        <Link href={`/visits/${open.id}`} className="card tap flex items-center justify-between gap-3 !bg-slate-900 !text-white">
          <span className="min-w-0"><span className="block text-xs opacity-70">Visita en curso</span><b className="block truncate">{(open.stores as unknown as { name: string } | null)?.name}</b></span>
          <span className="shrink-0 text-sm underline">Continuar</span>
        </Link>
      )}

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">Ruta de hoy</h2>
          {route && <Link href={`/routes/${today}`} className="text-sm underline">{route.status === "proposed" ? "Revisar y aceptar" : "Ver ruta"}</Link>}
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

      <section className="card grid grid-cols-2 gap-y-5 sm:grid-cols-4">
        <Ring label="Ruta de hoy" value={doneStops} total={stops.length} display={stops.length ? `${doneStops}/${stops.length}` : "—"} />
        <Ring label="Cumplimiento" value={cumplidas} total={conObl} display={conObl ? `${Math.round((cumplidas / conObl) * 100)}%` : "—"} color="rgb(var(--st-ok))" />
        <Ring label="Atrasadas" value={atrasadas} total={conObl} color="rgb(var(--st-late))" />
        <Ring label="Vencen pronto" value={proximas} total={conObl} color="rgb(var(--st-soon))" />
      </section>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <section className="card">
          <h2 className="mb-2 font-medium">Prioritarias ahora</h2>
          {top.length === 0 ? <p className="text-sm text-slate-500">Nada pendiente. El seguimiento arranca el {settings.tracking_start}.</p> : (
            <ul className="divide-y divide-slate-200">
              {top.map((s) => (
                <li key={s.id}>
                  <Link href={`/stores/${s.id}`} className="row-link -mx-2 flex min-h-12 items-center justify-between gap-2 rounded-xl px-2 py-2 text-sm">
                    <span className="min-w-0 truncate">{s.audit && <span className="badge mr-1 bg-slate-900 text-white">Audit</span>}{s.name}</span>
                    <StateBadge state={s.ob.state} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <h2 className="mb-2 font-medium">Alertas</h2>
          {(alerts ?? []).length === 0 ? <p className="text-sm text-slate-500">Sin alertas.</p> : (
            <ul className="space-y-2 text-sm">{alerts!.map((a) => <li key={a.id} className={a.severity === "error" ? "text-red-600" : a.severity === "warning" ? "text-amber-700" : "text-slate-600"}>{a.message}</li>)}</ul>
          )}
          <p className="mt-3 text-xs text-slate-400">{(monthVisits ?? []).length} visitas completadas este mes</p>
        </section>
      </div>

      {noGeo > 0 && <div className="card border-amber-300 bg-amber-50 text-sm">{noGeo} tiendas sin ubicación en el mapa. Ve a <Link className="underline" href="/settings">Ajustes</Link> y pulsa «Geocodificar pendientes».</div>}
    </div>
  );
}
