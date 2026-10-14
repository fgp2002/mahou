import Link from "next/link";
import clsx from "clsx";
import { supabaseServer } from "@/lib/supabase/server";
import { loadAllStores, loadCompletedDates, loadSettings, withObligations } from "@/lib/server/load";
import { PageHeader, Kpi, EmptyState } from "@/components/ui";
import { FREQ_LABEL } from "@/lib/types";
import { addDays, madridDate, weekStart } from "@/lib/domain/dates";
import { STATE_LABEL, type DueState } from "@/lib/domain/periodicity";

const STATE_COLOR: Record<DueState, string> = {
  cumplida: "bg-green-600", pendiente: "bg-amber-600", proxima: "bg-orange-800", atrasada: "bg-red-600", sin_obligacion: "bg-slate-300",
};
const ORDER: DueState[] = ["cumplida", "pendiente", "proxima", "atrasada", "sin_obligacion"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function Columns({ data }: { data: { label: string; value: number; current?: boolean }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex h-48 items-end gap-1.5 sm:gap-2">
      {data.map((d) => (
        <div key={d.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
          <span className="text-[11px] font-semibold tabular-nums text-slate-600">{d.value || ""}</span>
          <div className={clsx("bar-grow w-full rounded-t-xl rounded-b-md", d.current ? "bg-slate-900" : "bg-green-600")} style={{ height: `${Math.max(d.value ? 6 : 2, (d.value / max) * 100)}%`, opacity: d.value ? 1 : 0.25 }} />
          <span className="w-full truncate text-center text-[10px] text-slate-500">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ demo?: string; g?: string }> }) {
  const { demo, g } = await searchParams;
  const includeDemo = demo === "1";
  const byMonthView = g === "mes";
  const sb = await supabaseServer();
  const today = madridDate();
  const since = addDays(today, -365);
  const [settings, stores, dates, { data: vis }, { data: pays }] = await Promise.all([
    loadSettings(), loadAllStores(), loadCompletedDates(),
    sb.from("visits").select("visit_date,duration_minutes,is_manual,stores(town)").eq("status", "completed").gte("visit_date", since).limit(10000),
    sb.from("payment_records").select("concept,concept_name,amount,status,is_demo").limit(5000),
  ]);
  const visits = (vis ?? []) as unknown as { visit_date: string; duration_minutes: number | null; is_manual: boolean; stores: { town: string | null } | null }[];
  const rows = withObligations(stores, dates, settings, today);

  // Visitas por semana (12) o por mes (12)
  const series: { label: string; value: number; current?: boolean }[] = [];
  if (byMonthView) {
    const [y, m] = today.split("-").map(Number);
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(y, m - 1 - i, 1));
      const key = d.toISOString().slice(0, 7);
      series.push({ label: MONTHS[d.getUTCMonth()], value: visits.filter((v) => v.visit_date.startsWith(key)).length, current: i === 0 });
    }
  } else {
    const w0 = weekStart(today);
    for (let i = 11; i >= 0; i--) {
      const ws = addDays(w0, -7 * i);
      const we = addDays(ws, 6);
      series.push({ label: `${ws.slice(8, 10)}/${ws.slice(5, 7)}`, value: visits.filter((v) => v.visit_date >= ws && v.visit_date <= we).length, current: i === 0 });
    }
  }
  const real = visits.filter((v) => !v.is_manual && v.duration_minutes != null);
  const avgReal = real.length ? Math.round(real.reduce((a, v) => a + (v.duration_minutes ?? 0), 0) / real.length) : null;

  // Cumplimiento por periodicidad, apilado por estado
  const comp = (["semanal", "quincenal", "mensual"] as const).map((f) => {
    const grp = rows.filter((r) => r.frequency === f);
    const counts = Object.fromEntries(ORDER.map((st) => [st, grp.filter((r) => r.ob.state === st).length])) as Record<DueState, number>;
    return { f, total: grp.length, counts };
  }).filter((c) => c.total > 0);
  const withOb = rows.filter((r) => r.ob.state !== "sin_obligacion");
  const pctOk = withOb.length ? Math.round((withOb.filter((r) => r.ob.state === "cumplida").length / withOb.length) * 100) : null;

  // Mapa de calor por municipio (visitas del último año)
  const zone = new Map<string, { visits: number; stores: number; late: number }>();
  for (const r of rows) {
    const t = r.town ?? "—";
    const z = zone.get(t) ?? { visits: 0, stores: 0, late: 0 };
    z.stores++;
    if (r.ob.state === "atrasada") z.late++;
    zone.set(t, z);
  }
  for (const v of visits) {
    const t = v.stores?.town ?? "—";
    const z = zone.get(t) ?? { visits: 0, stores: 0, late: 0 };
    z.visits++;
    zone.set(t, z);
  }
  const zones = [...zone].sort((a, b) => b[1].visits - a[1].visits || b[1].stores - a[1].stores).slice(0, 24);
  const zmax = Math.max(1, ...zones.map(([, z]) => z.visits));

  const payAgg = new Map<string, Map<string, number>>();
  for (const p of pays ?? []) {
    if (p.is_demo && !includeDemo) continue;
    const m = payAgg.get(p.status) ?? new Map();
    const key = p.concept_name ?? p.concept;
    m.set(key, (m.get(key) ?? 0) + Number(p.amount));
    payAgg.set(p.status, m);
  }
  const eur = (n: number) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
  const tot = (st: string) => [...(payAgg.get(st)?.values() ?? [])].reduce((a, b) => a + b, 0);
  const qs = (o: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    const all = { demo, g, ...o };
    for (const [k, v] of Object.entries(all)) if (v) u.set(k, v);
    const s = u.toString();
    return s ? `/stats?${s}` : "/stats";
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title="Estadísticas">
        <Link className="btn-secondary" href={qs({ demo: includeDemo ? undefined : "1" })}>{includeDemo ? "Ocultar DEMO" : "Incluir DEMO"}</Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Cumplimiento" value={pctOk != null ? `${pctOk}%` : "—"} tone={pctOk == null ? undefined : pctOk >= 80 ? "green" : pctOk >= 50 ? "amber" : "red"} hint={`${withOb.length} tiendas con obligación`} />
        <Kpi label="Visitas (12 meses)" value={visits.length} />
        <Kpi label="Duración media" value={avgReal != null ? `${avgReal} min` : "—"} hint={`${real.length} cronometradas`} />
        <Kpi label="Abonado" value={eur(tot("abonado"))} hint={`Comprobado ${eur(tot("comprobado"))}`} />
      </div>

      <section className="card space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Visitas por {byMonthView ? "mes" : "semana"}</h2>
          <div className="flex rounded-full bg-slate-100 p-1 text-xs font-semibold">
            <Link href={qs({ g: undefined })} className={clsx("rounded-full px-3 py-1.5 transition", !byMonthView ? "bg-white shadow-card" : "text-slate-500")}>Semana</Link>
            <Link href={qs({ g: "mes" })} className={clsx("rounded-full px-3 py-1.5 transition", byMonthView ? "bg-white shadow-card" : "text-slate-500")}>Mes</Link>
          </div>
        </div>
        {visits.length === 0 ? <EmptyState title="Aún no hay visitas" text="Las gráficas se llenan solas cuando completes visitas." /> : <Columns data={series} />}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card space-y-4">
          <h2 className="font-semibold">Cumplimiento de periodicidad</h2>
          {comp.length === 0 ? <p className="text-sm text-slate-500">Sin tiendas con periodicidad.</p> : comp.map((c) => (
            <div key={c.f} className="space-y-1.5">
              <div className="flex justify-between text-sm"><span>{FREQ_LABEL[c.f]}</span><span className="text-slate-500">{c.total} tiendas</span></div>
              <div className="flex h-4 overflow-hidden rounded-full bg-slate-100">
                {ORDER.map((st) => c.counts[st] > 0 && (
                  <span key={st} title={`${STATE_LABEL[st]}: ${c.counts[st]}`} className={clsx("bar-grow-x h-full", STATE_COLOR[st])} style={{ width: `${(c.counts[st] / c.total) * 100}%` }} />
                ))}
              </div>
            </div>
          ))}
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
            {ORDER.map((st) => <li key={st} className="flex items-center gap-1.5"><span className={clsx("h-2.5 w-2.5 rounded-full", STATE_COLOR[st])} />{STATE_LABEL[st]}</li>)}
          </ul>
        </section>

        <section className="card space-y-3">
          <h2 className="font-semibold">Mapa de calor por zona</h2>
          <p className="text-xs text-slate-500">Más intenso = más visitas en el último año. El punto rojo indica tiendas atrasadas.</p>
          {zones.length === 0 ? <p className="text-sm text-slate-500">Sin datos.</p> : (
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {zones.map(([town, z]) => {
                const k = z.visits / zmax;
                return (
                  <div key={town} className="relative rounded-2xl p-2.5" style={{ backgroundColor: `rgb(var(--green-600) / ${0.08 + k * 0.82})`, color: k > 0.55 ? "white" : undefined }}>
                    <div className="truncate text-xs font-semibold">{town}</div>
                    <div className="text-[11px] opacity-80">{z.visits} visitas · {z.stores} tiendas</div>
                    {z.late > 0 && <span title={`${z.late} atrasadas`} className="absolute right-2 top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{z.late}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <section className="card">
        <h2 className="mb-3 font-semibold">Pagos por tipo y estado</h2>
        {payAgg.size === 0 ? <p className="text-sm text-slate-500">No hay pagos registrados{includeDemo ? "" : " (los DEMO están ocultos)"}.</p> : (
          <div className="h-scroll -mx-4 px-4 md:mx-0 md:px-0">
            <table className="w-full min-w-[28rem] text-sm"><thead><tr className="text-left text-xs text-slate-500"><th className="pb-2">Tipo</th><th>Previsto</th><th>Comprobado</th><th>Abonado</th></tr></thead>
              <tbody>{[...new Set([...payAgg.values()].flatMap((m) => [...m.keys()]))].sort().map((k) => (
                <tr key={k} className="border-t border-slate-100"><td className="py-2 font-medium">{k}</td>{["previsto", "comprobado", "abonado"].map((st) => <td key={st} className="tabular-nums">{eur(payAgg.get(st)?.get(k) ?? 0)}</td>)}</tr>
              ))}</tbody></table>
          </div>
        )}
      </section>
    </div>
  );
}
