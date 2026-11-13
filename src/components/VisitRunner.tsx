"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { VISIT_TYPES, type Visit } from "@/lib/types";
import { type PaymentType } from "@/lib/payments";
import { enqueue, isNetworkError } from "@/lib/offline/outbox";
import { uploadPhoto, trashPhoto } from "@/lib/photos";
import type { Equipment } from "@/lib/equipment";
import { VisitEquipment } from "./VisitEquipment";
import { toast } from "./Toast";
import { VisitPayments, type VisitPayment } from "./VisitPayments";
import { VisitItems, type VisitItem } from "./VisitItems";
import { Pencil } from "lucide-react";
import { PhotoTags, type PhotoTag } from "./PhotoTags";
import type { Contact } from "./Contacts";

export interface PhotoView { id: string; url: string | null; thumb: string | null; caption: string | null; tagIds: string[] }

const fmt = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

const STEPS = ["Fotos", "Elementos y pagos", "Notas"];

export function VisitRunner({ visit, storeName, contacts, equipment, photos, types, suggestedNext, tags, payments = [], items = [] }: { visit: Visit; storeName: string; contacts: Contact[]; equipment: Equipment[]; photos: PhotoView[]; types: PaymentType[]; suggestedNext: string | null; tags: PhotoTag[]; payments?: VisitPayment[]; items?: VisitItem[] }) {
  const router = useRouter();
  const sb = supabaseBrowser();
  const running = visit.status === "in_progress";
  const [secs, setSecs] = useState(0);
  const [f, setF] = useState({ result: visit.result ?? "", notes: visit.notes ?? "", incidents: visit.incidents ?? "", items: visit.items_reviewed ?? "", contact: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [next, setNext] = useState(visit.next_visit_recommended ?? suggestedNext ?? "");
  const localTypes = types;
  const [step, setStep] = useState(0);
  const [editing, setEditing] = useState(false);
  const [meta, setMeta] = useState({ date: visit.visit_date, minutes: visit.duration_minutes != null ? String(visit.duration_minutes) : "" });
  const vis = (n: number) => (running ? step === n : editing);
  const [allTags, setAllTags] = useState(tags);
  const [photoTagIds, setPhotoTagIds] = useState<Record<string, string[]>>(() => Object.fromEntries(photos.map((p) => [p.id, p.tagIds])));

  useEffect(() => {
    if (!running || !visit.started_at) return;
    const t0 = new Date(visit.started_at).getTime();
    const tick = () => setSecs(Math.max(0, Math.floor((Date.now() - t0) / 1000)));
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, [running, visit.started_at]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setErr(null);
    try {
      let queued = 0;
      // Foto a 1600 px y miniatura de 400 px. Sin red se guardan en el móvil y se suben solas al volver la conexión.
      for (const file of Array.from(files)) if ((await uploadPhoto(file, { kind: "visita", storeId: visit.store_id, visitId: visit.id })).queued) queued++;
      if (queued) toast(`Sin conexión: ${queued} foto${queued === 1 ? "" : "s"} guardada${queued === 1 ? "" : "s"} en el móvil`);
      router.refresh();
    } catch (e) {
      setErr("No se pudo subir la foto: " + (e as Error).message);
    }
    setBusy(false);
  }

  async function removePhoto(p: PhotoView) {
    if (!confirm("¿Enviar esta foto a la papelera? Podrás recuperarla desde Ajustes → Papelera.")) return;
    const { error } = await trashPhoto(p.id);
    if (error) return setErr(error.message);
    router.refresh();
  }

  async function finish() {
    setBusy(true);
    setErr(null);
    const started = visit.started_at ? new Date(visit.started_at).getTime() : Date.now();
    const minutes = Math.max(0, Math.round((Date.now() - started) / 60000));
    const c = contacts.find((x) => x.id === f.contact);
    const finishValues = {
      status: "completed", ended_at: new Date().toISOString(), duration_minutes: minutes,
      result: f.result || null, notes: f.notes || null, incidents: f.incidents || null, items_reviewed: f.items || null,
      next_visit_recommended: next || null, contact_id: c?.id ?? null, contact_name_snapshot: c?.full_name ?? null, contact_role_snapshot: c?.role ?? null,
    };
    const { error } = navigator.onLine ? await sb.from("visits").update(finishValues).eq("id", visit.id) : { error: new Error("offline") };
    const offline = !!error && isNetworkError(error);
    if (error && !offline) { setBusy(false); return setErr(error.message); }
    if (offline) await enqueue({ kind: "update", table: "visits", id: visit.id, values: finishValues, label: "Fin de visita" });
    setBusy(false);
    if (offline) {
      toast("Sin conexión: visita guardada en el móvil. Se enviará al volver la red.");
      router.push("/");
      return;
    }
    toast("Visita guardada");
    router.refresh();
  }

  async function cancel() {
    if (!confirm("¿Cancelar esta visita? No contará para el cumplimiento.")) return;
    await sb.from("visits").update({ status: "cancelled", ended_at: new Date().toISOString() }).eq("id", visit.id);
    router.replace("/visits");
    router.refresh();
  }

  async function saveEdits() {
    const mins = meta.minutes.trim() === "" ? null : Number(meta.minutes);
    if (mins != null && (!Number.isInteger(mins) || mins < 0 || mins > 1440)) return setErr("La duración debe ser un número de minutos.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date)) return setErr("La fecha no es válida.");
    setBusy(true);
    const { error } = await sb.from("visits").update({
      result: f.result || null, notes: f.notes || null, incidents: f.incidents || null, items_reviewed: f.items || null,
      visit_date: meta.date, duration_minutes: mins,
    }).eq("id", visit.id);
    setBusy(false);
    setErr(error?.message ?? null);
    if (error) return toast("No se pudo guardar", "error");
    toast("Visita actualizada");
    setEditing(false);
    router.refresh();
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="card text-center">
        <div className="text-sm text-slate-500">{storeName} · {VISIT_TYPES[visit.visit_type]}</div>
        {running ? (
          <>
            <div className="my-2 font-mono text-4xl">{fmt(secs)}</div>
            <div className="text-xs text-slate-400">Previsto: {visit.planned_minutes} min</div>
          </>
        ) : (
          <div className="my-2 text-2xl font-semibold">{visit.status === "completed" ? `${visit.duration_minutes ?? "?"} min` : visit.status}</div>
        )}
        <div className="text-xs text-slate-400">{visit.visit_date}{visit.is_manual ? " · registro manual" : ""}</div>
      </div>

      {!running && !editing && (
        <>
          <div className="card space-y-4 fade-in">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">Resumen de la visita</h2>
              <button className="btn-secondary" onClick={() => setEditing(true)}><Pencil size={15} /> Editar visita</button>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div><dt className="text-xs text-slate-500">Fecha</dt><dd className="font-semibold">{visit.visit_date.slice(8, 10)}/{visit.visit_date.slice(5, 7)}/{visit.visit_date.slice(0, 4)}</dd></div>
              <div><dt className="text-xs text-slate-500">Duración</dt><dd className="font-semibold">{visit.duration_minutes != null ? `${visit.duration_minutes} min` : "—"}</dd></div>
              <div><dt className="text-xs text-slate-500">Atendió</dt><dd className="font-semibold">{visit.contact_name_snapshot ?? "—"}</dd></div>
            </dl>
            {([["Resultado", visit.result], ["Productos / elementos revisados", visit.items_reviewed], ["Incidencias", visit.incidents], ["Notas", visit.notes]] as const).filter(([, v]) => v).map(([l, v]) => (
              <div key={l}><div className="text-xs font-semibold text-slate-500">{l}</div><p className="whitespace-pre-line text-sm">{v}</p></div>
            ))}
            {!visit.result && !visit.items_reviewed && !visit.incidents && !visit.notes && <p className="text-sm text-slate-500">Sin notas.</p>}
          </div>
          <VisitPayments visitId={visit.id} storeId={visit.store_id} payments={payments} types={localTypes} editable={false} />
          <VisitItems visitId={visit.id} initial={items} editable={false} />
          <div className="card space-y-3">
            <h2 className="font-semibold">Fotos ({photos.length})</h2>
            {photos.length === 0 ? <p className="text-sm text-slate-500">Sin fotos.</p> : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {photos.map((p) => (
                  <div key={p.id}>
                    {p.thumb ?? p.url ? /* eslint-disable-next-line @next/next/no-img-element */ <a href={p.url ?? undefined} target="_blank" rel="noreferrer"><img src={(p.thumb ?? p.url)!} alt="Foto de la visita" loading="lazy" decoding="async" className="aspect-square w-full rounded-lg object-cover" /></a> : <div className="aspect-square rounded-lg bg-slate-100" />}
                    <div className="mt-1 truncate text-[11px] text-slate-500">{(photoTagIds[p.id] ?? []).map((id) => allTags.find((t) => t.id === id)?.name).filter(Boolean).join(" · ")}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {editing && (
        <div className="card space-y-3 fade-in">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Editando visita</h2>
            <button className="btn-secondary" onClick={() => setEditing(false)} disabled={busy}>Cancelar</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label" htmlFor="ev-date">Fecha</label><input id="ev-date" type="date" className="input" value={meta.date} onChange={(e) => setMeta({ ...meta, date: e.target.value })} /></div>
            <div><label className="label" htmlFor="ev-min">Duración (min)</label><input id="ev-min" className="input" inputMode="numeric" value={meta.minutes} onChange={(e) => setMeta({ ...meta, minutes: e.target.value.replace(/\D/g, "") })} /></div>
          </div>
        </div>
      )}
      {editing && <VisitPayments visitId={visit.id} storeId={visit.store_id} payments={payments} types={localTypes} editable />}
      {editing && <VisitItems visitId={visit.id} initial={items} editable />}
      {running && step === 2 && <VisitItems visitId={visit.id} initial={items} editable />}

      {running && (
        <ol className="flex items-center gap-2" aria-label="Pasos de la visita">
          {STEPS.map((l, i) => (
            <li key={l} className="flex flex-1 items-center gap-2">
              <button type="button" onClick={() => setStep(i)} className={`tap flex h-8 min-w-0 flex-1 items-center justify-center rounded-full px-3 text-xs font-semibold ${i === step ? "bg-brand-600 text-[rgb(var(--on-accent))]" : i < step ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                {i < step ? "✓ " : `${i + 1}. `}{l}
              </button>
            </li>
          ))}
        </ol>
      )}

      {vis(0) && (
      <div className="card space-y-3 fade-in">
        <h2 className="font-medium">Fotos</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {photos.map((p) => (
            <div key={p.id} className="relative">
              {p.thumb ?? p.url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={(p.thumb ?? p.url)!} alt="Foto de la visita" loading="lazy" decoding="async" className="aspect-square w-full rounded-xl object-cover" /> : <div className="aspect-square rounded-lg bg-slate-100" />}
              <button aria-label="Eliminar foto" className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-red-600" onClick={() => removePhoto(p)}>✕</button>
              <PhotoTags photoId={p.id} allTags={allTags} selected={photoTagIds[p.id] ?? []}
                onTagCreated={(t) => setAllTags((a) => [...a, t])}
                onChange={(ids) => setPhotoTagIds((m) => ({ ...m, [p.id]: ids }))} />
            </div>
          ))}
        </div>
        <label className="btn-secondary cursor-pointer">
          Hacer foto
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => upload(e.target.files)} disabled={busy} />
        </label>
        <label className="btn-secondary cursor-pointer">
          Elegir de la galería
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => upload(e.target.files)} disabled={busy} />
        </label>
        {err && <p className="text-sm text-red-600">{err}</p>}
        {running && <button type="button" className="btn w-full" onClick={() => setStep(1)}>Siguiente: Pagos</button>}
        {running && <button type="button" className="w-full py-1 text-sm text-slate-500 underline" onClick={cancel}>Cancelar visita</button>}
      </div>
      )}

      {(running ? step > 0 : editing) && (
      <div className="card space-y-3 fade-in">
        <h2 className="font-medium">{running ? STEPS[step] : "Datos de la visita"}</h2>
        {vis(2) && running && contacts.length > 0 && (
          <div>
            <label className="label">Persona que te atendió</label>
            <select className="input" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })}>
              <option value="">— ninguna —</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.full_name ?? "(sin nombre)"} {c.role ? `· ${c.role}` : ""}</option>)}
            </select>
          </div>
        )}
        {vis(2) && ([["result", "Resultado"], ["items", "Productos / elementos revisados"], ["incidents", "Incidencias"], ["notes", "Notas"]] as const).map(([k, l]) => (
          <div key={k}><label className="label">{l}</label><textarea className="input" rows={2} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
        ))}
        {running && step === 1 && <VisitEquipment visitId={visit.id} storeId={visit.store_id} items={equipment} types={types} />}
        {running && step === 1 && (
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => setStep(0)}>Atrás</button>
            <button type="button" className="btn flex-1" onClick={() => setStep(2)}>Siguiente: Notas</button>
          </div>
        )}
        {running && step === 2 && (
          <div>
            <label className="label">Próxima visita recomendada{suggestedNext ? " (sugerida según la periodicidad)" : ""}</label>
            <input type="date" className="input" value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
        )}
        {err && (running ? step > 0 : editing) && <p className="text-sm text-red-600">{err}</p>}
        {running && step === 2 ? (
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setStep(1)}>Atrás</button>
            <button className="btn flex-1" onClick={finish} disabled={busy}>Finalizar visita</button>
            <button className="btn-secondary" onClick={cancel}>Cancelar</button>
          </div>
        ) : null}
      </div>
      )}

      {editing && (
        <div className="sticky bottom-[calc(6rem+env(safe-area-inset-bottom))] z-30 flex gap-2 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-pop backdrop-blur md:bottom-4">
          <button className="btn-secondary" onClick={() => setEditing(false)} disabled={busy}>Cancelar</button>
          <button className="btn flex-1" onClick={saveEdits} disabled={busy}>{busy ? "Guardando…" : "Guardar cambios"}</button>
        </div>
      )}
    </div>
  );
}
