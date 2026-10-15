"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { eur, type PaymentType } from "@/lib/payments";
import { madridDate } from "@/lib/domain/dates";
import { NewTypeInline } from "./NewTypeInline";
import { BrandSelect, type Brand } from "./BrandSelect";

export interface PConcept { id: string; concept: string; payment_type_id: string | null; default_amount: number | null; status: string; is_demo: boolean; notes: string | null; last_checked_at: string | null; brand_id?: string | null; brand_name?: string | null }
export interface PRecord { id: string; concept: string; concept_name: string | null; amount: number; payment_date: string; status: string; is_demo: boolean; notes: string | null; brand_name?: string | null }

const REC_LABEL: Record<string, string> = { previsto: "Previsto", comprobado: "Comprobado", abonado: "Abonado" };
const NEW = "__new__";

export function Payments({ storeId, concepts, records, types }: { storeId: string; concepts: PConcept[]; records: PRecord[]; types: PaymentType[] }) {
  const router = useRouter();
  const sb = supabaseBrowser();
  const active = types.filter((t) => t.active);
  const byId = new Map(types.map((t) => [t.id, t]));
  const [typeId, setTypeId] = useState(active[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [creating, setCreating] = useState(false);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(p: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await p;
    setErr(error?.message ?? null);
    router.refresh();
  }

  function pickType(v: string) {
    if (v === NEW) return setCreating(true);
    setTypeId(v);
    const t = byId.get(v);
    if (t?.default_amount != null && amount === "") setAmount(String(t.default_amount));
  }

  const addConcept = () => {
    const t = byId.get(typeId);
    if (!t) return setErr("Elige un tipo de pago.");
    if (concepts.some((c) => c.payment_type_id === t.id && c.status === "activo" && (c.brand_id ?? null) === (brand?.id ?? null))) return setErr(`«${t.name}${brand ? " · " + brand.name : ""}» ya está configurado en esta tienda.`);
    const amt = amount.trim() === "" ? t.default_amount : Number(amount.replace(",", "."));
    if (amt != null && (!Number.isFinite(amt) || amt < 0)) return setErr("El importe no es válido.");
    return run(sb.from("payment_concepts").insert({ store_id: storeId, concept: t.code, payment_type_id: t.id, default_amount: amt, brand_id: brand?.id ?? null, brand_name: brand?.name ?? null }));
  };

  const addRecord = (c: PConcept, status: string) => {
    if (c.default_amount == null) return setErr("Configura primero un importe para este concepto.");
    const t = c.payment_type_id ? byId.get(c.payment_type_id) : undefined;
    return run(sb.from("payment_records").insert({
      store_id: storeId, concept_id: c.id, concept: c.concept, concept_name: t?.name ?? c.concept, payment_type_id: c.payment_type_id,
      amount: c.default_amount, payment_date: madridDate(), status, is_demo: c.is_demo, brand_id: c.brand_id ?? null, brand_name: c.brand_name ?? null,
    }));
  };

  const demo = () => {
    const ex = types.find((t) => t.code === "expositor"), ne = types.find((t) => t.code === "nevera");
    if (!ex || !ne) return setErr("Faltan los tipos Expositor y Nevera.");
    return run(sb.from("payment_concepts").insert([
      { store_id: storeId, concept: ex.code, payment_type_id: ex.id, default_amount: 120, is_demo: true, notes: "DATO DE DEMOSTRACIÓN" },
      { store_id: storeId, concept: ne.code, payment_type_id: ne.id, default_amount: 60, is_demo: true, notes: "DATO DE DEMOSTRACIÓN" },
    ]));
  };

  const nameOf = (c: PConcept) => (c.payment_type_id ? byId.get(c.payment_type_id)?.name : null) ?? c.concept;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        <button className="btn-secondary" onClick={demo} title="Crea importes de ejemplo marcados como DEMO">Cargar datos DEMO</button>
      </div>
      <p className="text-xs text-slate-500">
        Cada cobro pasa de <b>Previsto</b> a <b>Comprobado</b> (verificado en tienda) y a <b>Abonado</b> (cobrado). Los importes DEMO no son reales.
      </p>
      <ul className="divide-y divide-slate-200">
        {concepts.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
            <div>
              <b>{nameOf(c)}</b>{c.brand_name && <span className="badge ml-1.5 bg-brand-50 text-brand-700">{c.brand_name}</span>} · {c.default_amount != null ? eur(c.default_amount) : "importe sin definir"}
              {c.is_demo && <span className="badge ml-2 bg-slate-200 text-slate-700">DEMO</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary" onClick={() => addRecord(c, "previsto")}>+ Previsto</button>
              <button className="btn-secondary" onClick={() => addRecord(c, "comprobado")}>+ Comprobado</button>
              <button className="btn-secondary text-red-600" onClick={() => confirm("¿Quitar este concepto de la tienda? Los registros ya hechos se conservan.") && run(sb.from("payment_concepts").delete().eq("id", c.id))}>Quitar</button>
            </div>
          </li>
        ))}
        {concepts.length === 0 && <li className="py-3 text-sm text-slate-500">Esta tienda no tiene conceptos de pago configurados.</li>}
      </ul>
      <div className="grid grid-cols-2 items-end gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_7rem_auto]">
        <div className="col-span-2 min-w-0 sm:col-span-1">
          <label className="label">Tipo de pago</label>
          <select className="input" value={creating ? NEW : typeId} onChange={(e) => pickType(e.target.value)}>
            {active.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            <option value={NEW}>＋ Nuevo tipo de pago…</option>
          </select>
        </div>
        <BrandSelect value={brand?.id ?? null} onChange={setBrand} label="Marca" />
        <div className="min-w-0"><label className="label">Importe (€)</label><input className="input" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <button className="btn col-span-2 sm:col-span-1" onClick={addConcept}>Añadir a la tienda</button>
      </div>
      {creating && <NewTypeInline onCancel={() => setCreating(false)} onCreated={(t) => { setCreating(false); setTypeId(t.id); if (t.default_amount != null) setAmount(String(t.default_amount)); router.refresh(); }} />}

      <h3 className="pt-2 text-sm font-medium">Registros</h3>
      {records.length === 0 && <p className="text-sm text-slate-500">Sin registros de pago.</p>}
      <ul className="divide-y divide-slate-200">
        {records.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
            <div>
              {r.payment_date} · {r.concept_name ?? r.concept}{r.brand_name ? ` · ${r.brand_name}` : ""} · {eur(r.amount)}
              {r.is_demo && <span className="badge ml-2 bg-slate-200 text-slate-700">DEMO</span>}
            </div>
            <div className="flex items-center gap-2">
              <select className="input w-auto" aria-label="Estado del pago" value={r.status} onChange={(e) => run(sb.from("payment_records").update({ status: e.target.value }).eq("id", r.id))}>
                {Object.entries(REC_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <button className="btn-secondary text-red-600" onClick={() => confirm("¿Eliminar registro?") && run(sb.from("payment_records").delete().eq("id", r.id))}>Borrar</button>
            </div>
          </li>
        ))}
      </ul>
      {err && <p className="text-sm text-red-600" role="alert">{err}</p>}
    </section>
  );
}
