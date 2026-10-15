"use client";
import { BrandBadge } from "./BrandLogo";
import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Plus, Trash2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { eur, type PaymentType } from "@/lib/payments";
import { toast } from "./Toast";
import { BrandSelect, type Brand } from "./BrandSelect";

export interface VisitPayment {
  id: string; payment_type_id: string | null; concept: string; concept_name: string | null; amount: number; status: string; payment_date: string; is_demo: boolean;
  brand_id?: string | null; brand_name?: string | null;
}
const ST: Record<string, string> = { previsto: "Previsto", comprobado: "Comprobado", abonado: "Abonado" };
const ST_STYLE: Record<string, string> = { previsto: "bg-slate-200 text-slate-700", comprobado: "bg-st-soon text-[#fff]", abonado: "bg-st-ok text-[#fff]" };

/** Pagos registrados en una visita: lista con estado y total; en edición, cambiar, quitar y añadir. */
export function VisitPayments({ visitId, storeId, payments, types, editable }: {
  visitId: string; storeId: string; payments: VisitPayment[]; types: PaymentType[]; editable: boolean;
}) {
  const router = useRouter();
  const sb = supabaseBrowser();
  const [busy, setBusy] = useState(false);
  const [add, setAdd] = useState({ typeId: "", amount: "", status: "comprobado" });
  const [brand, setBrand] = useState<Brand | null>(null);
  const byId = new Map(types.map((t) => [t.id, t]));
  const name = (p: VisitPayment) => p.concept_name ?? (p.payment_type_id ? byId.get(p.payment_type_id)?.name : null) ?? p.concept;
  const total = payments.reduce((s, p) => s + Number(p.amount), 0);

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) return toast(error.message, "error");
    toast(ok);
    router.refresh();
  }

  const update = (p: VisitPayment, patch: Partial<VisitPayment>) => run(() => sb.from("payment_records").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", p.id), "Pago actualizado");
  const remove = (p: VisitPayment) => confirm(`¿Quitar el pago «${name(p)}» de ${eur(p.amount)}?`) && run(() => sb.from("payment_records").delete().eq("id", p.id), "Pago eliminado");
  async function addPayment() {
    const t = byId.get(add.typeId);
    const amt = Number(add.amount.replace(",", "."));
    if (!t) return toast("Elige un tipo de pago", "error");
    if (!Number.isFinite(amt) || amt < 0 || add.amount.trim() === "") return toast("Importe no válido", "error");
    let cq = sb.from("payment_concepts").select("id").eq("store_id", storeId).eq("payment_type_id", t.id).eq("status", "activo");
    cq = brand ? cq.eq("brand_id", brand.id) : cq.is("brand_id", null);
    let { data: c } = await cq.limit(1).maybeSingle();
    if (!c) {
      // Si la tienda no tenía este elemento (tipo + marca) se da de alta como instalado.
      const ins = await sb.from("payment_concepts").insert({ store_id: storeId, concept: t.code, payment_type_id: t.id, default_amount: amt, brand_id: brand?.id ?? null, brand_name: brand?.name ?? null }).select("id").single();
      c = ins.data;
    }
    const { data: v } = await sb.from("visits").select("visit_date").eq("id", visitId).single();
    await run(() => sb.from("payment_records").insert({
      store_id: storeId, visit_id: visitId, concept_id: c?.id ?? null, concept: t.code, concept_name: t.name, payment_type_id: t.id,
      amount: amt, status: add.status, payment_date: v?.visit_date, is_demo: false, brand_id: brand?.id ?? null, brand_name: brand?.name ?? null,
    }), "Pago añadido");
    setAdd({ typeId: "", amount: "", status: "comprobado" });
    setBrand(null);
  }

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Pagos de esta visita</h2>
        <span className="text-sm font-bold tabular-nums">{eur(total)}</span>
      </div>
      {payments.length === 0 && !editable && <p className="text-sm text-slate-500">No se registraron pagos en esta visita.</p>}
      <ul className="divide-y divide-slate-100">
        {payments.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
            <span className="min-w-0 flex-1 font-semibold">{name(p)}{p.brand_name && <BrandBadge name={p.brand_name} className="ml-1.5" />}{p.is_demo && <span className="badge ml-2 bg-slate-200 text-slate-700">DEMO</span>}</span>
            {editable ? (
              <>
                <input className="input !min-h-9 w-24" inputMode="decimal" defaultValue={String(p.amount).replace(".", ",")} aria-label="Importe"
                  onBlur={(e) => { const n = Number(e.target.value.replace(",", ".")); if (Number.isFinite(n) && n >= 0 && n !== Number(p.amount)) update(p, { amount: n }); }} />
                <select className="input !min-h-9 w-36" value={p.status} disabled={busy} onChange={(e) => update(p, { status: e.target.value })} aria-label="Estado">
                  {Object.entries(ST).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <button className="icon-btn !text-red-600" aria-label={`Quitar ${name(p)}`} disabled={busy} onClick={() => remove(p)}><Trash2 size={16} /></button>
              </>
            ) : (
              <>
                <span className="tabular-nums">{eur(Number(p.amount))}</span>
                <span className={clsx("badge font-bold", ST_STYLE[p.status])}>{ST[p.status] ?? p.status}</span>
              </>
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <div className="grid grid-cols-2 items-end gap-3 border-t border-slate-100 pt-3 sm:grid-cols-[1fr_1fr_6rem_8rem_auto]">
          <div className="col-span-2 min-w-0 sm:col-span-1">
            <label className="label" htmlFor="vp-type">Añadir pago</label>
            <select id="vp-type" className="input" value={add.typeId} onChange={(e) => { const t = byId.get(e.target.value); setAdd({ ...add, typeId: e.target.value, amount: add.amount || (t?.default_amount != null ? String(t.default_amount) : "") }); }}>
              <option value="">Elige tipo…</option>
              {types.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="col-span-2 min-w-0 sm:col-span-1"><BrandSelect label="Marca" value={brand?.id ?? null} onChange={setBrand} /></div>
          <div className="min-w-0"><label className="label" htmlFor="vp-amt">Importe (€)</label><input id="vp-amt" className="input" inputMode="decimal" placeholder="0,00" value={add.amount} onChange={(e) => setAdd({ ...add, amount: e.target.value })} /></div>
          <div className="min-w-0"><label className="label" htmlFor="vp-st">Estado</label><select id="vp-st" className="input" value={add.status} onChange={(e) => setAdd({ ...add, status: e.target.value })} aria-label="Estado">
            {Object.entries(ST).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select></div>
          <button className="btn col-span-2 sm:col-span-1" disabled={busy || !add.typeId} onClick={addPayment}><Plus size={16} /> Añadir</button>
        </div>
      )}
    </section>
  );
}
