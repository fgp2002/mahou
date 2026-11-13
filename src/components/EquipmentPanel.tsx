"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Camera, ChevronRight, MapPin, Plus } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { madridDate } from "@/lib/domain/dates";
import { eur, dmy } from "@/lib/format";
import type { PaymentType } from "@/lib/payments";
import { equipmentTitle, groupOf, LOCATION_SUGGESTIONS, STATUS_LABEL, STATUS_ORDER, STATUS_STYLE, type Equipment, type EquipmentGroup, type EquipmentStatus } from "@/lib/equipment";
import { Segmented, Sheet } from "./Sheet";
import { BrandSelect, type Brand } from "./BrandSelect";
import { EquipmentSheet } from "./EquipmentSheet";
import { toast } from "./Toast";

export interface EquipmentRow extends Equipment { thumb: string | null; paid: number; payments: number }

export function StatusBadge({ status }: { status: EquipmentStatus }) {
  return <span className={clsx("badge font-semibold", STATUS_STYLE[status])}>{STATUS_LABEL[status]}</span>;
}

/** Inventario de la tienda: lo que hay, lo que hay que revisar y lo retirado, con alta rápida. */
export function EquipmentPanel({ storeId, items, types, visitId }: { storeId: string; items: EquipmentRow[]; types: PaymentType[]; visitId?: string | null }) {
  const [tab, setTab] = useState<EquipmentGroup>("actuales");
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const by = (g: EquipmentGroup) => items.filter((e) => groupOf(e.status) === g);
  const shown = by(tab);
  const current = items.find((e) => e.id === open) ?? null;

  return (
    <div className="space-y-3">
      <Segmented value={tab} onChange={setTab} options={[
        { value: "actuales", label: "Actuales", count: by("actuales").length },
        { value: "revisar", label: "Por revisar", count: by("revisar").length },
        { value: "retirados", label: "Retirados", count: by("retirados").length },
      ]} />
      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
          {tab === "actuales" ? "No hay elementos instalados registrados." : tab === "revisar" ? "Nada pendiente de revisar." : "Ningún elemento retirado."}
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((e) => {
            const tn = typeById.get(e.type_id)?.name ?? "Elemento";
            return (
              <li key={e.id}>
                <button type="button" onClick={() => setOpen(e.id)} className="tap flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5 text-left">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-slate-400">
                    {e.thumb ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={e.thumb} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Camera size={20} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <b className="truncate">{equipmentTitle(e, tn)}</b>
                      {e.quantity > 1 && <span className="badge bg-slate-900 text-slate-50">×{e.quantity}</span>}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                      <StatusBadge status={e.status} />
                      <span className="tabular-nums">{e.code}</span>
                      {e.location && <span className="inline-flex items-center gap-0.5"><MapPin size={11} />{e.location}</span>}
                      {e.status === "retirado" ? <span>retirado {dmy(e.removed_on)}</span> : e.installed_on && <span>desde {dmy(e.installed_on)}{e.installed_on_estimated ? " (aprox.)" : ""}</span>}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-bold tabular-nums">{eur(e.paid)}</span>
                    <span className="block text-[11px] text-slate-500">{e.payments} pago{e.payments === 1 ? "" : "s"}</span>
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-slate-400" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button className="btn w-full sm:w-auto" onClick={() => setAdding(true)}><Plus size={16} /> Elemento</button>
      {adding && <NewEquipmentSheet storeId={storeId} types={types} visitId={visitId} onClose={() => setAdding(false)} />}
      {current && <EquipmentSheet item={current} typeName={typeById.get(current.type_id)?.name ?? "Elemento"} types={types} visitId={visitId} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** Alta de un elemento: tipo obligatorio; el resto se puede completar después. */
export function NewEquipmentSheet({ storeId, types, visitId, onClose, onCreated }: { storeId: string; types: PaymentType[]; visitId?: string | null; onClose: () => void; onCreated?: (id: string) => void }) {
  const router = useRouter();
  const inv = types.filter((t) => t.active && t.tracks_inventory);
  const [f, setF] = useState({ typeId: inv[0]?.id ?? "", name: "", quantity: "1", location: "", status: "activo" as EquipmentStatus, installed_on: madridDate(), amount: "", notes: "" });
  const [brand, setBrand] = useState<Brand | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const qty = Number(f.quantity);
    if (!f.typeId) return toast("Elige el tipo de elemento", "error");
    if (!Number.isInteger(qty) || qty < 1) return toast("La cantidad debe ser 1 o más", "error");
    const amt = f.amount.trim() === "" ? null : Number(f.amount.replace(",", "."));
    if (amt != null && (!Number.isFinite(amt) || amt < 0)) return toast("Importe no válido", "error");
    setBusy(true);
    const { data, error } = await supabaseBrowser().from("store_equipment").insert({
      store_id: storeId, type_id: f.typeId, name: f.name.trim() || null, quantity: qty, location: f.location.trim() || null,
      status: f.status, installed_on: f.status === "pendiente_instalacion" ? null : f.installed_on || null,
      reference_amount: amt, notes: f.notes.trim() || null, brand_id: brand?.id ?? null, brand_name: brand?.name ?? null,
      context_visit_id: visitId ?? null,
    }).select("id").single();
    setBusy(false);
    if (error) return toast(error.message, "error");
    toast("Elemento añadido al inventario");
    onCreated?.(data.id);
    onClose();
    router.refresh();
  }

  return (
    <Sheet title="Nuevo elemento" subtitle="Solo el tipo es obligatorio. Lo demás puedes completarlo luego." onClose={onClose}
      footer={<div className="flex gap-2"><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn flex-1" disabled={busy} onClick={save}>{busy ? "Guardando…" : "Añadir al inventario"}</button></div>}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label">Tipo</label>
          <div className="flex flex-wrap gap-1.5">
            {inv.map((t) => (
              <button key={t.id} type="button" onClick={() => setF({ ...f, typeId: t.id })}
                className={`tap min-h-10 rounded-full border px-3 text-sm ${f.typeId === t.id ? "border-brand-600 bg-brand-600 font-semibold text-[rgb(var(--on-accent))]" : "border-slate-300 text-slate-700"}`}>{t.name}</button>
            ))}
          </div>
        </div>
        <div className="col-span-2 sm:col-span-1"><BrandSelect label="Marca" value={brand?.id ?? null} onChange={setBrand} /></div>
        <div><label className="label" htmlFor="ne-qty">Cantidad</label><input id="ne-qty" className="input" inputMode="numeric" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value.replace(/\D/g, "") })} /></div>
        <div className="col-span-2 sm:col-span-1"><label className="label" htmlFor="ne-name">Descripción (opcional)</label><input id="ne-name" className="input" placeholder="p. ej. Nevera vertical 2 puertas" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="col-span-2 sm:col-span-1">
          <label className="label" htmlFor="ne-loc">Ubicación en la tienda</label>
          <input id="ne-loc" className="input" list="loc-suggest" placeholder="Entrada, cajas…" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
          <datalist id="loc-suggest">{LOCATION_SUGGESTIONS.map((l) => <option key={l} value={l} />)}</datalist>
        </div>
        <div><label className="label" htmlFor="ne-st">Estado</label>
          <select id="ne-st" className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as EquipmentStatus })}>
            {STATUS_ORDER.filter((s) => s !== "retirado").map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        {f.status !== "pendiente_instalacion" && <div><label className="label" htmlFor="ne-date">Instalación</label><input id="ne-date" type="date" className="input" value={f.installed_on} onChange={(e) => setF({ ...f, installed_on: e.target.value })} /></div>}
        <div><label className="label" htmlFor="ne-amt">Importe de referencia (€)</label><input id="ne-amt" className="input" inputMode="decimal" placeholder="opcional" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
        <div className="col-span-2"><label className="label" htmlFor="ne-notes">Observaciones</label><textarea id="ne-notes" className="input" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      </div>
    </Sheet>
  );
}
