"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, Tag, Trash2, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { toast } from "./Toast";
import { EmptyState } from "./ui";

export interface BrandUse { id: string; name: string; uses: number }

/** Marcas de los pagos (Mahou, San Miguel, Alhambra…): añadir, renombrar y eliminar. */
export function BrandsManager({ brands }: { brands: BrandUse[] }) {
  const router = useRouter();
  const sb = supabaseBrowser();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<{ id: string; name: string } | null>(null);

  const clean = (s: string) => s.trim().replace(/\s+/g, " ");
  const exists = (n: string, except?: string) => brands.some((b) => b.id !== except && b.name.toLowerCase() === n.toLowerCase());

  async function add() {
    const n = clean(name);
    if (!n) return;
    if (exists(n)) return toast("Esa marca ya existe", "error");
    setBusy(true);
    const { error } = await sb.from("payment_brands").insert({ name: n });
    setBusy(false);
    if (error) return toast(error.message, "error");
    setName("");
    toast("Marca añadida");
    router.refresh();
  }

  async function rename() {
    if (!edit) return;
    const n = clean(edit.name);
    if (!n) return;
    if (exists(n, edit.id)) return toast("Esa marca ya existe", "error");
    setBusy(true);
    const r = await sb.from("payment_brands").update({ name: n }).eq("id", edit.id);
    // El nombre guardado en conceptos y pagos se actualiza para que los filtros sigan agrupando bien.
    if (!r.error) {
      await sb.from("payment_concepts").update({ brand_name: n }).eq("brand_id", edit.id);
      await sb.from("payment_records").update({ brand_name: n }).eq("brand_id", edit.id);
    }
    setBusy(false);
    if (r.error) return toast(r.error.message, "error");
    setEdit(null);
    toast("Marca renombrada");
    router.refresh();
  }

  async function remove(b: BrandUse) {
    const msg = b.uses
      ? `«${b.name}» se usa en ${b.uses} pago${b.uses === 1 ? "" : "s"} o concepto${b.uses === 1 ? "" : "s"}. Si la eliminas, ya no podrás elegirla, pero esos registros conservarán el nombre. ¿Eliminar?`
      : `¿Eliminar la marca «${b.name}»?`;
    if (!confirm(msg)) return;
    setBusy(true);
    const { error } = await sb.from("payment_brands").delete().eq("id", b.id);
    setBusy(false);
    if (error) return toast(error.message, "error");
    toast("Marca eliminada");
    router.refresh();
  }

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="font-semibold">Marcas</h2>
        <p className="text-xs text-slate-500">Las marcas que eliges en cada pago (por ejemplo, la marca de una nevera o una cabecera).</p>
      </div>
      <div className="flex gap-2">
        <input className="input" placeholder="Nueva marca (ej.: Alhambra)" value={name} maxLength={80} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} aria-label="Nombre de la nueva marca" />
        <button className="btn shrink-0" disabled={busy || !clean(name)} onClick={add}><Plus size={16} /> Añadir</button>
      </div>
      {brands.length === 0 ? <EmptyState title="Sin marcas" text="Añade las marcas con las que trabajas; también puedes crearlas al registrar un pago." /> : (
        <ul className="-mx-2 divide-y divide-slate-100">
          {brands.map((b) => (
            <li key={b.id} className="flex items-center gap-3 px-2 py-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Tag size={16} /></span>
              {edit?.id === b.id ? (
                <>
                  <input className="input !min-h-9" autoFocus value={edit.name} maxLength={80} onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") rename(); if (e.key === "Escape") setEdit(null); }} aria-label="Nuevo nombre" />
                  <button className="icon-btn" aria-label="Guardar nombre" disabled={busy} onClick={rename}><Check size={16} /></button>
                  <button className="icon-btn" aria-label="Cancelar" onClick={() => setEdit(null)}><X size={16} /></button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{b.name}</span>
                    <span className="block text-xs text-slate-500">{b.uses ? `${b.uses} uso${b.uses === 1 ? "" : "s"}` : "Sin usar"}</span>
                  </span>
                  <button className="icon-btn" aria-label={`Renombrar ${b.name}`} onClick={() => setEdit({ id: b.id, name: b.name })}><Pencil size={15} /></button>
                  <button className="icon-btn !text-red-600" aria-label={`Eliminar ${b.name}`} disabled={busy} onClick={() => remove(b)}><Trash2 size={15} /></button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
