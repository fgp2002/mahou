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
import { NewTypeInline } from "./NewTypeInline";
import { BrandSelect, type Brand } from "./BrandSelect";
import { toast } from "./Toast";

export interface PConcept { id: string; concept: string; payment_type_id: string | null; default_amount: number | null; status: string; is_demo: boolean; notes: string | null; last_checked_at: string | null; brand_id?: string | null; brand_name?: string | null }
export interface PRecord {
  id: string; concept: string; concept_name: string | null; amount: number; payment_date: string; status: string; is_demo: boolean; notes: string | null;
  brand_id?: string | null; brand_name?: string | null; payment_type_id?: string | null; visit_id?: string | null;
}

const REC_LABEL: Record<string, string> = { previsto: "Previsto", comprobado: "Comprobado", abonado: "Abonado" };
const REC_STYLE: Record<string, string> = { previsto: "bg-slate-200 text-slate-700", comprobado: "bg-st-soon text-[#fff]", abonado: "bg-st-ok text-[#fff]" };
const NEW = "__new__";

/** Pagos de una tienda: elementos instalados (tipo + marca) y pagos registrados, todos editables. */
export function Payments({ storeId, concepts, records, types }: { storeId: string; concepts: PConcept[]; records: PRecord[]; types: PaymentType[] }) {
  const router = useRouter();
  const sb = supabaseBrowser();
  const active = types.filter((t) => t.active);
  const byId = new Map(types.map((t) => [t.id, t]));
  const [typeId, setTypeId] = useState(active[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [recFor, setRecFor] = useState<{ c: PConcept; amount: string; status: string; date: string } | null>(null);
  const [edit, setEdit] = useState<(PRecord & { amountStr: string }) | null>(null);
  const [busy, setBusy] = useState(false);

  const typeName = (id: string | null | undefined, fallback: string) => (id ? byId.get(id)?.name : null) ?? fallback;
  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) { toast(error.message, "error"); return false; }
    toast(ok);
    router.refresh();
    return true;
  }

  const addConcept = () => {
    const t = byId.get(typeId);
    if (!t) return toast("Elige un tipo de pago", "error");
    if (concepts.some((c) => c.payment_type_id === t.id && c.status === "activo" && (c.brand_id ?? null) === (brand?.id ?? null)))
      return toast(`«${t.name}${brand ? " · " + brand.name : ""}» ya está en esta tienda`, "error");
    return run(() => sb.from("payment_concepts").insert({ store_id: storeId, concept: t.code, payment_type_id: t.id, default_amount: null, brand_id: brand?.id ?? null, brand_name: brand?.name ?? null }), "Elemento añadido");
  };

  async function saveRecordFor() {
    if (!recFor) return;
    const amt = Number(recFor.amount.replace(",", "."));
    if (recFor.amount.trim() === "" || !Number.isFinite(amt) || amt < 0) return toast("Importe no válido", "error");
    const c = recFor.c;
    const ok = await run(() => sb.from("payment_records").insert({
      store_id: storeId, concept_id: c.id, concept: c.concept, concept_name: typeName(c.payment_type_id, c.concept), payment_type_id: c.payment_type_id,
      amount: amt, payment_date: recFor.date, status: recFor.status, is_demo: c.is_demo, brand_id: c.brand_id ?? null, brand_name: c.brand_name ?? null,
    }), "Pago registrado");
    if (ok) setRecFor(null);
  }

  async function saveEdit() {
    if (!edit) return;
    const amt = Number(edit.amountStr.replace(",", "."));
    if (edit.amountStr.trim() === "" || !Number.isFinite(amt) || amt < 0) return toast("Importe no válido", "error");
    const t = edit.payment_type_id ? byId.get(edit.payment_type_id) : undefined;
    const ok = await run(() => sb.from("payment_records").update({
      amount: amt, payment_date: edit.payment_date, status: edit.status, notes: edit.notes?.trim() || null,
      payment_type_id: edit.payment_type_id ?? null, concept: t?.code ?? edit.concept, concept_name: t?.name ?? edit.concept_name,
      brand_id: edit.brand_id ?? null, brand_name: edit.brand_name ?? null, updated_at: new Date().toISOString(),
    }).eq("id", edit.id), "Pago actualizado");
    if (ok) setEdit(null);
  }

  return (
    <section className="space-y-5">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Elementos instalados</h3>
        <ul className="divide-y divide-slate-100">
          {concepts.map((c) => (
            <li key={c.id} className="py-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1"><b>{typeName(c.payment_type_id, c.concept)}</b>{c.brand_name && <BrandBadge name={c.brand_name} className="ml-1.5" />}{c.is_demo && <span className="badge ml-1.5 bg-slate-200 text-slate-700">DEMO</span>}</span>
                <button className="btn-secondary !min-h-9" onClick={() => {
                  const def = (c.payment_type_id && byId.get(c.payment_type_id)?.default_amount) ?? c.default_amount;
                  setRecFor({ c, amount: def != null ? String(def).replace(".", ",") : "", status: "comprobado", date: madridDate() });
                }}><Plus size={15} /> Pago</button>
                <button className="icon-btn !text-red-600" aria-label="Quitar elemento" onClick={() => confirm("¿Quitar este elemento de la tienda? Los pagos ya registrados se conservan.") && run(() => sb.from("payment_concepts").delete().eq("id", c.id), "Elemento quitado")}><Trash2 size={16} /></button>
              </div>
              {recFor?.c.id === c.id && (
                <div className="fade-in mt-2 grid grid-cols-2 items-end gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <div className="min-w-0"><label className="label">Importe de esta operación (€)</label><input className="input" inputMode="decimal" value={recFor.amount} onChange={(e) => setRecFor({ ...recFor, amount: e.target.value })} /></div>
                  <div className="min-w-0"><label className="label">Fecha</label><input type="date" className="input" value={recFor.date} onChange={(e) => setRecFor({ ...recFor, date: e.target.value })} /></div>
                  <div className="min-w-0"><label className="label">Estado</label><select className="input" value={recFor.status} onChange={(e) => setRecFor({ ...recFor, status: e.target.value })}>{Object.entries(REC_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
                  <div className="flex gap-2"><button className="btn-secondary" onClick={() => setRecFor(null)}>✕</button><button className="btn" disabled={busy} onClick={saveRecordFor}>Guardar</button></div>
                </div>
              )}
            </li>
          ))}
          {concepts.length === 0 && <li className="py-3 text-sm text-slate-500">Esta tienda no tiene elementos de pago.</li>}
        </ul>
        <div className="grid grid-cols-2 items-end gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_auto]">
          <div className="col-span-2 min-w-0 sm:col-span-1">
            <label className="label">Tipo de pago</label>
            <select className="input" value={creating ? NEW : typeId} onChange={(e) => (e.target.value === NEW ? setCreating(true) : setTypeId(e.target.value))}>
              {active.map((t) => <option key={t.id} value={t.id}>{t.name}{t.default_amount != null ? ` · ${eur(t.default_amount)}` : ""}</option>)}
              <option value={NEW}>＋ Nuevo tipo de pago…</option>
            </select>
          </div>
          <div className="col-span-2 sm:col-span-1"><BrandSelect value={brand?.id ?? null} onChange={setBrand} label="Marca" /></div>
          <button className="btn col-span-2 sm:col-span-1" disabled={busy} onClick={addConcept}>Añadir a la tienda</button>
        </div>
        {creating && <NewTypeInline onCancel={() => setCreating(false)} onCreated={(t) => { setCreating(false); setTypeId(t.id); router.refresh(); }} />}
        <p className="text-xs text-slate-500">El precio por defecto es el del tipo (Ajustes → Tipos de pago). En cada pago puedes poner el importe real; cambiar el precio por defecto no toca los pagos ya registrados.</p>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Pagos registrados</h3>
        {records.length === 0 && <p className="text-sm text-slate-500">Sin pagos registrados.</p>}
        <ul className="divide-y divide-slate-100">
          {records.map((r) => {
            const open = edit?.id === r.id;
            return (
              <li key={r.id} className="py-2 text-sm">
                <button type="button" onClick={() => setEdit(open ? null : { ...r, amountStr: String(r.amount).replace(".", ",") })} className="row-link -mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-lg px-2 py-1 text-left">
                  <span className="w-20 shrink-0 tabular-nums text-slate-500">{dmy(r.payment_date)}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{r.concept_name ?? r.concept}{r.brand_name ? ` · ${r.brand_name}` : ""}</span>
                  <span className="font-bold tabular-nums">{eur(Number(r.amount))}</span>
                  <span className={clsx("badge font-bold", REC_STYLE[r.status])}>{REC_LABEL[r.status] ?? r.status}</span>
                  <ChevronDown size={15} className={clsx("shrink-0 text-slate-400 transition-transform", open && "rotate-180")} />
                </button>
                {open && edit && (
                  <div className="fade-in mt-2 space-y-2 rounded-lg bg-slate-50 p-3">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <div className="min-w-0"><label className="label">Tipo</label><select className="input" value={edit.payment_type_id ?? ""} onChange={(e) => setEdit({ ...edit, payment_type_id: e.target.value || null })}>
                        {!edit.payment_type_id && <option value="">{edit.concept_name ?? edit.concept}</option>}
                        {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
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
      </div>
    </section>
  );
}
