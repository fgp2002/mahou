import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { loadAllStores, loadCompletedDates, loadSettings, withObligations } from "@/lib/server/load";
import { madridDate, monthStart, formatLong } from "@/lib/domain/dates";
import { Kpi, PageHeader, StateBadge } from "@/components/ui";

export default async function Dashboard() {
  const sb = await supabaseServer();
  const today = madridDate();
  const [settings, stores, dates] = await Promise.all([loadSettings(), loadAllStores(), loadCompletedDates()]);
  const rows = withObligations(stores, dates, settings, today);

  const [{ data: monthVisits }, { data: route }, { data: alerts }] = await Promise.all([
    sb.from("visits").select("duration_minutes").eq("status", "completed").gte("visit_date", monthStart(today)).lte("visit_date", today),
    sb.from("routes").select("id,status,route_date").eq("route_date", today).maybeSingle(),
    sb.from("alerts").select("id,message,severity,store_id,created_at").is("resolved_at", null).order("created_at", { ascending: false }).limit(8),
  ]);

  const total = rows.length;
  const geo = rows.filter((r) => r.lat != null).length;
  const audit = rows.filter((r) => r.audit).length;
  const atrasadas = rows.filter((r) => r.ob.state === "atrasada");
  const pendientes = rows.filter((r) => r.ob.pending > 0);
  const proximas = rows.filter((r) => r.ob.state === "proxima");
  const cumplidas = rows.filter((r) => r.ob.state === "cumplida").length;
  const conObl = rows.filter((r) => r.ob.state !== "sin_obligacion").length;
  const durs = (monthVisits ?? []).map((v) => v.duration_minutes).filter((d): d is number => d != null);
  const avg = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null;
  const top = [...pendientes].sort((a, b) => b.score - a.score).slice(0, 10);

  return (
    <div className="space-y-4">
      <PageHeader title="Panel">
        <span className="text-sm text-slate-500">{formatLong(today)}</span>
      </PageHeader>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Tiendas activas" value={total} hint={`${geo} con ubicación`} />
        <Kpi label="Audit (prioridad máx.)" value={audit} />
        <Kpi label="Pendientes ahora" value={pendientes.length} tone={pendientes.length ? "amber" : "green"} />
        <Kpi label="Atrasadas" value={atrasadas.length} tone={atrasadas.length ? "red" : "green"} />
        <Kpi label="Vencen pronto" value={proximas.length} />
        <Kpi label="Cumplimiento periodo" value={conObl ? `${Math.round((cumplidas / conObl) * 100)}%` : "—"} hint={`${cumplidas} de ${conObl}`} />
        <Kpi label="Visitas este mes" value={durs.length} hint={avg != null ? `Media ${avg} min` : "Sin datos aún"} />
        <Kpi label="Ruta de hoy" value={route ? (route.status === "accepted" ? "Aceptada" : route.status === "proposed" ? "Propuesta" : route.status) : "Sin ruta"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-2 font-medium">Próximas a visitar</h2>
          {top.length === 0 ? (
            <p className="text-sm text-slate-500">No hay tiendas pendientes. Si acabas de empezar, el seguimiento arranca el {settings.tracking_start}.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {top.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <Link href={`/stores/${s.id}`} className="min-w-0 truncate hover:underline">
                    {s.audit && <span className="badge mr-1 bg-brand-100 text-brand-700">Audit</span>}
                    {s.name} <span className="text-slate-400">· {s.town}</span>
                  </Link>
                  <StateBadge state={s.ob.state} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <h2 className="mb-2 font-medium">Alertas</h2>
          {(alerts ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">Sin alertas.</p>
          ) : (
            <ul className="space-y-2">
              {alerts!.map((a) => (
                <li key={a.id} className="text-sm">
                  <span className={a.severity === "error" ? "text-red-600" : a.severity === "warning" ? "text-amber-600" : "text-slate-600"}>{a.message}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {geo < total && (
        <div className="card border-amber-300 bg-amber-50 text-sm">
          {total - geo} tiendas sin ubicación en el mapa. Ve a <Link className="underline" href="/settings">Ajustes</Link> y pulsa «Geocodificar pendientes».
        </div>
      )}
    </div>
  );
}
