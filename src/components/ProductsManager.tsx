"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Package, Plus, Search, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Field } from "./Field";
import { toast } from "./Toast";
import { EmptyState } from "./ui";

export interface Product {
  id: string; reference: string | null; name: string; brand: string | null; container: string | null;
  capacity_ml: number | null; pack_units: number | null; notes: string | null; active: boolean;
}

const CONTAINERS: [string, string][] = [["botella", "Botella"], ["lata", "Lata"], ["barril", "Barril"], ["otro", "Otro"]];
const CAPS = [200, 250, 330, 500, 750, 1000, 1500, 5000, 20000, 30000];
const PACKS = [1, 4, 6, 12, 24];

export function fmtCapacity(ml: number | null): string {
  if (ml == null) return "";
  return ml >= 1000 ? `${(ml / 1000).toLocaleString("es-ES")} L` : `${(ml / 10).toLocaleString("es-ES")} cl`;
}
export function productSummary(p: Pick<Product, "container" | "capacity_ml" | "pack_units">): string {
  const c = CONTAINERS.find(([k]) => k === p.container)?.[1];
  return [c, fmtCapacity(p.capacity_ml), p.pack_units ? (p.pack_units === 1 ? "unidad" : `pack de ${p.pack_units}`) : null].filter(Boolean).join(" · ");
}

type Draft = { id?: string; reference: string; name: string; brand: string; container: string; capacity: string; capUnit: "cl" | "L"; pack: string; notes: string; active: boolean };
const empty: Draft = { reference: "", name: "", brand: "", container: "botella", capacity: "", capUnit: "cl", pack: "", notes: "", active: true };

function toDraft(p: Product): Draft {
  const ml = p.capacity_ml;
  const useL = ml != null && ml >= 1000;
  return {
    id: p.id, reference: p.reference ?? "", name: p.name, brand: p.brand ?? "", container: p.container ?? "otro",
    capacity: ml == null ? "" : String(useL ? ml / 1000 : ml / 10).replace(".", ","), capUnit: useL ? "L" : "cl",
    pack: p.pack_units ? String(p.pack_units) : "", notes: p.notes ?? "", active: p.active,
  };
}

export function ProductsManager({ products }: { products: Product[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [d, setD] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return products.filter((p) => !t || `${p.name} ${p.reference ?? ""} ${p.brand ?? ""}`.toLowerCase().includes(t));
  }, [products, q]);

  const capMl = (x: Draft) => {
    if (!x.capacity.trim()) return null;
    const n = Number(x.capacity.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? Math.round(n * (x.capUnit === "L" ? 1000 : 10)) : NaN;
  };

  async function save() {
    if (!d) return;
    setErr(null);
    if (!d.name.trim()) return setErr("El nombre es obligatorio.");
    const ml = capMl(d);
    if (Number.isNaN(ml)) return setErr("La capacidad no es válida.");
    const pack = d.pack.trim() ? Number(d.pack) : null;
    if (pack != null && (!Number.isInteger(pack) || pack < 1)) return setErr("Las unidades por pack deben ser un número entero.");
    const ref = d.reference.trim();
    if (ref && products.some((p) => p.id !== d.id && (p.reference ?? "").trim().toLowerCase() === ref.toLowerCase()))
      return setErr("Ya existe un producto con esa referencia.");
    const payload = {
      reference: ref || null, name: d.name.trim(), brand: d.brand.trim() || null, container: d.container || null,
      capacity_ml: ml, pack_units: pack, notes: d.notes.trim() || null, active: d.active, updated_at: new Date().toISOString(),
    };
    setBusy(true);
    const sb = supabaseBrowser();
    const r = d.id ? await sb.from("products").update(payload).eq("id", d.id) : await sb.from("products").insert(payload);
    setBusy(false);
    if (r.error) return setErr(r.error.message.includes("products_owner_ref") ? "Ya existe un producto con esa referencia." : r.error.message);
    toast(d.id ? "Producto actualizado" : "Producto añadido");
    setD(null);
    router.refresh();
  }

  async function remove() {
    if (!d?.id || !confirm(`¿Eliminar «${d.name}»? Esta acción no se puede deshacer.`)) return;
    setBusy(true);
    const { error } = await supabaseBrowser().from("products").delete().eq("id", d.id);
    setBusy(false);
    if (error) return setErr(error.message);
    toast("Producto eliminado");
    setD(null);
    router.refresh();
  }

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Productos</h2>
          <p className="text-xs text-slate-500">{products.length} en el catálogo</p>
        </div>
        <button className="btn" onClick={() => { setErr(null); setD({ ...empty }); }}><Plus size={16} /> Nuevo producto</button>
      </div>

      {products.length > 0 && (
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input !rounded-full !pl-10" placeholder="Buscar por nombre, referencia o marca" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar productos" />
        </div>
      )}

      {products.length === 0 ? (
        <EmptyState title="Tu catálogo está vacío" text="Añade tus productos con su referencia, envase, capacidad y unidades por pack.">
          <button className="btn" onClick={() => setD({ ...empty })}><Plus size={16} /> Añadir el primero</button>
        </EmptyState>
      ) : (
        <ul className="-mx-2 divide-y divide-slate-100">
          {shown.map((p) => (
            <li key={p.id}>
              <button onClick={() => { setErr(null); setD(toDraft(p)); }} className={clsx("row-link flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left", !p.active && "opacity-50")}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><Package size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{p.name}{!p.active && " (inactivo)"}</span>
                  <span className="block truncate text-xs text-slate-500">{[p.reference && `Ref. ${p.reference}`, p.brand, productSummary(p)].filter(Boolean).join(" · ")}</span>
                </span>
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="p-4 text-center text-sm text-slate-500">Ningún producto coincide.</li>}
        </ul>
      )}

      {d && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 fade-in md:items-center" onClick={() => setD(null)}>
          <div role="dialog" aria-label={d.id ? "Editar producto" : "Nuevo producto"} onClick={(e) => e.stopPropagation()}
            className="sheet-up max-h-[92dvh] w-full max-w-lg space-y-3 overflow-y-auto rounded-t-2xl bg-white p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:rounded-lg">
            <div className="flex items-center justify-between"><b className="text-lg">{d.id ? "Editar producto" : "Nuevo producto"}</b><button aria-label="Cerrar" className="p-2" onClick={() => setD(null)}><X size={18} /></button></div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Referencia" value={d.reference} onChange={(v) => setD({ ...d, reference: v })} maxLength={60} />
              <Field label="Marca" value={d.brand} onChange={(v) => setD({ ...d, brand: v })} maxLength={80} />
              <Field className="col-span-2" label="Nombre" required value={d.name} onChange={(v) => setD({ ...d, name: v })} maxLength={120} />
            </div>

            <div>
              <div className="label">Envase</div>
              <div className="flex flex-wrap gap-1.5">
                {CONTAINERS.map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setD({ ...d, container: k })} className={clsx("tap min-h-10 rounded-full border px-4 text-sm", d.container === k ? "border-brand-600 bg-brand-600 text-[rgb(var(--on-accent))]" : "border-slate-300 text-slate-700")}>{l}</button>
                ))}
              </div>
            </div>

            <div>
              <div className="label">Capacidad</div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {CAPS.map((ml) => {
                  const on = capMl(d) === ml;
                  return (
                    <button key={ml} type="button" onClick={() => setD({ ...d, capacity: String(ml >= 1000 ? ml / 1000 : ml / 10).replace(".", ","), capUnit: ml >= 1000 ? "L" : "cl" })}
                      className={clsx("tap min-h-9 rounded-full border px-3 text-xs", on ? "border-brand-600 bg-brand-600 text-[rgb(var(--on-accent))]" : "border-slate-300 text-slate-700")}>{fmtCapacity(ml)}</button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <Field className="flex-1" label="Otra capacidad" inputMode="decimal" value={d.capacity} onChange={(v) => setD({ ...d, capacity: v })} />
                <div className="flex rounded-lg bg-slate-100 p-1">
                  {(["cl", "L"] as const).map((u) => (
                    <button key={u} type="button" onClick={() => setD({ ...d, capUnit: u })} className={clsx("min-w-12 rounded-xl px-3 text-sm font-semibold", d.capUnit === u ? "bg-white shadow-card" : "text-slate-500")}>{u}</button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <div className="label">Unidades por pack</div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {PACKS.map((n) => (
                  <button key={n} type="button" onClick={() => setD({ ...d, pack: String(n) })} className={clsx("tap min-h-9 rounded-full border px-3 text-xs", d.pack === String(n) ? "border-brand-600 bg-brand-600 text-[rgb(var(--on-accent))]" : "border-slate-300 text-slate-700")}>{n === 1 ? "Unidad" : `×${n}`}</button>
                ))}
              </div>
              <Field label="Otra cantidad" inputMode="numeric" value={d.pack} onChange={(v) => setD({ ...d, pack: v.replace(/\D/g, "") })} />
            </div>

            <Field label="Notas" rows={2} value={d.notes} onChange={(v) => setD({ ...d, notes: v })} />
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-[rgb(var(--slate-900))]" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} /> Producto activo
            </label>
            {err && <p className="text-sm text-red-600" role="alert">{err}</p>}
            <div className="flex gap-2">
              {d.id && <button type="button" className="btn-secondary !text-red-600" onClick={remove} disabled={busy}>Eliminar</button>}
              <button type="button" className="btn flex-1" onClick={save} disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
