import Link from "next/link";
import { ArrowLeft, ChevronRight, Wallet } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import { loadPaymentTypes } from "@/lib/server/load";
import { PageHeader, EmptyState } from "@/components/ui";
import { PaymentTypeDetail, type InstallRow } from "@/components/PaymentTypeDetail";
import { eur } from "@/lib/format";

export const metadata = { title: "Pagos · Mahou" };


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
  type C = { store_id: string; concept: string; payment_type_id: string | null; default_amount: number | null; status: string; is_demo: boolean; brand_name: string | null };
  type R = { store_id: string; concept: string; concept_name: string | null; payment_type_id: string | null; amount: number; status: string; is_demo: boolean; payment_date: string; brand_name: string | null };
  const [types, concepts, records, { data: stores }] = await Promise.all([
    loadPaymentTypes(),
    fetchAll<C>((a, b) => sb.from("payment_concepts").select("store_id,concept,payment_type_id,default_amount,status,is_demo,brand_name").range(a, b)),
    fetchAll<R>((a, b) => sb.from("payment_records").select("store_id,concept,concept_name,payment_type_id,amount,status,is_demo,payment_date,brand_name").range(a, b)),
    sb.from("stores").select("id,name,town,banner").limit(5000),
  ]);
  const storeById = new Map((stores ?? []).map((s) => [s.id, s]));
  const typeById = new Map(types.map((t) => [t.id, t]));
  const keyOf = (x: { payment_type_id: string | null; concept: string }) => x.payment_type_id ?? `code:${x.concept}`;
  const nameOf = (k: string, fallback?: string | null) => typeById.get(k)?.name ?? fallback ?? k.replace(/^code:/, "");
  const C2 = concepts.filter((c) => withDemo || !c.is_demo);
  const R2 = records.filter((r) => withDemo || !r.is_demo);

  // Agregado por tipo: instaladas = conceptos activos por tienda; importe = solo lo abonado (histórico).
  const agg = new Map<string, { name: string; installed: number; paid: number; payments: number; brands: Map<string, number> }>();
  const touch = (k: string, name: string) => agg.get(k) ?? (agg.set(k, { name, installed: 0, paid: 0, payments: 0, brands: new Map() }), agg.get(k)!);
  for (const c of C2) if (c.status === "activo") {
    const a = touch(keyOf(c), nameOf(keyOf(c)));
    a.installed++;
    const b = c.brand_name ?? "Sin marca";
    a.brands.set(b, (a.brands.get(b) ?? 0) + 1);
  }
  for (const r of R2) if (r.status === "abonado") { const a = touch(keyOf(r), nameOf(keyOf(r), r.concept_name)); a.paid += Number(r.amount); a.payments++; }
  const list = [...agg].sort((a, b) => b[1].installed - a[1].installed || b[1].paid - a[1].paid);
  const totalPaid = list.reduce((s, [, a]) => s + a.paid, 0);
  const totalInstalled = list.reduce((s, [, a]) => s + a.installed, 0);
  const demoHref = (t?: string) => `/payments?${new URLSearchParams({ ...(t ? { type: t } : {}), ...(withDemo ? {} : { demo: "1" }) })}`;
  const keepDemo = withDemo ? "&demo=1" : "";

  if (type) {
    const a = agg.get(type);
    const name = a?.name ?? nameOf(type);
    // Una fila por tienda y marca: instalada (concepto activo) y/o con pagos abonados.
    const rows = new Map<string, InstallRow>();
    const rowOf = (storeId: string, brand: string | null) => {
      const k = `${storeId}|${brand ?? ""}`;
      if (!rows.has(k)) {
        const st = storeById.get(storeId);
        rows.set(k, { key: k, storeId, store: st?.name ?? "Tienda", town: st?.town ?? null, banner: st?.banner ?? null, brand, installed: false, amount: null, paid: 0, payments: 0, last: null });
      }
      return rows.get(k)!;
    };
    for (const c of C2) if (keyOf(c) === type && c.status === "activo") { const r = rowOf(c.store_id, c.brand_name); r.installed = true; r.amount = c.default_amount; }
    for (const r of R2) {
      if (keyOf(r) !== type || r.status !== "abonado") continue;
      const row = rowOf(r.store_id, r.brand_name);
      row.paid += Number(r.amount); row.payments++;
      if (!row.last || r.payment_date > row.last) row.last = r.payment_date;
    }
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Link href={`/payments${withDemo ? "?demo=1" : ""}`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft size={15} /> Pagos</Link>
        <PageHeader title={name} />
        <PaymentTypeDetail name={name} rows={[...rows.values()]} />
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
                {a.brands.size > 0 && (
                  <span className="mt-1.5 flex flex-wrap gap-1">
                    {[...a.brands].sort((x, y) => y[1] - x[1]).slice(0, 4).map(([b, n]) => <span key={b} className="badge bg-brand-50 text-brand-700">{b} · {n}</span>)}
                  </span>
                )}
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
