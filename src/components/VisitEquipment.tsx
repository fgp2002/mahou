"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Camera, Check, ChevronRight, Plus, Wallet } from "lucide-react";
import type { PaymentType } from "@/lib/payments";
import { madridDate } from "@/lib/domain/dates";
import { eur } from "@/lib/format";
import { equipmentTitle, type Equipment } from "@/lib/equipment";
import { paymentValues, parseAmount } from "@/lib/paymentRecord";
import { writeOrQueue } from "@/lib/offline/outbox";
import { uploadPhoto } from "@/lib/photos";
import { StatusBadge, NewEquipmentSheet } from "./EquipmentPanel";
import { EquipmentSheet } from "./EquipmentSheet";
import { BrandSelect, type Brand } from "./BrandSelect";
import { toast } from "./Toast";

interface Done { reviewed?: boolean; photos?: number; paid?: number }

/**
 * Paso «Elementos y pagos» de la visita: cada elemento de la tienda con cuatro acciones de un toque.
 * Nada es obligatorio. Todo funciona sin conexión (se envía al volver la red).
 */
export function VisitEquipment({ visitId, storeId, items, types }: { visitId: string; storeId: string; items: Equipment[]; types: PaymentType[] }) {
  const router = useRouter();
  const today = madridDate();
  const typeById = new Map(types.map((t) => [t.id, t]));
  const [done, setDone] = useState<Record<string, Done>>({});
  const [paying, setPaying] = useState<{ id: string; amount: string; status: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [other, setOther] = useState<{ typeId: string; amount: string; status: string } | null>(null);
  const [otherBrand, setOtherBrand] = useState<Brand | null>(null);
  const mark = (id: string, d: Done) => setDone((m) => ({ ...m, [id]: { ...m[id], ...d } }));
  const list = items.filter((e) => e.status !== "retirado");

  async function review(e: Equipment) {
    setBusy(e.id);
    const r = await writeOrQueue({ kind: "update", table: "store_equipment", id: e.id, values: { last_reviewed_at: new Date().toISOString(), context_visit_id: visitId }, label: "Revisión" });
    setBusy(null);
    if (r.error) return toast(r.error, "error");
    mark(e.id, { reviewed: true });
  }

  async function photo(e: Equipment, files: FileList | null) {
    if (!files?.length) return;
    setBusy(e.id);
    try {
      let queued = false;
      for (const f of Array.from(files)) queued = (await uploadPhoto(f, { kind: "elemento", storeId, visitId, equipmentId: e.id })).queued || queued;
      mark(e.id, { photos: (done[e.id]?.photos ?? 0) + files.length });
      if (queued) toast("Foto guardada en el móvil");
    } catch (err) { toast((err as Error).message, "error"); }
    setBusy(null);
  }

  async function pay(e: Equipment) {
    if (!paying) return;
    const t = typeById.get(e.type_id);
    const amount = parseAmount(paying.amount);
    if (!t || amount == null) return toast("Importe no válido", "error");
    setBusy(e.id);
    const r = await writeOrQueue({ kind: "insert", table: "payment_records", label: `Pago ${t.name}`, values: paymentValues({ storeId, type: t, amount, date: today, status: paying.status, visitId, equipment: e }) });
    setBusy(null);
    if (r.error) return toast(r.error, "error");
    mark(e.id, { paid: (done[e.id]?.paid ?? 0) + amount });
    setPaying(null);
    toast(r.queued ? "Pago guardado en el móvil" : "Pago registrado");
    router.refresh();
  }

  async function payOther() {
    if (!other) return;
    const t = typeById.get(other.typeId);
    const amount = parseAmount(other.amount);
    if (!t) return toast("Elige el concepto", "error");
    if (amount == null) return toast("Importe no válido", "error");
    setBusy("other");
    const r = await writeOrQueue({ kind: "insert", table: "payment_records", label: `Pago ${t.name}`, values: paymentValues({ storeId, type: t, amount, date: today, status: other.status, visitId, brand: otherBrand }) });
    setBusy(null);
    if (r.error) return toast(r.error, "error");
    setOther(null);
    setOtherBrand(null);
    toast(r.queued ? "Pago guardado en el móvil" : "Pago registrado");
    router.refresh();
  }

  const current = items.find((e) => e.id === open) ?? null;

  return (
    <div className="space-y-3">
      {list.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-500">Esta tienda no tiene elementos en el inventario. Si has instalado algo, añádelo.</p>}
      <ul className="space-y-2">
        {list.map((e) => {
          const t = typeById.get(e.type_id);
          const d = done[e.id] ?? {};
          const isPaying = paying?.id === e.id;
          return (
            <li key={e.id} className={clsx("rounded-xl border p-2.5", d.reviewed || d.paid || d.photos ? "border-green-600/40 bg-green-100/40" : "border-slate-200")}>
              <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => setOpen(e.id)}>
                <span className="min-w-0 flex-1">
                  <b className="block truncate">{equipmentTitle(e, t?.name ?? "Elemento")}{e.quantity > 1 ? ` ×${e.quantity}` : ""}</b>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500"><StatusBadge status={e.status} />{e.location}
                    {d.reviewed && <span className="font-semibold text-green-700">✓ revisado</span>}
                    {!!d.photos && <span className="font-semibold text-green-700">✓ {d.photos} foto{d.photos === 1 ? "" : "s"}</span>}
                    {!!d.paid && <span className="font-semibold text-green-700">✓ {eur(d.paid)}</span>}
                  </span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-slate-400" />
              </button>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                <button className={clsx("tap flex min-h-11 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold", d.reviewed ? "bg-green-600 text-white" : "bg-slate-100")} disabled={busy === e.id || d.reviewed} onClick={() => review(e)}><Check size={16} /> Revisado</button>
                <label className="tap flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-slate-100 text-sm font-semibold"><Camera size={16} /> Foto
                  <input type="file" accept="image/*" capture="environment" className="hidden" disabled={busy === e.id} onChange={(ev) => { photo(e, ev.target.files); ev.target.value = ""; }} /></label>
                <button className="tap flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-slate-100 text-sm font-semibold" onClick={() => setPaying(isPaying ? null : { id: e.id, amount: String(e.reference_amount ?? t?.default_amount ?? "").replace(".", ","), status: "comprobado" })}><Wallet size={16} /> Pagar</button>
              </div>
              {isPaying && paying && (
                <div className="fade-in mt-2 flex flex-wrap items-end gap-2">
                  <div className="w-28"><label className="label">Importe (€)</label><input className="input" inputMode="decimal" autoFocus value={paying.amount} onChange={(ev) => setPaying({ ...paying, amount: ev.target.value })} /></div>
                  <div className="min-w-32 flex-1"><label className="label">Estado</label><select className="input" value={paying.status} onChange={(ev) => setPaying({ ...paying, status: ev.target.value })}><option value="previsto">Previsto</option><option value="comprobado">Comprobado</option><option value="abonado">Abonado</option></select></div>
                  <button className="btn" disabled={busy === e.id} onClick={() => pay(e)}>Registrar</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-secondary" onClick={() => setAdding(true)}><Plus size={16} /> Nuevo elemento</button>
        <button className="btn-secondary" onClick={() => setOther(other ? null : { typeId: "", amount: "", status: "comprobado" })}><Wallet size={16} /> Otro pago</button>
      </div>
      {other && (
        <div className="fade-in grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-3">
          <div className="col-span-2"><label className="label">Concepto (sin elemento físico)</label>
            <select className="input" value={other.typeId} onChange={(e) => { const t = typeById.get(e.target.value); setOther({ ...other, typeId: e.target.value, amount: other.amount || String(t?.default_amount ?? "").replace(".", ",") }); }}>
              <option value="">Elige…</option>
              {types.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select></div>
          <div className="col-span-2"><BrandSelect label="Marca" value={otherBrand?.id ?? null} onChange={setOtherBrand} /></div>
          <div><label className="label">Importe (€)</label><input className="input" inputMode="decimal" value={other.amount} onChange={(e) => setOther({ ...other, amount: e.target.value })} /></div>
          <div><label className="label">Estado</label><select className="input" value={other.status} onChange={(e) => setOther({ ...other, status: e.target.value })}><option value="previsto">Previsto</option><option value="comprobado">Comprobado</option><option value="abonado">Abonado</option></select></div>
          <button className="btn col-span-2" disabled={busy === "other"} onClick={payOther}>Registrar pago</button>
        </div>
      )}
      {adding && <NewEquipmentSheet storeId={storeId} types={types} visitId={visitId} onClose={() => setAdding(false)} />}
      {current && <EquipmentSheet item={current} typeName={typeById.get(current.type_id)?.name ?? "Elemento"} types={types} visitId={visitId} onClose={() => setOpen(null)} />}
    </div>
  );
}
