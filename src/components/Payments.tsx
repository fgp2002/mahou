"use client";
import { BrandBadge } from "./BrandLogo";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { type PaymentType } from "@/lib/payments";
import { eur, dmy } from "@/lib/format";
import { madridDate } from "@/lib/domain/dates";
import { equipmentTitle, type Equipment } from "@/lib/equipment";
import { paymentValues, parseAmount } from "@/lib/paymentRecord";
import { BrandSelect, type Brand } from "./BrandSelect";
import { toast } from "./Toast";

export interface PRecord {
  id: string; concept: string; concept_name: string | null; amount: number; payment_date: string; status: string; is_demo: boolean; notes: string | null;
  brand_id?: string | null; brand_name?: string | null; payment_type_id?: string | null; visit_id?: string | null; equipment_id?: string | null;
}

export const REC_LABEL: Record<string, string> = { previsto: "Previsto", comprobado: "Comprobado", abonado: "Abonado" };
export const REC_STYLE: Record<string, string> = { previsto: "bg-slate-200 text-slate-700", aprobado: "bg-brand-50 text-brand-700", comprobado: "bg-st-soon text-[#fff]", abonado: "bg-st-ok text-[#fff]", cancelado: "bg-slate-100 text-slate-400 line-through" };

/** Pagos de una tienda: alta (vinculada o no a un elemento del inventario) y edición de los registrados. */
export function Payments({ storeId, records, types, equipment }: { storeId: string; records: PRecord[]; types: PaymentType[]; equipment: Equipment[] }) {
  const router = useRouter();
  const sb = supabaseBrowser();
  const byId = new Map(types.map((t) => [t.id, t]));
  const eqById = new Map(equipment.map((e) => [e.id, e]));
  const [adding, setAdding] = useState<{ typeId: string; equipmentId: string; amount: string; date: string; status: string } | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [edit, setEdit] = useState<(PRecord & { amountStr: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const eqName = (id: string | null | undefined) => {
    const e = id ? eqById.get(id) : undefined;
    return e ? `${equipmentTitle(e, byId.get(e.type_id)?.name ?? "Elemento")} (${e.code})` : null;
  };

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) { toast(error.message, "error"); return false; }
    toast(ok);
    router.refresh();
    return true;
  }

  async function saveNew() {
    if (!adding) return;
    const t = byId.get(adding.typeId);
    if (!t) return toast("Elige el concepto", "error");
    const amount = parseAmount(adding.amount);
    if (amount == null) return toast("Importe no válido", "error");
    const eq = adding.equipmentId ? eqById.get(adding.equipmentId) ?? null : null;
    const ok = await run(() => sb.from("payment_records").insert(paymentValues({ storeId, type: t, amount, date: adding.date, status: adding.status, equipment: eq, brand })), "Pago registrado");
    if (ok) { setAdding(null); setBrand(null); }
  }

  async function saveEdit() {
    if (!edit) return;
    const amt = parseAmount(edit.amountStr);
    if (amt == null) return toast("Importe no válido", "error");
    const t = edit.payment_type_id ? byId.get(edit.payment_type_id) : undefined;
    const ok = await run(() => sb.from("payment_records").update({
      amount: amt, payment_date: edit.payment_date, status: edit.status, notes: edit.notes?.trim() || null,
      payment_type_id: edit.payment_type_id ?? null, concept: t?.code ?? edit.concept, concept_name: t?.name ?? edit.concept_name,
      brand_id: edit.brand_id ?? null, brand_name: edit.brand_name ?? null, equipment_id: edit.equipment_id ?? null,
    }).eq("id", edit.id), "Pago actualizado");
    if (ok) setEdit(null);
  }

  const forType = (typeId: string) => equipment.filter((e) => e.type_id === typeId && e.status !== "retirado");

  return (
    <section className="space-y-3">
      {!adding ? (
        <button className="btn w-full sm:w-auto" onClick={() => setAdding({ typeId: "", equipmentId: "", amount: "", date: madridDate(), status: "comprobado" })}><Plus size={16} /> Registrar pago</button>
      ) : (
        <div className="fade-in grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-3">
          <div className="col-span-2 sm:col-span-1"><label className="label">Concepto</label>
            <select className="input" value={adding.typeId} onChange={(e) => {
              const t = byId.get(e.target.value);
              const els = forType(e.target.value);
              const el = els.length === 1 ? els[0] : null;
              setAdding({ ...adding, typeId: e.target.value, equipmentId: el?.id ?? "", amount: adding.amount || String(el?.reference_amount ?? t?.default_amount ?? "").replace(".", ",") });
            }}>
              <option value="">Elige…</option>
              {types.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select></div>
          {adding.typeId && forType(adding.typeId).length > 0 && (
            <div className="col-span-2"><label className="label">Elemento del inventario</label>
              <select className="input" value={adding.equipmentId} onChange={(e) => { const el = eqById.get(e.target.value); setAdding({ ...adding, equipmentId: e.target.value, amount: el?.reference_amount != null ? String(el.reference_amount).replace(".", ",") : adding.amount }); }}>
                <option value="">Sin vincular a un elemento</option>
                {forType(adding.typeId).map((e) => <option key={e.id} value={e.id}>{eqName(e.id)}</option>)}
              </select></div>
          )}
          {!adding.equipmentId && <div className="col-span-2 sm:col-span-1"><BrandSelect label="Marca" value={brand?.id ?? null} onChange={setBrand} /></div>}
          <div><label className="label">Importe (€)</label><input className="input" inputMode="decimal" value={adding.amount} onChange={(e) => setAdding({ ...adding, amount: e.target.value })} /></div>
          <div><label className="label">Fecha</label><input type="date" className="input" value={adding.date} onChange={(e) => setAdding({ ...adding, date: e.target.value })} /></div>
          <div><label className="label">Estado</label><select className="input" value={adding.status} onChange={(e) => setAdding({ ...adding, status: e.target.value })}>{Object.entries(REC_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div className="col-span-2 flex gap-2 sm:col-span-3"><button className="btn-secondary" onClick={() => setAdding(null)}>Cancelar</button><button className="btn flex-1" disabled={busy} onClick={saveNew}>Guardar pago</button></div>
        </div>
      )}

      {records.length === 0 && <p className="text-sm text-slate-500">Sin pagos registrados.</p>}
      <ul className="divide-y divide-slate-100">
        {records.map((r) => {
          const open = edit?.id === r.id;
          const el = eqName(r.equipment_id);
          return (
            <li key={r.id} className="py-2 text-sm">
              <button type="button" onClick={() => setEdit(open ? null : { ...r, amountStr: String(r.amount).replace(".", ",") })} className="row-link -mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-lg px-2 py-1 text-left">
                <span className="w-20 shrink-0 tabular-nums text-slate-500">{dmy(r.payment_date)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.concept_name ?? r.concept}{r.brand_name && <BrandBadge name={r.brand_name} className="ml-1.5" />}</span>
                  {el && <span className="block truncate text-xs text-slate-500">{el}</span>}
                </span>
                <span className="font-bold tabular-nums">{eur(Number(r.amount))}</span>
                <span className={clsx("badge font-bold", REC_STYLE[r.status])}>{REC_LABEL[r.status] ?? r.status}</span>
                <ChevronDown size={15} className={clsx("shrink-0 text-slate-400 transition-transform", open && "rotate-180")} />
              </button>
              {open && edit && (
                <div className="fade-in mt-2 space-y-2 rounded-lg bg-slate-50 p-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <div className="min-w-0"><label className="label">Concepto</label><select className="input" value={edit.payment_type_id ?? ""} onChange={(e) => setEdit({ ...edit, payment_type_id: e.target.value || null })}>
                      {!edit.payment_type_id && <option value="">{edit.concept_name ?? edit.concept}</option>}
                      {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select></div>
                    <div className="min-w-0"><label className="label">Elemento</label><select className="input" value={edit.equipment_id ?? ""} onChange={(e) => setEdit({ ...edit, equipment_id: e.target.value || null })}>
                      <option value="">Sin vincular</option>
                      {equipment.filter((e) => !edit.payment_type_id || e.type_id === edit.payment_type_id || e.id === edit.equipment_id).map((e) => <option key={e.id} value={e.id}>{eqName(e.id)}</option>)}
                    </select></div>
                    <BrandSelect label="Marca" value={edit.brand_id ?? null} onChange={(b) => setEdit({ ...edit, brand_id: b?.id ?? null, brand_name: b?.name ?? null })} />
                    <div className="min-w-0"><label className="label">Importe (€)</label><input className="input" inputMode="decimal" value={edit.amountStr} onChange={(e) => setEdit({ ...edit, amountStr: e.target.value })} /></div>
                    <div className="min-w-0"><label className="label">Fecha</label><input type="date" className="input" value={edit.payment_date} onChange={(e) => setEdit({ ...edit, payment_date: e.target.value })} /></div>
                    <div className="min-w-0"><label className="label">Estado</label><select className="input" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>{Object.entries(REC_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
                    <div className="col-span-2 min-w-0 sm:col-span-3"><label className="label">Observaciones</label><input className="input" value={edit.notes ?? ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {r.visit_id && <Link href={`/visits/${r.visit_id}`} className="text-sm font-semibold text-brand-600 underline">Ver visita</Link>}
                    <span className="flex-1" />
                    <button className="btn-secondary !text-red-600" disabled={busy} onClick={() => confirm("¿Eliminar este pago?") && run(() => sb.from("payment_records").delete().eq("id", r.id), "Pago eliminado")}><Trash2 size={15} /> Eliminar</button>
                    <button className="btn" disabled={busy} onClick={saveEdit}>Guardar</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
