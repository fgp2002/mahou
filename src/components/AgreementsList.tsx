"use client";
import { useState } from "react";
import { ChevronRight, FileSignature } from "lucide-react";
import { eur, dmy } from "@/lib/format";
import type { Agreement, InvestmentCategory, PaymentType } from "@/lib/payments";
import { daysToEnd, monthlyEquivalent, PERIODICITY_LABEL } from "@/lib/economy";
import type { StoreLite } from "@/lib/server/economy";
import { AgreementBadge, AgreementSheet } from "./AgreementSheet";
import { EmptyState } from "./ui";

/** Lista de acuerdos con alta; cada fila abre su ficha con calendario de pagos e historial. */
export function AgreementsList({ rows, stores, types, categories, today }: { rows: Agreement[]; stores: Record<string, StoreLite | null>; types: PaymentType[]; categories: InvestmentCategory[]; today: string }) {
  const [open, setOpen] = useState<Agreement | "new" | null>(null);
  const typeName = (id: string) => types.find((t) => t.id === id)?.name ?? "Acuerdo";
  const st = open && open !== "new" ? stores[open.store_id] : null;
  return (
    <div className="space-y-3">
      <button className="btn w-full sm:w-auto" onClick={() => setOpen("new")}><FileSignature size={16} /> Nuevo acuerdo</button>
      {rows.length === 0 ? <div className="card"><EmptyState title="Sin acuerdos" text="Registra aquí los compromisos con cada tienda: cabeceras, horas de reposición, neveras… Luego podrás seguir sus pagos mes a mes." /></div> : (
        <ul className="space-y-2">
          {rows.map((a) => {
            const s = stores[a.store_id];
            const d = daysToEnd(a.end_date, today);
            return (
              <li key={a.id}>
                <button type="button" onClick={() => setOpen(a)} className="card tap flex w-full items-center gap-3 !p-3 text-left">
                  <span className="min-w-0 flex-1">
                    <b className="block truncate">{a.title || typeName(a.type_id)}</b>
                    <span className="block truncate text-xs text-slate-500">{s?.name}{s?.town ? ` · ${s.town}` : ""}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      <AgreementBadge status={a.status} />{PERIODICITY_LABEL[a.periodicity]} · {dmy(a.start_date)} → {a.end_date ? dmy(a.end_date) : "sin fin"}
                      {d != null && d >= 0 && d <= 60 && (a.status === "en_ejecucion" || a.status === "aprobado") && <b className="text-[rgb(var(--st-soon))]">vence en {d} d</b>}
                    </span>
                  </span>
                  <span className="shrink-0 text-right"><b className="block tabular-nums">{eur(Number(a.amount))}</b><span className="text-[11px] text-slate-500">{eur(monthlyEquivalent({ ...a, amount: Number(a.amount) }))}/mes</span></span>
                  <ChevronRight size={16} className="shrink-0 text-slate-400" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {open && <AgreementSheet agreement={open === "new" ? null : open} store={open === "new" ? null : st ? { id: st.id, name: st.name, town: st.town } : null} types={types} categories={categories} onClose={() => setOpen(null)} />}
    </div>
  );
}
