"use client";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { ChevronRight, FileSignature, Plus } from "lucide-react";
import { eur, dmy } from "@/lib/format";
import type { Agreement, InvestmentCategory, PaymentRow, PaymentType } from "@/lib/payments";
import { daysToEnd, monthlyEquivalent, PAY_LABEL, PAY_STYLE, PERIODICITY_LABEL, totals, UNIT_LABEL, type Unit } from "@/lib/economy";
import { madridDate } from "@/lib/domain/dates";
import type { Equipment } from "@/lib/equipment";
import { AgreementBadge, AgreementSheet } from "./AgreementSheet";
import { PaymentSheet } from "./PaymentSheet";
import { BrandBadge } from "./BrandLogo";

/** Pagos y acuerdos de una tienda: totales, acuerdos vigentes y movimientos, con alta y edición. */
export function StoreEconomy({ store, payments, agreements, types, categories, equipment, initialPay, initialAg }: {
  store: { id: string; name: string; town: string | null }; payments: PaymentRow[]; agreements: Agreement[]; types: PaymentType[]; categories: InvestmentCategory[]; equipment: Equipment[];
  initialPay?: string | null; initialAg?: string | null;
}) {
  const today = madridDate();
  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const eqById = useMemo(() => new Map(equipment.map((e) => [e.id, e])), [equipment]);
  const [pay, setPay] = useState<PaymentRow | "new" | null>(() => payments.find((p) => p.id === initialPay) ?? null);
  const [ag, setAg] = useState<Agreement | "new" | null>(() => agreements.find((a) => a.id === initialAg) ?? null);
  const t = totals(payments.map((p) => ({ ...p, amount: Number(p.amount) })));
  const active = agreements.filter((a) => a.status === "en_ejecucion" || a.status === "aprobado" || a.status === "pendiente_aprobacion" || a.status === "borrador");
  const closed = agreements.filter((a) => !active.includes(a));
  const unitStr = Object.entries(t.units).map(([u, n]) => `${Math.round(Number(n) * 100) / 100} ${UNIT_LABEL[u as Unit]}`).join(" · ");

  const AgRow = ({ a }: { a: Agreement }) => {
    const d = daysToEnd(a.end_date, today);
    return (
      <li>
        <button type="button" onClick={() => setAg(a)} className="tap flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left">
          <span className="min-w-0 flex-1">
            <b className="block truncate">{a.title || typeById.get(a.type_id)?.name || "Acuerdo"}</b>
            <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              <AgreementBadge status={a.status} />{PERIODICITY_LABEL[a.periodicity]} · {dmy(a.start_date)} → {a.end_date ? dmy(a.end_date) : "sin fin"}
              {d != null && d >= 0 && d <= 60 && a.status !== "finalizado" && a.status !== "cancelado" && <span className="font-semibold text-[rgb(var(--st-soon))]">vence en {d} d</span>}
            </span>
          </span>
          <span className="shrink-0 text-right"><b className="block tabular-nums">{eur(Number(a.amount))}</b><span className="text-[11px] text-slate-500">{eur(monthlyEquivalent({ ...a, amount: Number(a.amount) }))}/mes</span></span>
          <ChevronRight size={16} className="shrink-0 text-slate-400" />
        </button>
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
        <div className="rounded-xl bg-slate-50 p-2.5"><dt className="text-[11px] text-slate-500">Abonado en dinero</dt><dd className="font-bold tabular-nums">{eur(t.paidCash)}</dd></div>
        <div className="rounded-xl bg-slate-50 p-2.5"><dt className="text-[11px] text-slate-500">En especie (valorado)</dt><dd className="font-bold tabular-nums">{eur(t.paidInKind)}</dd>{unitStr && <dd className="text-[11px] text-slate-500">{unitStr}</dd>}</div>
        <div className="rounded-xl bg-slate-50 p-2.5"><dt className="text-[11px] text-slate-500">Pendiente</dt><dd className="font-bold tabular-nums">{eur(t.pending)}</dd></div>
        <div className="rounded-xl bg-slate-50 p-2.5"><dt className="text-[11px] text-slate-500">Acuerdos vigentes</dt><dd className="font-bold tabular-nums">{active.filter((a) => a.status === "en_ejecucion" || a.status === "aprobado").length}</dd></div>
      </dl>

      <section className="space-y-2">
        <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Acuerdos</h3><button className="btn-secondary !min-h-9" onClick={() => setAg("new")}><FileSignature size={15} /> Acuerdo</button></div>
        {agreements.length === 0 ? <p className="text-sm text-slate-500">Sin acuerdos comerciales registrados.</p> : (
          <ul className="space-y-2">{active.map((a) => <AgRow key={a.id} a={a} />)}</ul>
        )}
        {closed.length > 0 && <details><summary className="cursor-pointer text-sm text-slate-500">Finalizados y cancelados ({closed.length})</summary><ul className="mt-2 space-y-2">{closed.map((a) => <AgRow key={a.id} a={a} />)}</ul></details>}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Pagos</h3><button className="btn !min-h-9" onClick={() => setPay("new")}><Plus size={15} /> Pago</button></div>
        {payments.length === 0 ? <p className="text-sm text-slate-500">Sin pagos registrados.</p> : (
          <ul className="divide-y divide-slate-100">
            {payments.map((p) => {
              const e = p.equipment_id ? eqById.get(p.equipment_id) : null;
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => setPay(p)} className="row-link -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2.5 text-left text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{p.concept_name ?? p.concept}{p.brand_name && <BrandBadge name={p.brand_name} className="ml-1.5" />}</span>
                      <span className="block truncate text-xs text-slate-500">{[dmy(p.payment_date), e?.code, p.settlement === "especie" ? `en especie${p.quantity ? ` · ${p.quantity} ${UNIT_LABEL[(p.unit ?? "eur") as Unit]}` : ""}` : null, p.agreement_id ? "con acuerdo" : null].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className={clsx("font-bold tabular-nums", p.status === "cancelado" && "text-slate-400 line-through")}>{eur(Number(p.amount))}</span>
                      <span className={clsx("badge font-semibold", PAY_STYLE[p.status])}>{PAY_LABEL[p.status]}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {pay && <PaymentSheet storeId={store.id} payment={pay === "new" ? null : pay} types={types} categories={categories} equipment={equipment} agreements={agreements} onClose={() => setPay(null)} />}
      {ag && <AgreementSheet agreement={ag === "new" ? null : ag} store={store} types={types} categories={categories} equipment={equipment} onClose={() => setAg(null)} />}
    </div>
  );
}
