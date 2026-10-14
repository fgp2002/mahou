"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { CONCEPTS } from "@/lib/types";
import { madridDate } from "@/lib/domain/dates";

export interface PConcept { id: string; concept: string; default_amount: number | null; status: string; is_demo: boolean; notes: string | null; last_checked_at: string | null }
export interface PRecord { id: string; concept: string; amount: number; payment_date: string; status: string; is_demo: boolean; notes: string | null }

const REC_LABEL: Record<string, string> = { previsto: "Previsto", comprobado: "Comprobado", abonado: "Abonado" };
const eur = (n: number) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });

export function Payments({ storeId, concepts, records }: { storeId: string; concepts: PConcept[]; records: PRecord[] }) {
  const router = useRouter();
  const [concept, setConcept] = useState("expositor");
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const sb = supabaseBrowser();

  async function run(p: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await p;
    setErr(error?.message ?? null);
    router.refresh();
  }

  const addConcept = () =>
    run(sb.from("payment_concepts").insert({ store_id: storeId, concept, default_amount: amount === "" ? null : Number(amount.replace(",", ".")) }));

  const addRecord = (c: PConcept, status: string) => {
    if (c.default_amount == null) return setErr("Configura primero un importe para este concepto.");
    return run(sb.from("payment_records").insert({
      store_id: storeId, concept_id: c.id, concept: c.concept, amount: c.default_amount,
      payment_date: madridDate(), status, is_demo: c.is_demo,
    }));
  };

  const demo = () =>
    run(sb.from("payment_concepts").insert([
      { store_id: storeId, concept: "expositor", default_amount: 120, is_demo: true, notes: "DATO DE DEMOSTRACIÓN" },
      { store_id: storeId, concept: "nevera", default_amount: 60, is_demo: true, notes: "DATO DE DEMOSTRACIÓN" },
    ]));

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Pagos y conceptos</h2>
        <button className="btn-secondary" onClick={demo} title="Crea importes de ejemplo marcados como DEMO">Cargar datos DEMO</button>
      </div>
      <p className="text-xs text-slate-500">
        «Configurado» = concepto y importe definidos. Cada cobro pasa de <b>Previsto</b> a <b>Comprobado</b> (lo has verificado en tienda) y a <b>Abonado</b> (cobrado). Los importes DEMO no son reales.
      </p>
      <ul className="divide-y divide-slate-100">
        {concepts.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <div>
              {CONCEPTS[c.concept]} · {c.default_amount != null ? eur(c.default_amount) : "importe sin definir"}
              {c.is_demo && <span className="badge ml-2 bg-slate-200 text-slate-700">DEMO</span>}
              <span className="badge ml-2 bg-slate-100 text-slate-600">{c.status}</span>
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={() => addRecord(c, "previsto")}>+ Previsto</button>
              <button className="btn-secondary" onClick={() => addRecord(c, "comprobado")}>+ Comprobado</button>
              <button className="text-red-600 underline" onClick={() => confirm("¿Eliminar concepto?") && run(sb.from("payment_concepts").delete().eq("id", c.id))}>Borrar</button>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label">Concepto</label>
          <select className="input" value={concept} onChange={(e) => setConcept(e.target.value)}>
            {Object.entries(CONCEPTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Importe (€)</label>
          <input className="input w-28" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <button className="btn" onClick={addConcept}>Añadir concepto</button>
      </div>
      <h3 className="pt-2 text-sm font-medium">Registros</h3>
      {records.length === 0 && <p className="text-sm text-slate-500">Sin registros de pago.</p>}
      <ul className="divide-y divide-slate-100">
        {records.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <div>
              {r.payment_date} · {CONCEPTS[r.concept]} · {eur(r.amount)}
              {r.is_demo && <span className="badge ml-2 bg-slate-200 text-slate-700">DEMO</span>}
            </div>
            <div className="flex items-center gap-2">
              <select className="input w-auto" value={r.status} onChange={(e) => run(sb.from("payment_records").update({ status: e.target.value }).eq("id", r.id))}>
                {Object.entries(REC_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <button className="text-red-600 underline" onClick={() => confirm("¿Eliminar registro?") && run(sb.from("payment_records").delete().eq("id", r.id))}>Borrar</button>
            </div>
          </li>
        ))}
      </ul>
      {err && <p className="text-sm text-red-600">{err}</p>}
    </section>
  );
}
