import Link from "next/link";
import clsx from "clsx";
import { ArrowDownRight, ArrowUpRight, FileSpreadsheet, FileText } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui";
import { FilterBar } from "@/components/FilterBar";
import { PeriodPicker } from "@/components/PeriodPicker";
import { PrintButton } from "@/components/PrintButton";
import { buildReport } from "@/lib/server/report";
import { loadStoresLite } from "@/lib/server/economy";
import { madridDate, fmtDuration } from "@/lib/domain/dates";
import { deltaPct, parseRange, UNIT_LABEL, type Unit } from "@/lib/economy";
import { pct } from "@/lib/domain/report";
import { eur, MONTHS_SHORT } from "@/lib/format";
import { FREQ_LABEL } from "@/lib/types";

export const metadata = { title: "Informes · Mahou" };

function Delta({ now, before, invert, suffix = "%" }: { now: number | null; before: number | null; invert?: boolean; suffix?: string }) {
  if (now == null || before == null) return null;
  const d = suffix === " p." ? Math.round((now - before) * 10) / 10 : deltaPct(now, before);
  if (d == null) return null;
  const good = invert ? d < 0 : d > 0;
  return <span className={clsx("inline-flex items-center gap-0.5 text-[11px] font-semibold", d === 0 ? "text-slate-500" : good ? "text-green-700" : "text-[rgb(var(--st-late))]")}>{d === 0 ? "=" : d > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{Math.abs(d)}{suffix}</span>;
}

function Stat({ label, value, sub, children }: { label: string; value: React.ReactNode; sub?: string; children?: React.ReactNode }) {
  return <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] text-slate-500">{label}</div><div className="text-lg font-bold tabular-nums">{value}</div>{sub && <div className="text-[11px] text-slate-500">{sub}</div>}{children}</div>;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const one = (k: string) => { const v = raw[k]; return Array.isArray(v) ? v[0] : v; };
  const many = (k: string) => { const v = raw[k]; return (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean); };
  const range = parseRange({ period: one("period"), from: one("from"), to: one("to") }, madridDate());
  const scope = { banner: many("banner"), store: many("store") };
  const [r, stores] = await Promise.all([buildReport(range, scope), loadStoresLite()]);
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (v) for (const x of Array.isArray(v) ? v : [v]) qs.append(k, x);
  const units = (u: Partial<Record<Unit, number>>) => Object.entries(u).map(([k, n]) => `${Math.round(Number(n) * 10) / 10} ${UNIT_LABEL[k as Unit]}`).join(" · ");
  const banners = [...new Set(stores.map((s) => s.banner).filter(Boolean))].sort() as string[];
  const p = r.productivity, c = r.commercial, a = r.activity;
  const trendMax = Math.max(1, ...r.trend.map((t) => t.executed));

  return (
    <div className="report mx-auto max-w-5xl space-y-5">
      <PageHeader title="Informes">
        <a className="btn-secondary no-print" href={`/api/reports/export?format=xlsx&${qs}`}><FileSpreadsheet size={16} /> Excel</a>
        <a className="btn-secondary no-print" href={`/api/reports/export?format=csv&${qs}`}><FileText size={16} /> CSV</a>
        <PrintButton />
      </PageHeader>
      <div className="no-print space-y-3">
        <PeriodPicker />
        <FilterBar filters={[
          { name: "banner", label: "Cadena / enseña", options: banners.map((b) => [b, b]), all: "Todas" },
          { name: "store", label: "Tienda", options: stores.filter((s) => !scope.banner.length || scope.banner.includes(s.banner ?? "")).map((s) => [s.id, `${s.name}${s.town ? ` · ${s.town}` : ""}`]), all: "Todas" },
        ]} />
      </div>

      <header className="card">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Informe de actividad · Mahou San Miguel</div>
        <h2 className="text-xl font-bold">{r.scopeLabel} · {range.label}</h2>
        <p className="text-sm text-slate-500">{a.storesInScope} tienda{a.storesInScope === 1 ? "" : "s"} · comparado con {r.prev.label} · generado el {new Date(r.generatedAt).toLocaleString("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" })}</p>
      </header>

      <section className="card space-y-3">
        <h3 className="font-semibold">Actividad</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Visitas obligatorias" value={a.comp.required} />
          <Stat label="Cumplidas" value={a.comp.done}><Delta now={a.comp.done} before={null} /></Stat>
          <Stat label="Pendientes / incumplidas" value={`${a.comp.pending} / ${a.comp.missed}`} sub="abiertas aún / ya cerradas" />
          <Stat label="Cumplimiento" value={a.pct != null ? `${a.pct} %` : "—"}><Delta now={a.pct} before={r.previous.pct} suffix=" p." /></Stat>
        </div>
        <div className="h-scroll">
          <table className="data-table">
            <thead><tr><th className="pl-3">Periodicidad</th><th className="text-right">Obligatorias</th><th className="text-right">Cumplidas</th><th className="text-right">Pendientes</th><th className="text-right">Incumplidas</th><th className="text-right">%</th></tr></thead>
            <tbody>
              {(["semanal", "quincenal", "mensual"] as const).filter((f) => a.byFreq[f]?.required).map((f) => (
                <tr key={f}><td className="pl-3">{FREQ_LABEL[f]}</td><td className="text-right tabular-nums">{a.byFreq[f].required}</td><td className="text-right tabular-nums">{a.byFreq[f].done}</td><td className="text-right tabular-nums">{a.byFreq[f].pending}</td><td className="text-right tabular-nums">{a.byFreq[f].missed}</td><td className="text-right font-semibold tabular-nums">{pct(a.byFreq[f].done, a.byFreq[f].required) ?? "—"}</td></tr>
              ))}
              {a.audit.required > 0 && <tr><td className="pl-3 font-semibold">De ellas, Audit</td><td className="text-right tabular-nums">{a.audit.required}</td><td className="text-right tabular-nums">{a.audit.done}</td><td className="text-right tabular-nums">{a.audit.pending}</td><td className="text-right tabular-nums">{a.audit.missed}</td><td className="text-right font-semibold tabular-nums">{pct(a.audit.done, a.audit.required) ?? "—"}</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">Cada semana, quincena o mes obligatorio cuenta una vez; «cumplida» si hubo al menos una visita. Las Audit sin periodicidad cuentan como mensuales. {a.cancelled > 0 && `${a.cancelled} visita${a.cancelled === 1 ? "" : "s"} cancelada${a.cancelled === 1 ? "" : "s"} en el periodo.`}</p>
      </section>

      <section className="card space-y-3">
        <h3 className="font-semibold">Productividad</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Visitas realizadas" value={p.visits}><Delta now={p.visits} before={r.previous.visits} /></Stat>
          <Stat label="Horas en tienda" value={fmtDuration(p.minutes)}><Delta now={p.minutes} before={r.previous.minutes} /></Stat>
          <Stat label="Tiempo medio por visita" value={p.avgMinutes != null ? `${p.avgMinutes} min` : "—"} />
          <Stat label="Previsto frente a real" value={p.comparable ? `${fmtDuration(p.plannedMinutes)} / ${fmtDuration(p.realMinutes)}` : "—"} sub={p.comparable ? `${p.realMinutes > p.plannedMinutes ? "+" : ""}${Math.round(((p.realMinutes - p.plannedMinutes) / Math.max(1, p.plannedMinutes)) * 100)} % en ${p.comparable} visitas` : undefined} />
          <Stat label="Conducción" value={p.driveMinutes ? fmtDuration(p.driveMinutes) : "—"} sub={p.routeDays ? `según ${p.routeDays} ruta${p.routeDays === 1 ? "" : "s"} aceptada${p.routeDays === 1 ? "" : "s"}` : "sin rutas aceptadas"} />
          <Stat label="Kilómetros" value={p.km ? `${p.km.toLocaleString("es-ES")} km` : "—"} sub="estimados por las rutas" />
        </div>
      </section>

      <section className="card space-y-3">
        <h3 className="font-semibold">Gestión comercial</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Inversión ejecutada" value={eur(c.totals.executed)}><Delta now={c.totals.executed} before={r.previous.executed} invert /></Stat>
          <Stat label="Abonado en dinero" value={eur(c.totals.paidCash)} />
          <Stat label="En especie (valorado)" value={eur(c.totals.paidInKind)} sub={units(c.totals.units) || undefined} />
          <Stat label="Pendiente de pago" value={eur(c.totals.pending)} />
          <Stat label="Comprometido por acuerdos" value={eur(c.committed)} />
          <Stat label="Acuerdos activos" value={c.agreementsActive} />
          <Stat label="Elementos instalados / retirados" value={`${c.installed} / ${c.removed}`}><Delta now={c.installed} before={r.previous.installed} /></Stat>
          <Stat label="Incidencias abiertas / resueltas" value={`${c.incOpened} / ${c.incResolved}`} sub={`${c.incOpenNow} siguen abiertas hoy`} />
        </div>
        {c.byCategory.length > 0 && (
          <div className="h-scroll"><table className="data-table">
            <thead><tr><th className="pl-3">Tipo de inversión</th><th className="text-right">Ejecutado</th><th>Unidades</th></tr></thead>
            <tbody>{c.byCategory.map((x) => <tr key={x.name}><td className="pl-3">{x.name}</td><td className="text-right font-semibold tabular-nums">{eur(x.executed)}</td><td className="text-slate-500">{units(x.units) || "—"}</td></tr>)}</tbody>
          </table></div>
        )}
        {Object.keys(c.elementsNow).length > 0 && <p className="text-sm text-slate-600"><b>Equipamiento instalado hoy:</b> {Object.entries(c.elementsNow).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${n} ${k.toLowerCase()}`).join(" · ")}</p>}
      </section>

      <section className="card space-y-3">
        <h3 className="font-semibold">Evolución (6 meses)</h3>
        <div className="h-scroll"><table className="data-table">
          <thead><tr><th className="pl-3">Mes</th><th className="text-right">Cumplimiento</th><th className="text-right">Visitas</th><th>Inversión ejecutada</th><th className="text-right">Instalados</th><th className="text-right">Retirados</th></tr></thead>
          <tbody>{r.trend.map((t) => (
            <tr key={t.m}>
              <td className="pl-3 whitespace-nowrap">{MONTHS_SHORT[Number(t.m.slice(5, 7)) - 1]} {t.m.slice(0, 4)}</td>
              <td className="text-right tabular-nums">{t.pct != null ? `${t.pct} %` : "—"}</td>
              <td className="text-right tabular-nums">{t.visits}</td>
              <td><div className="flex items-center gap-2"><span className="h-2 rounded-full bg-brand-600" style={{ width: `${Math.max(2, (t.executed / trendMax) * 120)}px` }} /><span className="tabular-nums">{eur(t.executed)}</span></div></td>
              <td className="text-right tabular-nums">{t.installed}</td>
              <td className="text-right tabular-nums">{t.removed}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>

      <section className="card !p-0">
        <h3 className="px-4 pt-4 font-semibold md:px-5">Detalle por tienda ({r.stores.length})</h3>
        {r.stores.length === 0 ? <div className="p-4"><EmptyState title="Sin datos" text="No hay actividad en este periodo para el alcance elegido." /></div> : (
          <div className="h-scroll mt-2"><table className="data-table">
            <thead><tr><th className="pl-4">Tienda</th><th className="text-right">Visitas</th><th className="text-right">Cumpl.</th><th className="text-right">Inversión</th><th>Equipamiento</th><th className="text-right">Incid.</th></tr></thead>
            <tbody>{r.stores.slice(0, 400).map((s) => (
              <tr key={s.id}>
                <td className="pl-4"><Link href={`/stores/${s.id}`} className="font-medium hover:text-brand-600">{s.name}</Link><div className="text-xs text-slate-500">{[s.banner, s.town, s.audit ? "Audit" : null].filter(Boolean).join(" · ")}</div></td>
                <td className="text-right tabular-nums">{s.visits}</td>
                <td className="text-right tabular-nums">{s.comp.required ? `${s.comp.done}/${s.comp.required}` : "—"}</td>
                <td className="text-right font-semibold tabular-nums">{s.executed ? eur(s.executed) : "—"}</td>
                <td className="text-xs text-slate-600">{Object.entries(s.elements).map(([k, n]) => `${n} ${k.toLowerCase()}`).join(" · ") || "—"}</td>
                <td className={clsx("text-right tabular-nums", s.incOpen > 0 && "font-semibold text-[rgb(var(--st-late))]")}>{s.incOpen || "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
      <p className="text-xs text-slate-500">La inversión ejecutada suma lo comprobado y lo abonado. El dinero abonado y lo entregado en especie se muestran por separado. Los kilómetros y la conducción son estimaciones de las rutas aceptadas.</p>
    </div>
  );
}
