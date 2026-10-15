"use client";
import { useEffect, useState } from "react";
import { Minus, Package, Plus, Trash2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { toast } from "./Toast";

export interface VisitItem { id: string; product_id: string | null; product_name: string; quantity: number }
interface Prod { id: string; name: string; reference: string | null }

/** Material colocado en la visita: producto del catálogo + cantidad. Se guarda al momento. */
export function VisitItems({ visitId, initial, editable }: { visitId: string; initial: VisitItem[]; editable: boolean }) {
  const sb = supabaseBrowser();
  const [items, setItems] = useState(initial);
  const [products, setProducts] = useState<Prod[]>([]);
  const [pick, setPick] = useState("");
  const [qty, setQty] = useState("1");

  useEffect(() => {
    if (!editable) return;
    sb.from("products").select("id,name,reference").eq("active", true).order("name").then(({ data }) => setProducts((data ?? []) as Prod[]));
  }, [editable, sb]);

  async function add() {
    const p = products.find((x) => x.id === pick);
    const q = Number(qty);
    if (!p || !Number.isInteger(q) || q < 1) return toast("Elige un producto y una cantidad", "error");
    const existing = items.find((i) => i.product_id === p.id);
    if (existing) return change(existing, existing.quantity + q);
    const { data, error } = await sb.from("visit_items").insert({ visit_id: visitId, product_id: p.id, product_name: p.name, quantity: q }).select("id,product_id,product_name,quantity").single();
    if (error || !data) return toast(error?.message ?? "No se pudo añadir", "error");
    setItems([...items, data as VisitItem]);
    setPick(""); setQty("1");
  }
  async function change(it: VisitItem, q: number) {
    if (q < 1) return remove(it);
    const { error } = await sb.from("visit_items").update({ quantity: q }).eq("id", it.id);
    if (error) return toast(error.message, "error");
    setItems(items.map((x) => (x.id === it.id ? { ...x, quantity: q } : x)));
  }
  async function remove(it: VisitItem) {
    const { error } = await sb.from("visit_items").delete().eq("id", it.id);
    if (error) return toast(error.message, "error");
    setItems(items.filter((x) => x.id !== it.id));
  }

  if (!editable && items.length === 0) return null;
  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">Material colocado</h2>
      {items.length === 0 && <p className="text-sm text-slate-500">Nada todavía.</p>}
      <ul className="divide-y divide-slate-100">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-2 py-2 text-sm">
            <Package size={16} className="shrink-0 text-slate-400" />
            <span className="min-w-0 flex-1 truncate font-medium">{it.product_name}</span>
            {editable ? (
              <span className="flex items-center gap-1">
                <button type="button" className="icon-btn" aria-label="Menos" onClick={() => change(it, it.quantity - 1)}><Minus size={15} /></button>
                <span className="w-8 text-center font-bold tabular-nums">{it.quantity}</span>
                <button type="button" className="icon-btn" aria-label="Más" onClick={() => change(it, it.quantity + 1)}><Plus size={15} /></button>
                <button type="button" className="icon-btn !text-red-600" aria-label={`Quitar ${it.product_name}`} onClick={() => remove(it)}><Trash2 size={15} /></button>
              </span>
            ) : <span className="font-bold tabular-nums">× {it.quantity}</span>}
          </li>
        ))}
      </ul>
      {editable && (
        products.length === 0 ? <p className="text-xs text-slate-500">Añade productos en Ajustes → Catálogo → Productos para elegirlos aquí.</p> : (
          <div className="grid grid-cols-[1fr_5rem_auto] items-end gap-2">
            <div className="min-w-0"><label className="label" htmlFor="vi-p">Producto</label>
              <select id="vi-p" className="input" value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Elige producto…</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.reference ? ` · ${p.reference}` : ""}</option>)}
              </select>
            </div>
            <div className="min-w-0"><label className="label" htmlFor="vi-q">Cantidad</label><input id="vi-q" className="input" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} /></div>
            <button type="button" className="btn" disabled={!pick} onClick={add}><Plus size={16} /> Añadir</button>
          </div>
        )
      )}
    </section>
  );
}
