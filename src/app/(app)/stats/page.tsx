import { supabaseServer } from "@/lib/supabase/server";
import { loadAllStores, loadCompletedDates, loadSettings, withObligations } from "@/lib/server/load";
import { PageHeader, Kpi } from "@/components/ui";
import { CONCEPTS, FREQ_LABEL, VISIT_TYPES } from "@/lib/types";
import { addDays, madridDate } from "@/lib/domain/dates";

function Bars({ data, unit = "" }: { data: { label: string; value: number }[]; unit?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <p className="text-sm text-slate-500">Sin datos todavía.</p>;
  return (
    <ul className="space-y-1.5">
      {data.map((d) => (
        <li key={d.label} className="grid grid-cols-[8rem_1fr_3.5rem] items-center gap-2 text-sm">
          <span className="truncate text-slate-600">{d.label}</span>
          <span className="h-3 rounded bg-slate-100"><span className="block h-3 rounded bg-brand-500" style={{ width: `${(d.value / max) * 100}%` }} /></span>
          <span className="text-right tabular-nums">{d.value}{unit}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const includeDemo = demo === "1";
  const sb = await supabaseServer();
  const today = madridDate();
  const since = addDays(today, -180);
  const [settings, stores, dates, { data: vis }, { data: pays }] = await Promise.all([
    loadSettings(), loadAllStores(), loadCompletedDates(),
    sb.from("visits").select("visit_date,visit_type,duration_minutes,is_manual,stores(town)").eq("status", "completed").gte("visit_date", since).limit(5000),
    sb.from("payment_records").select("concept,amount,status,is_demo").limit(5000),
  ]);
  const visits = (vis ?? []) as unknown as { visit_date: string; visit_type: string; duration_minutes: number | null; is_manual: boolean; stores: { town: string | null } | null }[];
  const rows = withObligations(stores, dates, settings, today);

  const byMonth = new Map<string, number>();
  const byType = new Map<string, number>();
  const byTown = new Map<string, number>();
  for (const v of visits) {
    byMonth.set(v.visit_date.slice(0, 7), (byMonth.get(v.visit_date.slice(0, 7)) ?? 0) + 1);
    byType.set(v.visit_type, (byType.get(v.visit_type) ?? 0) + 1);
    const t = v.stores?.town ?? "—";
    byTown.set(t, (byTown.get(t) ?? 0) + 1);
  }
  const real = visits.filter((v) => !v.is_manual && v.duration_minutes != null);
  const avgReal = real.length ? Math.round(real.reduce((a, v) => a + (v.duration_minutes ?? 0), 0) / real.length) : null;

  const comp = (["semanal", "quincenal", "mensual"] as const).map((f) => {
    const g = rows.filter((r) => r.frequency === f && r.ob.state !== "sin_obligacion");
    return { label: FREQ_LABEL[f], value: g.length ? Math.round((g.filter((r) => r.ob.state === "cumplida").length / g.length) * 100) : 0 };
  });

  const payAgg = new Map<string, Map<string, number>>();
  for (const p of pays ?? []) {
    if (p.is_demo && !includeDemo) continue;
    const m = payAgg.get(p.status) ?? new Map();
    m.set(p.concept, (m.get(p.concept) ?? 0) + Number(p.amount));
    payAgg.set(p.status, m);
  }
  const eur = (n: number) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
  const tot = (st: string) => [...(payAgg.get(st)?.values() ?? [])].reduce((a, b) => a + b, 0);

  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader title="Estadísticas">
        <a className="btn-secondary" href={includeDemo ? "/stats" : "/stats?demo=1"}>{includeDemo ? "Ocultar datos DEMO" : "Incluir datos DEMO"}</a>
      </PageHeader>
      <p className="text-xs text-slate-500">Visitas completadas de los últimos 180 días. Las visitas registradas a mano tienen duración declarada, no medida: la duración media «real» solo usa visitas cronometradas.</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Visitas (180 días)" value={visits.length} />
        <Kpi label="Duración media (cronometrada)" value={avgReal != null ? `${avgReal} min` : "—"} hint={`${real.length} visitas medidas`} />
        <Kpi label="Cobros comprobados" value={eur(tot("comprobado"))} hint={includeDemo ? "incluye DEMO" : "sin DEMO"} />
        <Kpi label="Cobros abonados" value={eur(tot("abonado"))} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="card"><h2 className="mb-2 font-medium">Visitas por mes</h2><Bars data={[...byMonth].sort().map(([label, value]) => ({ label, value }))} /></section>
        <section className="card"><h2 className="mb-2 font-medium">Cumplimiento actual por periodicidad</h2><Bars data={comp} unit="%" /></section>
        <section className="card"><h2 className="mb-2 font-medium">Por tipo de visita</h2><Bars data={[...byType].map(([k, value]) => ({ label: VISIT_TYPES[k] ?? k, value }))} /></section>
        <section className="card"><h2 className="mb-2 font-medium">Por municipio (top 10)</h2><Bars data={[...byTown].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, value]) => ({ label, value }))} /></section>
      </div>
      <section className="card">
        <h2 className="mb-2 font-medium">Pagos por concepto y estado</h2>
        {payAgg.size === 0 ? <p className="text-sm text-slate-500">No hay pagos registrados{includeDemo ? "" : " (los datos DEMO están ocultos)"}.</p> : (
          <table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th>Concepto</th><th>Previsto</th><th>Comprobado</th><th>Abonado</th></tr></thead>
            <tbody>{Object.entries(CONCEPTS).map(([k, l]) => (
              <tr key={k} className="border-t border-slate-100"><td className="py-1">{l}</td>{["previsto", "comprobado", "abonado"].map((st) => <td key={st}>{eur(payAgg.get(st)?.get(k) ?? 0)}</td>)}</tr>
            ))}</tbody></table>
        )}
      </section>
    </div>
  );
}
