import Link from "next/link";
import clsx from "clsx";
import { ArrowLeft, ChevronRight, Wallet } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import { loadPaymentTypes } from "@/lib/server/load";
import { PageHeader, EmptyState } from "@/components/ui";

export const metadata = { title: "Pagos · Mahou" };

const eur = (n: number) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const dmy = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—");

async function fetchAll<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await q(from, from + 999);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ type?: string; demo?: string }> }) {
  const { type, demo } = await searchParams;
  const withDemo = demo === "1";
  const sb = await supabaseServer();
  type C = { store_id: string; concept: string; payment_type_id: string | null; default_amount: number | null; status: string; is_demo: boolean };
  type R = { store_id: string; concept: string; concept_name: string | null; payment_type_id: string | null; amount: number; status: string; is_demo: boolean; payment_date: string };
  const [types, concepts, records, { data: stores }] = await Promise.all([
    loadPaymentTypes(),
    fetchAll<C>((a, b) => sb.from("payment_concepts").select("store_id,concept,payment_type_id,default_amount,status,is_demo").range(a, b)),
    fetchAll<R>((a, b) => sb.from("payment_records").select("store_id,concept,concept_name,payment_type_id,amount,status,is_demo,payment_date").range(a, b)),
    sb.from("stores").select("id,name,town,banner").limit(5000),
  ]);
  const storeById = new Map((stores ?? []).map((s) => [s.id, s]));
  const typeById = new Map(types.map((t) => [t.id, t]));
  const keyOf = (x: { payment_type_id: string | null; concept: string }) => x.payment_type_id ?? `code:${x.concept}`;
  const nameOf = (k: string, fallback?: string | null) => typeById.get(k)?.name ?? fallback ?? k.replace(/^code:/, "");
  const C2 = concepts.filter((c) => withDemo || !c.is_demo);
  const R2 = records.filter((r) => withDemo || !r.is_demo);

  // Agregado por tipo: instaladas = conceptos activos por tienda; importe = solo lo abonado (histórico).
  const agg = new Map<string, { name: string; installed: number; paid: number; payments: number }>();
  const touch = (k: string, name: string) => agg.get(k) ?? (agg.set(k, { name, installed: 0, paid: 0, payments: 0 }), agg.get(k)!);
  for (const c of C2) if (c.status === "activo") touch(keyOf(c), nameOf(keyOf(c))).installed++;
  for (const r of R2) if (r.status === "abonado") { const a = touch(keyOf(r), nameOf(keyOf(r), r.concept_name)); a.paid += Number(r.amount); a.payments++; }
  const list = [...agg].sort((a, b) => b[1].installed - a[1].installed || b[1].paid - a[1].paid);
  const totalPaid = list.reduce((s, [, a]) => s + a.paid, 0);
  const totalInstalled = list.reduce((s, [, a]) => s + a.installed, 0);
  const demoHref = (t?: string) => `/payments?${new URLSearchParams({ ...(t ? { type: t } : {}), ...(withDemo ? {} : { demo: "1" }) })}`;
  const keepDemo = withDemo ? "&demo=1" : "";

  if (type) {
    const a = agg.get(type);
    const name = a?.name ?? nameOf(type);
    const rows = new Map<string, { installed: boolean; amount: number | null; paid: number; payments: number; last: string | null }>();
    for (const c of C2) if (keyOf(c) === type && c.status === "activo") rows.set(c.store_id, { installed: true, amount: c.default_amount, paid: 0, payments: 0, last: null });
    for (const r of R2) {
      if (keyOf(r) !== type || r.status !== "abonado") continue;
      const row = rows.get(r.store_id) ?? { installed: false, amount: null, paid: 0, payments: 0, last: null };
      row.paid += Number(r.amount); row.payments++;
      if (!row.last || r.payment_date > row.last) row.last = r.payment_date;
      rows.set(r.store_id, row);
    }
    const items = [...rows].map(([id, r]) => ({ id, ...r, store: storeById.get(id) })).sort((x, y) => Number(y.installed) - Number(x.installed) || (x.store?.name ?? "").localeCompare(y.store?.name ?? "", "es"));
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Link href={`/payments${withDemo ? "?demo=1" : ""}`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft size={15} /> Pagos</Link>
        <PageHeader title={name} />
        <div className="grid grid-cols-3 gap-3">
          <div className="card"><div className="text-xs text-slate-500">Instaladas</div><div className="mt-1 text-2xl font-bold">{a?.installed ?? 0}</div></div>
          <div className="card"><div className="text-xs text-slate-500">Total abonado</div><div className="mt-1 text-2xl font-bold">{eur(a?.paid ?? 0)}</div></div>
          <div className="card"><div className="text-xs text-slate-500">Pagos abonados</div><div className="mt-1 text-2xl font-bold">{a?.payments ?? 0}</div></div>
        </div>
        <section className="card overflow-hidden !p-0">
          {items.length === 0 ? <EmptyState title="Ninguna tienda" text={`No hay ${name.toLowerCase()} activas ni pagos abonados.`} /> : (
            <ul className="divide-y divide-slate-100">
              {items.map((it) => (
                <li key={it.id}>
                  <Link href={`/stores/${it.id}`} className="row-link flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{it.store?.name ?? "Tienda"}</span>
                      <span className="block truncate text-xs text-slate-500">{[it.store?.banner, it.store?.town, it.amount != null ? `${eur(Number(it.amount))} por pago` : null, it.last ? `último abono ${dmy(it.last)}` : null].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-bold tabular-nums">{eur(it.paid)}</span>
                      <span className={clsx("badge mt-0.5", it.installed ? "bg-st-ok text-[#fff]" : "bg-slate-200 text-slate-600")}>{it.installed ? "Activa" : "Ya no activa"}</span>
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-slate-400" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <Link href={demoHref(type)} className="text-xs text-slate-500 underline">{withDemo ? "Ocultar datos DEMO" : "Incluir datos DEMO"}</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="Pagos">
        <Link href={demoHref()} className="btn-secondary">{withDemo ? "Ocultar DEMO" : "Incluir DEMO"}</Link>
      </PageHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="card"><div className="text-xs text-slate-500">Elementos instalados</div><div className="mt-1 text-2xl font-bold">{totalInstalled}</div></div>
        <div className="card"><div className="text-xs text-slate-500">Total abonado (histórico)</div><div className="mt-1 text-2xl font-bold">{eur(totalPaid)}</div></div>
      </div>
      {list.length === 0 ? (
        <div className="card"><EmptyState title="Aún no hay pagos" text="Configura los conceptos de pago en la ficha de cada tienda o registra cobros en las visitas." /></div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map(([k, a]) => (
            <Link key={k} href={`/payments?type=${encodeURIComponent(k)}${keepDemo}`} className="card tap flex items-center gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Wallet size={20} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{a.name}</span>
                <span className="block text-xs text-slate-500">{a.installed} instalada{a.installed === 1 ? "" : "s"} · {a.payments} pago{a.payments === 1 ? "" : "s"} abonado{a.payments === 1 ? "" : "s"}</span>
              </span>
              <span className="shrink-0 text-right text-base font-bold tabular-nums">{eur(a.paid)}</span>
              <ChevronRight size={16} className="shrink-0 text-slate-400" />
            </Link>
          ))}
        </div>
      )}
      <p className="text-xs text-slate-500">«Instaladas» cuenta cada tienda con el concepto activo. El importe es solo lo abonado, de todo el histórico.</p>
    </div>
  );
}
