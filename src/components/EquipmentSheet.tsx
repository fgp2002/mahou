"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { Camera, Check, History, Images, Trash2, Wallet } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { madridDate } from "@/lib/domain/dates";
import { eur, dmy } from "@/lib/format";
import type { PaymentType } from "@/lib/payments";
import { describeEvent, equipmentTitle, LOCATION_SUGGESTIONS, STATUS_HINT, STATUS_LABEL, STATUS_ORDER, statusPatch, validateEquipment, type Equipment, type EquipmentEvent, type EquipmentStatus } from "@/lib/equipment";
import { paymentValues, parseAmount } from "@/lib/paymentRecord";
import { uploadPhoto, trashPhoto } from "@/lib/photos";
import { writeOrQueue } from "@/lib/offline/outbox";
import { Segmented, Sheet } from "./Sheet";
import { BrandSelect } from "./BrandSelect";
import { StatusBadge } from "./EquipmentPanel";
import { toast } from "./Toast";

type Tab = "datos" | "fotos" | "pagos" | "historial";
interface Photo { id: string; url: string | null; thumb: string | null; taken_at: string; visit_id: string | null }
interface Pay { id: string; amount: number; payment_date: string; status: string; visit_id: string | null; concept_name: string | null }

const PAY_LABEL: Record<string, string> = { previsto: "Previsto", aprobado: "Aprobado", comprobado: "Comprobado", abonado: "Abonado", cancelado: "Cancelado" };

/** Ficha de un elemento del inventario: datos, estado, fotos, pagos e historial. */
export function EquipmentSheet({ item, typeName, types, visitId, onClose }: { item: Equipment; typeName: string; types: PaymentType[]; visitId?: string | null; onClose: () => void }) {
  const router = useRouter();
  const sb = supabaseBrowser();
  const today = madridDate();
  const type = types.find((t) => t.id === item.type_id);
  const [tab, setTab] = useState<Tab>("datos");
  const [busy, setBusy] = useState(false);
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [pays, setPays] = useState<Pay[] | null>(null);
  const [events, setEvents] = useState<EquipmentEvent[] | null>(null);
  const [f, setF] = useState({
    name: item.name ?? "", quantity: String(item.quantity), location: item.location ?? "", installed_on: item.installed_on ?? "",
    removed_on: item.removed_on ?? "", amount: item.reference_amount != null ? String(item.reference_amount).replace(".", ",") : "", notes: item.notes ?? "",
    type_id: item.type_id, brand_id: item.brand_id, brand_name: item.brand_name,
  });
  const [st, setSt] = useState<{ status: EquipmentStatus; date: string } | null>(null);
  const [pay, setPay] = useState<{ amount: string; date: string; status: string } | null>(null);

  async function load() {
    const [ph, pr, ev] = await Promise.all([
      sb.from("visit_photos").select("id,storage_path,thumb_path,taken_at,visit_id").eq("equipment_id", item.id).is("deleted_at", null).order("taken_at", { ascending: false }),
      sb.from("payment_records").select("id,amount,payment_date,status,visit_id,concept_name").eq("equipment_id", item.id).is("deleted_at", null).order("payment_date", { ascending: false }),
      sb.from("equipment_events").select("*").eq("equipment_id", item.id).order("occurred_on", { ascending: false }).order("created_at", { ascending: false }),
    ]);
    type Row = { id: string; storage_path: string; thumb_path: string | null; taken_at: string; visit_id: string | null };
    const rows = (ph.data ?? []) as Row[];
    const paths = rows.flatMap((p) => [p.storage_path, p.thumb_path].filter(Boolean) as string[]);
    const { data: signed } = paths.length ? await sb.storage.from("visit-photos").createSignedUrls(paths, 3600) : { data: [] };
    const url = new Map<string, string>((signed ?? []).map((s: { path: string | null; signedUrl: string }) => [s.path ?? "", s.signedUrl]));
    setPhotos(rows.map((p) => ({ id: p.id, url: url.get(p.storage_path) ?? null, thumb: p.thumb_path ? url.get(p.thumb_path) ?? null : null, taken_at: p.taken_at, visit_id: p.visit_id })));
    setPays((pr.data ?? []) as Pay[]);
    setEvents((ev.data ?? []) as EquipmentEvent[]);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [item.id]);

  async function update(values: Record<string, unknown>, ok: string) {
    setBusy(true);
    const r = await writeOrQueue({ kind: "update", table: "store_equipment", id: item.id, values: { ...values, context_visit_id: visitId ?? null }, label: "Elemento" });
    setBusy(false);
    if (r.error) { toast(r.error, "error"); return false; }
    toast(r.queued ? `${ok} (se enviará al volver la red)` : ok);
    router.refresh();
    load();
    return true;
  }

  async function saveData() {
    const quantity = Number(f.quantity);
    const reference_amount = f.amount.trim() === "" ? null : parseAmount(f.amount);
    if (f.amount.trim() !== "" && reference_amount == null) return toast("Importe no válido", "error");
    const err = validateEquipment({ quantity, installed_on: f.installed_on || null, removed_on: f.removed_on || null, reference_amount });
    if (err) return toast(err, "error");
    await update({
      name: f.name.trim() || null, quantity, location: f.location.trim() || null, installed_on: f.installed_on || null,
      installed_on_estimated: item.installed_on_estimated && f.installed_on === (item.installed_on ?? ""),
      removed_on: item.status === "retirado" ? f.removed_on || null : null, reference_amount, notes: f.notes.trim() || null,
      type_id: f.type_id, brand_id: f.brand_id, brand_name: f.brand_name,
    }, "Datos guardados");
  }

  async function changeStatus() {
    if (!st) return;
    const ok = await update(statusPatch(item, st.status, today, st.date) as Record<string, unknown>, `Estado: ${STATUS_LABEL[st.status]}`);
    if (ok) setSt(null);
  }

  async function addPhoto(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      let queued = false;
      for (const file of Array.from(files)) queued = (await uploadPhoto(file, { kind: "elemento", storeId: item.store_id, equipmentId: item.id, visitId: visitId ?? null })).queued || queued;
      toast(queued ? "Foto guardada en el móvil: se subirá al volver la red" : "Foto añadida");
      load();
      router.refresh();
    } catch (e) { toast((e as Error).message, "error"); }
    setBusy(false);
  }

  async function savePay() {
    if (!pay || !type) return;
    const amount = parseAmount(pay.amount);
    if (amount == null) return toast("Importe no válido", "error");
    setBusy(true);
    const r = await writeOrQueue({ kind: "insert", table: "payment_records", label: `Pago ${type.name}`, values: paymentValues({ storeId: item.store_id, type, amount, date: pay.date, status: pay.status, visitId, equipment: item }) });
    setBusy(false);
    if (r.error) return toast(r.error, "error");
    toast(r.queued ? "Pago guardado en el móvil" : "Pago registrado");
    setPay(null);
    load();
    router.refresh();
  }

  const totalPaid = (pays ?? []).filter((p) => p.status === "abonado").reduce((s, p) => s + Number(p.amount), 0);

  return (
    <Sheet title={equipmentTitle(item, typeName)} subtitle={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={item.status} /><span className="tabular-nums">{item.code}</span>{item.location && <span>· {item.location}</span>}</span>} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-2">
          <button className="tap flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl bg-slate-100 text-xs font-semibold" disabled={busy} onClick={() => update({ last_reviewed_at: new Date().toISOString() }, "Marcado como revisado")}><Check size={18} /> Revisado</button>
          <button className="tap flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl bg-slate-100 text-xs font-semibold" onClick={() => setSt({ status: item.status === "retirado" ? "activo" : "pendiente_revision", date: today })}><History size={18} /> Estado</button>
          <label className="tap flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl bg-slate-100 text-xs font-semibold"><Camera size={18} /> Foto
            <input type="file" accept="image/*" capture="environment" className="hidden" disabled={busy} onChange={(e) => { addPhoto(e.target.files); e.target.value = ""; }} /></label>
          <button className="tap flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl bg-slate-100 text-xs font-semibold" onClick={() => setPay({ amount: (item.reference_amount ?? type?.default_amount ?? "").toString().replace(".", ","), date: today, status: "comprobado" })}><Wallet size={18} /> Pago</button>
        </div>

        {st && (
          <div className="fade-in space-y-3 rounded-xl border border-slate-200 p-3">
            <div className="label">Nuevo estado</div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {STATUS_ORDER.map((s) => (
                <button key={s} type="button" onClick={() => setSt({ ...st, status: s })}
                  className={clsx("tap min-h-11 rounded-lg border px-2 text-sm", st.status === s ? "border-brand-600 bg-brand-50 font-semibold text-brand-700" : "border-slate-200")}>{STATUS_LABEL[s]}</button>
              ))}
            </div>
            <p className="text-xs text-slate-500">{STATUS_HINT[st.status]}</p>
            {(st.status === "retirado" || ((st.status === "instalado" || st.status === "activo") && (item.status === "pendiente_instalacion" || !item.installed_on))) && (
              <div><label className="label">{st.status === "retirado" ? "Fecha de retirada" : "Fecha de instalación"}</label><input type="date" className="input" value={st.date} onChange={(e) => setSt({ ...st, date: e.target.value })} /></div>
            )}
            <div className="flex gap-2"><button className="btn-secondary" onClick={() => setSt(null)}>Cancelar</button><button className="btn flex-1" disabled={busy || st.status === item.status} onClick={changeStatus}>Guardar estado</button></div>
          </div>
        )}

        {pay && (
          <div className="fade-in grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-3">
            <div><label className="label">Importe (€)</label><input className="input" inputMode="decimal" autoFocus value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></div>
            <div><label className="label">Fecha</label><input type="date" className="input" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} /></div>
            <div className="col-span-2"><label className="label">Estado</label><select className="input" value={pay.status} onChange={(e) => setPay({ ...pay, status: e.target.value })}>{["previsto", "comprobado", "abonado"].map((k) => <option key={k} value={k}>{PAY_LABEL[k]}</option>)}</select></div>
            <div className="col-span-2 flex gap-2"><button className="btn-secondary" onClick={() => setPay(null)}>Cancelar</button><button className="btn flex-1" disabled={busy} onClick={savePay}>Registrar pago</button></div>
          </div>
        )}

        <Segmented value={tab} onChange={setTab} options={[
          { value: "datos", label: "Datos" },
          { value: "fotos", label: "Fotos", count: photos?.length },
          { value: "pagos", label: "Pagos", count: pays?.length },
          { value: "historial", label: "Historial" },
        ]} />

        {tab === "datos" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1"><label className="label">Tipo</label>
              <select className="input" value={f.type_id} onChange={(e) => setF({ ...f, type_id: e.target.value })}>
                {types.filter((t) => t.tracks_inventory || t.id === item.type_id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select></div>
            <div className="col-span-2 sm:col-span-1"><BrandSelect label="Marca" value={f.brand_id} onChange={(b) => setF({ ...f, brand_id: b?.id ?? null, brand_name: b?.name ?? null })} /></div>
            <div className="col-span-2 sm:col-span-1"><label className="label">Descripción</label><input className="input" value={f.name} placeholder={typeName} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div><label className="label">Cantidad</label><input className="input" inputMode="numeric" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value.replace(/\D/g, "") })} /></div>
            <div className="col-span-2 sm:col-span-1"><label className="label">Ubicación</label><input className="input" list="loc-suggest-e" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /><datalist id="loc-suggest-e">{LOCATION_SUGGESTIONS.map((l) => <option key={l} value={l} />)}</datalist></div>
            <div><label className="label">Instalación{item.installed_on_estimated && f.installed_on === (item.installed_on ?? "") ? " (aprox.)" : ""}</label><input type="date" className="input" value={f.installed_on} onChange={(e) => setF({ ...f, installed_on: e.target.value })} /></div>
            {item.status === "retirado" && <div><label className="label">Retirada</label><input type="date" className="input" value={f.removed_on} onChange={(e) => setF({ ...f, removed_on: e.target.value })} /></div>}
            <div><label className="label">Importe de referencia (€)</label><input className="input" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
            <div className="col-span-2"><label className="label">Observaciones</label><textarea className="input" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
            {item.installed_on_estimated && <p className="col-span-2 text-xs text-slate-500">La fecha de instalación es aproximada: es el día en que se dio de alta en la app. Corrígela si la conoces.</p>}
            <div className="col-span-2 flex flex-wrap gap-2">
              <button className="btn flex-1" disabled={busy} onClick={saveData}>Guardar datos</button>
              <button className="btn-secondary !text-red-600" disabled={busy} onClick={() => confirm("¿Enviar este elemento a la papelera? Podrás recuperarlo desde Ajustes → Papelera.") && update({ deleted_at: new Date().toISOString() }, "Elemento en la papelera").then((ok) => ok && onClose())}><Trash2 size={15} /> Papelera</button>
            </div>
            {item.last_reviewed_at && <p className="col-span-2 text-xs text-slate-500">Última revisión: {dmy(item.last_reviewed_at.slice(0, 10))}</p>}
          </div>
        )}

        {tab === "fotos" && (
          photos === null ? <div className="skeleton h-24" /> : photos.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">Sin fotos de este elemento. Usa «Foto» para documentar su estado.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((p) => (
                <figure key={p.id} className="relative">
                  <a href={p.url ?? undefined} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg bg-slate-100">
                    {(p.thumb ?? p.url) && /* eslint-disable-next-line @next/next/no-img-element */ <img src={(p.thumb ?? p.url)!} alt="Foto del elemento" loading="lazy" className="h-full w-full object-cover" />}
                  </a>
                  <figcaption className="mt-1 text-[11px] text-slate-500">{dmy(p.taken_at.slice(0, 10))}</figcaption>
                  <button aria-label="Enviar foto a la papelera" className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-red-600"
                    onClick={async () => { if (!confirm("¿Enviar la foto a la papelera?")) return; const { error } = await trashPhoto(p.id); if (error) toast(error.message, "error"); else { toast("Foto en la papelera"); load(); } }}><Trash2 size={14} /></button>
                </figure>
              ))}
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-xs text-slate-500"><Images size={18} /> Galería
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addPhoto(e.target.files); e.target.value = ""; }} /></label>
            </div>
          )
        )}

        {tab === "pagos" && (
          pays === null ? <div className="skeleton h-24" /> : (
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"><span className="text-slate-500">Abonado por este elemento</span><b className="tabular-nums">{eur(totalPaid)}</b></div>
              {pays.length === 0 ? <p className="text-sm text-slate-500">Sin pagos vinculados.</p> : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {pays.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 py-2">
                      <span className="w-20 shrink-0 tabular-nums text-slate-500">{dmy(p.payment_date)}</span>
                      <span className="min-w-0 flex-1 truncate">{p.concept_name}{p.visit_id && <Link href={`/visits/${p.visit_id}`} className="ml-1 text-xs text-brand-600 underline">visita</Link>}</span>
                      <b className="tabular-nums">{eur(Number(p.amount))}</b>
                      <span className="badge bg-slate-100 text-slate-600">{PAY_LABEL[p.status] ?? p.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        )}

        {tab === "historial" && (
          events === null ? <div className="skeleton h-24" /> : (
            <ol className="relative space-y-3 border-l border-slate-200 pl-4">
              {events.map((ev) => (
                <li key={ev.id} className="relative text-sm">
                  <span className="absolute -left-[1.32rem] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-600" />
                  <div className="text-xs tabular-nums text-slate-500">{dmy(ev.occurred_on)}{ev.visit_id && <> · <Link href={`/visits/${ev.visit_id}`} className="text-brand-600 underline">en visita</Link></>}</div>
                  <div>{describeEvent(ev)}</div>
                </li>
              ))}
              {events.length === 0 && <li className="text-sm text-slate-500">Sin historial.</li>}
            </ol>
          )
        )}
      </div>
    </Sheet>
  );
}
