import Link from "next/link";
import clsx from "clsx";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Download, FileSignature } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui";
import { FilterBar } from "@/components/FilterBar";
import { PeriodPicker } from "@/components/PeriodPicker";
import { loadAgreements, loadCatalog, loadPayments, loadStoresLite, parseEconomyFilters, scopeFilter } from "@/lib/server/economy";
import { madridDate } from "@/lib/domain/dates";
import { eur, dmy, MONTHS_SHORT } from "@/lib/format";
import {
  AGREEMENT_LABEL, committedIn, daysToEnd, deltaPct, findDuplicates, lastMonths, monthEnd, monthlyEquivalent, NATURE_LABEL, PAY_LABEL, PAY_ORDER, PAY_STYLE,
  parseRange, previousRange, totals, UNIT_LABEL, type Unit,
} from "@/lib/economy";

export const metadata = { title: "Economía · Mahou" };

function Delta({ now, before }: { now: number; before: number }) {
  const d = deltaPct(now, before);
  if (d == null) return <span className="text-[11px] text-slate-500">sin datos del periodo anterior</span>;
  const up = d > 0;
  return <span className={clsx("inline-flex items-center gap-0.5 text-[11px] font-semibold", d === 0 ? "text-slate-500" : up ? "text-[rgb(var(--st-soon))]" : "text-green-700")}>{d === 0 ? "=" : up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{Math.abs(d)} % vs anterior</span>;
}

export default async function EconomyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const one = (k: string) => { const v = raw[k]; return Array.isArray(v) ? v[0] : v; };
  const today = madridDate();
  const range = parseRange({ period: one("period"), from: one("from"), to: one("to") }, today);
  const prev = previousRange(range);
  const f = parseEconomyFilters(raw);
  const months = lastMonths(range.to, 12);
  const yearFrom = `${range.to.slice(0, 4)}-01-01`;
  const loadFrom = [months[0], prev.from, yearFrom].sort()[0];

  const [{ types, categories }, stores, payments, agreements] = await Promise.all([loadCatalog(), loadStoresLite(), loadPayments(loadFrom, range.to), loadAgreements()]);
  const storeById = new Map(stores.map((s) => [s.id, s]));
  const typeById = new Map(types.map((t) => [t.id, t]));
  const catById = new Map(categories.map((c) => [c.id, c]));
  const inScope = scopeFilter(f, storeById, typeById);
  const statusOk = (s: string) => !f.status.length || f.status.includes(s);
  const scoped = payments.filter((p) => inScope(p.store_id, p.payment_type_id) && statusOk(p.status)).map((p) => ({ ...p, amount: Number(p.amount) }));
  const inRange = (d: string, r: { from: string; to: string }) => d >= r.from && d <= r.to;
  const cur = scoped.filter((p) => inRange(p.payment_date, range));
  const before = scoped.filter((p) => inRange(p.payment_date, prev));
  const ytd = scoped.filter((p) => p.payment_date >= yearFrom && p.payment_date <= range.to);
  const T = totals(cur), P = totals(before), Y = totals(ytd);
  const ags = agreements.filter((a) => inScope(a.store_id, a.type_id)).map((a) => ({ ...a, amount: Number(a.amount) }));
  const committed = ags.reduce((s, a) => s + committedIn(a, range.from, range.to).amount, 0);
  const committedPrev = ags.reduce((s, a) => s + committedIn(a, prev.from, prev.to).amount, 0);

  // Por categoría: ejecutado (comprobado + abonado) y unidades.
  const byCat = new Map<string, { name: string; nature: string; executed: number; executedPrev: number; units: Partial<Record<Unit, number>> }>();
  const catOf = (typeId: string | null) => { const c = typeId ? catById.get(typeById.get(typeId)?.category_id ?? "") : undefined; return c ? { id: c.id, name: c.name, nature: c.nature } : { id: "sin_categoria", name: "Sin categoría", nature: "dinero" }; };
  for (const c of categories) byCat.set(c.id, { name: c.name, nature: c.nature, executed: 0, executedPrev: 0, units: {} });
  for (const [list, key] of [[cur, "executed"], [before, "executedPrev"]] as const) {
    for (const p of list) {
      if (p.status !== "comprobado" && p.status !== "abonado") continue;
      const c = catOf(p.payment_type_id);
      const row = byCat.get(c.id) ?? (byCat.set(c.id, { name: c.name, nature: c.nature, executed: 0, executedPrev: 0, units: {} }), byCat.get(c.id)!);
      row[key] += p.amount;
      if (key === "executed" && p.unit && p.unit !== "eur" && p.quantity) row.units[p.unit] = (row.units[p.unit] ?? 0) + Number(p.quantity);
    }
  }
  const cats = [...byCat.entries()].filter(([, c]) => c.executed || c.executedPrev);

  // Evolución: 12 meses de ejecutado (dinero y especie) y comprometido.
  const evo = months.map((m) => {
    const r = { from: m, to: monthEnd(m) };
    const done = scoped.filter((p) => inRange(p.payment_date, r) && (p.status === "comprobado" || p.status === "abonado"));
    const cash = done.filter((p) => p.settlement !== "especie").reduce((s, p) => s + p.amount, 0);
    const kind = done.filter((p) => p.settlement === "especie").reduce((s, p) => s + p.amount, 0);
    return { m, cash, kind, committed: ags.reduce((s, a) => s + committedIn(a, r.from, r.to).amount, 0) };
  });
  const evoMax = Math.max(1, ...evo.map((e) => Math.max(e.cash + e.kind, e.committed)));

  // Por enseña y tiendas con más inversión ejecutada en el periodo.
  const byBanner = new Map<string, number>();
  const byStore = new Map<string, number>();
  for (const p of cur) if (p.status === "comprobado" || p.status === "abonado") {
    const b = storeById.get(p.store_id)?.banner ?? "Sin enseña";
    byBanner.set(b, (byBanner.get(b) ?? 0) + p.amount);
    byStore.set(p.store_id, (byStore.get(p.store_id) ?? 0) + p.amount);
  }
  const banners = [...byBanner].sort((a, b) => b[1] - a[1]);
  const topStores = [...byStore].sort((a, b) => b[1] - a[1]).slice(0, 10);

  // Acuerdos que vencen en 60 días y posibles duplicados (últimos 12 meses).
  const expiring = ags.filter((a) => (a.status === "en_ejecucion" || a.status === "aprobado") && a.end_date).map((a) => ({ a, d: daysToEnd(a.end_date, today)! })).filter((x) => x.d >= 0 && x.d <= 60).sort((x, y) => x.d - y.d);
  const dups = findDuplicates(scoped.filter((p) => p.payment_date >= months[0]));
  const qs = (extra: Record<string, string>) => { const u = new URLSearchParams(); for (const [k, v] of Object.entries(raw)) if (v) for (const x of Array.isArray(v) ? v : [v]) u.append(k, x); for (const [k, v] of Object.entries(extra)) u.set(k, v); return u.toString(); };
  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a!.localeCompare(b!, "es")) as string[];
  const unitStr = (u: Partial<Record<Unit, number>>) => Object.entries(u).map(([k, n]) => `${Math.round(Number(n) * 100) / 100} ${UNIT_LABEL[k as Unit]}`).join(" · ");

  const Kpi = ({ label, value, hint, children, href }: { label: string; value: string; hint?: string; children?: React.ReactNode; href?: string }) => {
    const body = <><div className="text-xs text-slate-500">{label}</div><div className="mt-0.5 text-xl font-bold tabular-nums md:text-2xl">{value}</div>{hint && <div className="text-[11px] text-slate-500">{hint}</div>}{children}</>;
    return href ? <Link href={href} className="card tap !p-3 md:!p-4">{body}</Link> : <div className="card !p-3 md:!p-4">{body}</div>;
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Economía">
        <Link href="/agreements" className="btn-secondary"><FileSignature size={16} /> Acuerdos</Link>
        <a href={`/api/economy/export?${qs({})}`} className="btn-secondary"><Download size={16} /> CSV</a>
      </PageHeader>
      <PeriodPicker />
      <FilterBar filters={[
        { name: "banner", label: "Enseña", options: uniq(stores.map((s) => s.banner)).map((b) => [b, b]), all: "Todas" },
        { name: "chain", label: "Cadena", options: uniq(stores.map((s) => s.chain)).map((b) => [b, b]), all: "Todas" },
        { name: "store", label: "Tienda", options: stores.map((s) => [s.id, `${s.name}${s.town ? ` · ${s.town}` : ""}`]), all: "Todas" },
        { name: "category", label: "Tipo de inversión", options: categories.map((c) => [c.id, c.name]), all: "Todos" },
        { name: "type", label: "Concepto", options: types.map((t) => [t.id, t.name]) },
        { name: "status", label: "Estado del pago", options: PAY_ORDER.map((s) => [s, PAY_LABEL[s]]) },
      ]} />

      <p className="text-sm text-slate-500">Periodo: <b className="text-slate-900">{range.label}</b> · comparado con {prev.label}</p>
      <section className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
        <Kpi label="Inversión del periodo" value={eur(T.executed)} hint="comprobada + abonada"><Delta now={T.executed} before={P.executed} /></Kpi>
        <Kpi label={`Inversión ${range.to.slice(0, 4)} (hasta ${dmy(range.to)})`} value={eur(Y.executed)} />
        <Kpi label="Comprometido" value={eur(committed)} hint="acuerdos firmes del periodo" href="/agreements"><Delta now={committed} before={committedPrev} /></Kpi>
        <Kpi label="Pendiente" value={eur(T.pending)} hint="previsto, aprobado o comprobado sin abonar" href={`/economy?${qs({ status: "previsto" })}`} />
        <Kpi label="Abonado en dinero" value={eur(T.paidCash)} hint="salida de caja real" />
        <Kpi label="Valorado en especie" value={eur(T.paidInKind)} hint={unitStr(T.units) || "horas, producto o material"} />
      </section>

      {cur.length === 0 && committed === 0 ? (
        <div className="card"><EmptyState title="Sin movimientos en este periodo" text="Cambia el periodo o los filtros, o registra pagos y acuerdos desde la ficha de cada tienda." /></div>
      ) : (
        <>
          <section className="card space-y-3">
            <h2 className="font-semibold">Por tipo de inversión</h2>
            <ul className="space-y-2.5">
              {cats.map(([id, c]) => (
                <li key={id}>
                  <div className="flex items-baseline justify-between gap-2 text-sm"><Link href={`/economy?${qs({ category: id })}`} className="font-medium hover:text-brand-600">{c.name} <span className="text-xs text-slate-500">({NATURE_LABEL[c.nature as keyof typeof NATURE_LABEL]})</span></Link><b className="tabular-nums">{eur(c.executed)}</b></div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className="bar-grow-x h-full rounded-full bg-brand-600" style={{ width: `${T.executed ? Math.max(2, (c.executed / T.executed) * 100) : 0}%` }} /></div>
                  <div className="mt-0.5 flex justify-between text-[11px] text-slate-500"><span>{unitStr(c.units)}</span><Delta now={c.executed} before={c.executedPrev} /></div>
                </li>
              ))}
              {cats.length === 0 && <li className="text-sm text-slate-500">Nada ejecutado en el periodo.</li>}
            </ul>
          </section>

          <section className="card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Evolución (12 meses)</h2>
              <span className="flex gap-3 text-[11px] text-slate-500"><span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-brand-600" />Dinero</span><span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-brand-300" />Especie</span><span className="inline-flex items-center gap-1"><i className="h-0.5 w-3 bg-slate-900" />Comprometido</span></span></div>
            <div className="flex h-40 items-end gap-1.5">
              {evo.map((e) => (
                <Link key={e.m} href={`/economy?${qs({ period: e.m.slice(0, 7) })}`} className="group relative flex h-full flex-1 flex-col justify-end" title={`${e.m.slice(5, 7)}/${e.m.slice(0, 4)}: ${eur(e.cash + e.kind)} ejecutado · ${eur(e.committed)} comprometido`}>
                  {e.committed > 0 && <span className="absolute inset-x-0 h-0.5 bg-slate-900" style={{ bottom: `${(e.committed / evoMax) * 100}%` }} />}
                  <span className="bar-grow w-full rounded-t-sm bg-brand-300" style={{ height: `${(e.kind / evoMax) * 100}%` }} />
                  <span className="bar-grow w-full bg-brand-600" style={{ height: `${(e.cash / evoMax) * 100}%`, borderRadius: e.kind ? 0 : "2px 2px 0 0" }} />
                  <span className={clsx("mt-1 text-center text-[10px]", e.m.slice(0, 7) === range.from.slice(0, 7) ? "font-bold text-slate-900" : "text-slate-500")}>{MONTHS_SHORT[Number(e.m.slice(5, 7)) - 1]}</span>
                </Link>
              ))}
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card space-y-2">
              <h2 className="font-semibold">Por enseña</h2>
              {banners.length === 0 ? <p className="text-sm text-slate-500">Sin inversión ejecutada.</p> : (
                <ul className="divide-y divide-slate-100 text-sm">{banners.map(([b, v]) => <li key={b}><Link href={`/economy?${qs({ banner: b })}`} className="row-link -mx-2 flex min-h-11 items-center justify-between rounded-lg px-2"><span>{b}</span><b className="tabular-nums">{eur(v)}</b></Link></li>)}</ul>
              )}
            </section>
            <section className="card space-y-2">
              <h2 className="font-semibold">Tiendas con más inversión</h2>
              {topStores.length === 0 ? <p className="text-sm text-slate-500">Sin inversión ejecutada.</p> : (
                <ol className="divide-y divide-slate-100 text-sm">{topStores.map(([id, v]) => <li key={id}><Link href={`/stores/${id}?tab=pagos`} className="row-link -mx-2 flex min-h-11 items-center justify-between gap-2 rounded-lg px-2"><span className="truncate">{storeById.get(id)?.name}<span className="text-xs text-slate-500"> · {storeById.get(id)?.town}</span></span><b className="tabular-nums">{eur(v)}</b></Link></li>)}</ol>
              )}
            </section>
          </div>
        </>
      )}

      {(expiring.length > 0 || dups.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {expiring.length > 0 && (
            <section className="card space-y-2">
              <h2 className="font-semibold">Acuerdos que vencen en 60 días</h2>
              <ul className="divide-y divide-slate-100 text-sm">{expiring.map(({ a, d }) => (
                <li key={a.id}><Link href={`/stores/${a.store_id}?tab=pagos`} className="row-link -mx-2 flex min-h-11 items-center justify-between gap-2 rounded-lg px-2">
                  <span className="min-w-0"><span className="block truncate font-medium">{a.title || typeById.get(a.type_id)?.name}</span><span className="block truncate text-xs text-slate-500">{storeById.get(a.store_id)?.name} · {AGREEMENT_LABEL[a.status]} · {eur(monthlyEquivalent(a))}/mes</span></span>
                  <span className="shrink-0 text-xs font-semibold text-[rgb(var(--st-soon))]">{d === 0 ? "hoy" : `${d} d`}</span>
                </Link></li>
              ))}</ul>
            </section>
          )}
          {dups.length > 0 && (
            <section className="card space-y-2 border-[rgb(var(--st-soon))]">
              <h2 className="flex items-center gap-2 font-semibold"><AlertTriangle size={17} className="text-[rgb(var(--st-soon))]" /> Posibles pagos duplicados</h2>
              <p className="text-xs text-slate-500">Misma tienda, mismo concepto y mismo mes. Revísalos y cancela el que sobre.</p>
              <ul className="divide-y divide-slate-100 text-sm">{dups.slice(0, 20).map((g) => (
                <li key={g[0].id}><Link href={`/stores/${g[0].store_id}?tab=pagos`} className="row-link -mx-2 flex min-h-11 items-center justify-between gap-2 rounded-lg px-2">
                  <span className="min-w-0 truncate">{storeById.get(g[0].store_id)?.name} · {g[0].concept_name} · {(g[0].period_start ?? g[0].payment_date).slice(5, 7)}/{(g[0].period_start ?? g[0].payment_date).slice(0, 4)}</span>
                  <span className="shrink-0 text-xs tabular-nums">{g.map((p) => eur(p.amount)).join(" + ")}</span>
                </Link></li>
              ))}</ul>
            </section>
          )}
        </div>
      )}

      {cur.length > 0 && (
        <section className="card !p-0">
          <h2 className="px-4 pt-4 font-semibold md:px-5">Pagos del periodo ({cur.length})</h2>
          <div className="h-scroll mt-2">
            <table className="data-table">
              <thead><tr><th className="pl-4">Fecha</th><th>Tienda</th><th>Concepto</th><th className="text-right">Importe</th><th>Estado</th></tr></thead>
              <tbody>{cur.slice(0, 200).map((p) => (
                <tr key={p.id}>
                  <td className="whitespace-nowrap pl-4 tabular-nums text-slate-500">{dmy(p.payment_date)}</td>
                  <td className="max-w-[14rem] truncate"><Link className="hover:text-brand-600" href={`/stores/${p.store_id}?tab=pagos`}>{storeById.get(p.store_id)?.name}</Link></td>
                  <td>{p.concept_name ?? p.concept}{p.settlement === "especie" && <span className="ml-1 text-xs text-slate-500">(especie{p.quantity ? ` · ${p.quantity} ${UNIT_LABEL[(p.unit ?? "eur") as Unit]}` : ""})</span>}</td>
                  <td className="whitespace-nowrap text-right font-semibold tabular-nums">{eur(p.amount)}</td>
                  <td><span className={clsx("badge font-semibold", PAY_STYLE[p.status])}>{PAY_LABEL[p.status]}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {cur.length > 200 && <p className="px-4 pb-3 text-xs text-slate-500">Se muestran 200 de {cur.length}. Descarga el CSV para verlos todos.</p>}
        </section>
      )}
      <p className="text-xs text-slate-500">«Inversión» suma lo comprobado y lo abonado (valorado en euros). El dinero abonado y lo entregado en especie (horas, producto, material) se muestran por separado: lo segundo no es salida de caja.</p>
    </div>
  );
}
