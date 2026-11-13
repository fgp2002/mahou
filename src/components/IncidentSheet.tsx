"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { Camera, Trash2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { madridDate } from "@/lib/domain/dates";
import { dmy } from "@/lib/format";
import { writeOrQueue } from "@/lib/offline/outbox";
import { uploadPhoto, trashPhoto } from "@/lib/photos";
import { equipmentTitle, type Equipment } from "@/lib/equipment";
import { daysOpen, INCIDENT_STATUS_LABEL, INCIDENT_STATUS_STYLE, INCIDENT_TYPE_LABEL, incidentStatusPatch, isOpen, PRIORITY_LABEL, PRIORITY_STYLE, type Incident, type IncidentStatus, type IncidentType, type Priority } from "@/lib/incidents";
import type { PaymentType } from "@/lib/payments";
import { Sheet } from "./Sheet";
import { toast } from "./Toast";

export function IncidentBadges({ i }: { i: Pick<Incident, "status" | "priority"> }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      <span className={clsx("badge font-semibold", INCIDENT_STATUS_STYLE[i.status])}>{INCIDENT_STATUS_LABEL[i.status]}</span>
      {isOpen(i.status) && <span className={clsx("badge font-semibold", PRIORITY_STYLE[i.priority])}>Prioridad {PRIORITY_LABEL[i.priority].toLowerCase()}</span>}
    </span>
  );
}

interface Photo { id: string; thumb: string | null; url: string | null }

/** Alta o seguimiento de una incidencia: tipo, prioridad, estado, foto y resolución. Funciona sin conexión. */
export function IncidentSheet({ incident, storeId, visitId, equipment = [], types = [], onClose, onSaved }: {
  incident: Incident | null; storeId: string; visitId?: string | null; equipment?: Equipment[]; types?: PaymentType[]; onClose: () => void; onSaved?: (id: string) => void;
}) {
  const router = useRouter();
  const sb = supabaseBrowser();
  const today = madridDate();
  const i = incident;
  const [id] = useState(i?.id ?? crypto.randomUUID());
  const [f, setF] = useState({
    type: (i?.type ?? "falta_producto") as IncidentType, description: i?.description ?? "", priority: (i?.priority ?? "media") as Priority,
    status: (i?.status ?? "abierta") as IncidentStatus, equipmentId: i?.equipment_id ?? "", opened: i?.opened_on ?? today, resolvedOn: i?.resolved_on ?? today, resolution: i?.resolution ?? "",
  });
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(!!i);

  async function loadPhotos() {
    const { data } = await sb.from("visit_photos").select("id,storage_path,thumb_path").eq("incident_id", id).is("deleted_at", null).order("taken_at");
    const rows = (data ?? []) as { id: string; storage_path: string; thumb_path: string | null }[];
    const paths = rows.flatMap((p) => [p.storage_path, p.thumb_path].filter(Boolean) as string[]);
    const { data: signed } = paths.length ? await sb.storage.from("visit-photos").createSignedUrls(paths, 3600) : { data: [] };
    const url = new Map<string, string>((signed ?? []).map((s: { path: string | null; signedUrl: string }) => [s.path ?? "", s.signedUrl]));
    setPhotos(rows.map((p) => ({ id: p.id, url: url.get(p.storage_path) ?? null, thumb: p.thumb_path ? url.get(p.thumb_path) ?? null : null })));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (i) loadPhotos(); }, [i?.id]);

  async function save(close = true) {
    if (!f.description.trim() && f.type === "otros") return toast("Describe la incidencia", "error");
    const st = incidentStatusPatch(f.status, today, f.opened, isOpen(f.status) ? null : f.resolvedOn);
    const values = {
      store_id: storeId, type: f.type, description: f.description.trim() || null, priority: f.priority, equipment_id: f.equipmentId || null,
      opened_on: f.opened, ...st, resolution: isOpen(f.status) ? null : f.resolution.trim() || null,
    };
    setBusy(true);
    const r = saved
      ? await writeOrQueue({ kind: "update", table: "incidents", id, values, label: "Incidencia" })
      : await writeOrQueue({ kind: "insert", table: "incidents", values: { id, visit_id: visitId ?? null, ...values }, label: "Nueva incidencia" });
    setBusy(false);
    if (r.error) { toast(r.error, "error"); return false; }
    setSaved(true);
    toast(r.queued ? "Incidencia guardada en el móvil" : saved ? "Incidencia actualizada" : "Incidencia registrada");
    onSaved?.(id);
    router.refresh();
    if (close) onClose();
    return true;
  }

  async function addPhoto(files: FileList | null) {
    if (!files?.length) return;
    if (!saved && !(await save(false))) return;
    setBusy(true);
    try {
      let queued = false;
      for (const file of Array.from(files)) queued = (await uploadPhoto(file, { kind: "incidencia", storeId, visitId: visitId ?? i?.visit_id ?? null, incidentId: id, equipmentId: f.equipmentId || null })).queued || queued;
      toast(queued ? "Foto guardada en el móvil" : "Foto añadida");
      if (!queued) loadPhotos();
    } catch (e) { toast((e as Error).message, "error"); }
    setBusy(false);
  }

  async function trash() {
    if (!i || !confirm("¿Enviar la incidencia a la papelera?")) return;
    const { error } = await sb.from("incidents").update({ deleted_at: new Date().toISOString() }).eq("id", i.id);
    if (error) return toast(error.message, "error");
    toast("Incidencia en la papelera");
    router.refresh();
    onClose();
  }

  const typeName = (e: Equipment) => types.find((t) => t.id === e.type_id)?.name ?? "Elemento";

  return (
    <Sheet title={i ? INCIDENT_TYPE_LABEL[i.type] : "Nueva incidencia"} subtitle={i ? <span className="flex flex-wrap items-center gap-2"><IncidentBadges i={i} /><span>desde {dmy(i.opened_on)} · {daysOpen(i, today)} d</span></span> : undefined} onClose={onClose}
      footer={<div className="flex gap-2">{i && <button className="btn-secondary !text-red-600" aria-label="Enviar a la papelera" onClick={trash}><Trash2 size={16} /></button>}<button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn flex-1" disabled={busy} onClick={() => save()}>{busy ? "Guardando…" : "Guardar"}</button></div>}>
      <div className="space-y-3">
        <div><label className="label">Tipo</label>
          <div className="flex flex-wrap gap-1.5">{(Object.keys(INCIDENT_TYPE_LABEL) as IncidentType[]).map((t) => (
            <button key={t} type="button" onClick={() => setF({ ...f, type: t })} className={clsx("tap min-h-10 rounded-full border px-3 text-sm", f.type === t ? "border-brand-600 bg-brand-600 font-semibold text-[rgb(var(--on-accent))]" : "border-slate-300 text-slate-700")}>{INCIDENT_TYPE_LABEL[t]}</button>
          ))}</div></div>
        <div><label className="label" htmlFor="inc-desc">Descripción</label><textarea id="inc-desc" className="input" rows={3} placeholder="Qué pasa y qué hace falta" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Prioridad</label>
            <div className="grid grid-cols-3 gap-1">{(["baja", "media", "alta"] as Priority[]).map((p) => <button key={p} type="button" onClick={() => setF({ ...f, priority: p })} className={clsx("tap min-h-10 rounded-lg border text-sm", f.priority === p ? "border-brand-600 bg-brand-50 font-semibold text-brand-700" : "border-slate-200")}>{PRIORITY_LABEL[p]}</button>)}</div></div>
          <div><label className="label">Abierta el</label><input type="date" className="input" value={f.opened} onChange={(e) => setF({ ...f, opened: e.target.value })} /></div>
        </div>
        {equipment.filter((e) => e.status !== "retirado" || e.id === f.equipmentId).length > 0 && (
          <div><label className="label">Elemento afectado</label>
            <select className="input" value={f.equipmentId} onChange={(e) => setF({ ...f, equipmentId: e.target.value })}>
              <option value="">Ninguno</option>
              {equipment.filter((e) => e.status !== "retirado" || e.id === f.equipmentId).map((e) => <option key={e.id} value={e.id}>{equipmentTitle(e, typeName(e))} ({e.code})</option>)}
            </select></div>
        )}
        <div><label className="label">Estado</label>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">{(Object.keys(INCIDENT_STATUS_LABEL) as IncidentStatus[]).map((s) => <button key={s} type="button" onClick={() => setF({ ...f, status: s })} className={clsx("tap min-h-11 rounded-lg border text-sm", f.status === s ? "border-brand-600 bg-brand-50 font-semibold text-brand-700" : "border-slate-200")}>{INCIDENT_STATUS_LABEL[s]}</button>)}</div></div>
        {!isOpen(f.status) && (
          <div className="fade-in grid grid-cols-2 gap-3">
            <div><label className="label">Fecha de cierre</label><input type="date" className="input" value={f.resolvedOn} onChange={(e) => setF({ ...f, resolvedOn: e.target.value })} /></div>
            <div className="col-span-2"><label className="label">Cómo se resolvió</label><textarea className="input" rows={2} value={f.resolution} onChange={(e) => setF({ ...f, resolution: e.target.value })} /></div>
          </div>
        )}
        <div>
          <div className="label">Fotos</div>
          <div className="grid grid-cols-4 gap-2">
            {photos.map((p) => (
              <div key={p.id} className="relative aspect-square overflow-hidden rounded-lg bg-slate-100">
                <a href={p.url ?? undefined} target="_blank" rel="noreferrer">{(p.thumb ?? p.url) && /* eslint-disable-next-line @next/next/no-img-element */ <img src={(p.thumb ?? p.url)!} alt="Foto de la incidencia" className="h-full w-full object-cover" />}</a>
                <button aria-label="Enviar foto a la papelera" className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-red-600" onClick={async () => { await trashPhoto(p.id); loadPhotos(); }}><Trash2 size={13} /></button>
              </div>
            ))}
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-xs text-slate-500"><Camera size={18} /> Foto
              <input type="file" accept="image/*" capture="environment" className="hidden" disabled={busy} onChange={(e) => { addPhoto(e.target.files); e.target.value = ""; }} /></label>
          </div>
        </div>
        {i?.visit_id && <Link href={`/visits/${i.visit_id}`} className="link text-sm">Ver la visita en la que se abrió</Link>}
      </div>
    </Sheet>
  );
}
