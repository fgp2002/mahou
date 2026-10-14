"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { CONCEPTS, VISIT_TYPES, type Visit } from "@/lib/types";
import { madridDate } from "@/lib/domain/dates";
import type { Contact } from "./Contacts";
import type { PConcept } from "./Payments";

export interface PhotoView { id: string; url: string | null; caption: string | null }

async function resize(file: File, max = 1600): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("No se pudo procesar la imagen"))), "image/jpeg", 0.82));
}

const fmt = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export function VisitRunner({ visit, storeName, contacts, concepts, photos }: { visit: Visit; storeName: string; contacts: Contact[]; concepts: PConcept[]; photos: PhotoView[] }) {
  const router = useRouter();
  const sb = supabaseBrowser();
  const running = visit.status === "in_progress";
  const [secs, setSecs] = useState(0);
  const [f, setF] = useState({ result: visit.result ?? "", notes: visit.notes ?? "", incidents: visit.incidents ?? "", items: visit.items_reviewed ?? "", contact: "" });
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
      const { data: u } = await sb.auth.getUser();
      if (!u.user) throw new Error("Sesión caducada");
      for (const file of Array.from(files)) {
        const blob = await resize(file);
        const path = `${u.user.id}/${visit.id}/${crypto.randomUUID()}.jpg`;
        const up = await sb.storage.from("visit-photos").upload(path, blob, { contentType: "image/jpeg" });
        if (up.error) throw up.error;
        const ins = await sb.from("visit_photos").insert({ visit_id: visit.id, storage_path: path, mime_type: "image/jpeg", size_bytes: blob.size });
        if (ins.error) throw ins.error;
      }
      router.refresh();
    } catch (e) {
      setErr("No se pudo subir la foto: " + (e as Error).message);
    }
    setBusy(false);
  }

  async function removePhoto(p: PhotoView) {
    if (!confirm("¿Eliminar esta foto?")) return;
    const { data } = await sb.from("visit_photos").select("storage_path").eq("id", p.id).single();
    if (data) await sb.storage.from("visit-photos").remove([data.storage_path]);
    await sb.from("visit_photos").delete().eq("id", p.id);
    router.refresh();
  }

  async function finish() {
    setBusy(true);
    setErr(null);
    const started = visit.started_at ? new Date(visit.started_at).getTime() : Date.now();
    const minutes = Math.max(0, Math.round((Date.now() - started) / 60000));
    const c = contacts.find((x) => x.id === f.contact);
    const { error } = await sb.from("visits").update({
      status: "completed", ended_at: new Date().toISOString(), duration_minutes: minutes,
      result: f.result || null, notes: f.notes || null, incidents: f.incidents || null, items_reviewed: f.items || null,
      contact_id: c?.id ?? null, contact_name_snapshot: c?.full_name ?? null, contact_role_snapshot: c?.role ?? null,
    }).eq("id", visit.id);
    if (error) { setBusy(false); return setErr(error.message); }
    const recs = concepts.filter((x) => checked[x.id] && x.default_amount != null).map((x) => ({
      store_id: visit.store_id, concept_id: x.id, concept: x.concept, visit_id: visit.id, amount: x.default_amount, payment_date: madridDate(), status: "comprobado", is_demo: x.is_demo,
    }));
    if (recs.length) await sb.from("payment_records").insert(recs);
    setBusy(false);
    router.refresh();
  }

  async function cancel() {
    if (!confirm("¿Cancelar esta visita? No contará para el cumplimiento.")) return;
    await sb.from("visits").update({ status: "cancelled", ended_at: new Date().toISOString() }).eq("id", visit.id);
    router.replace("/visits");
    router.refresh();
  }

  async function saveEdits() {
    setBusy(true);
    const { error } = await sb.from("visits").update({ result: f.result || null, notes: f.notes || null, incidents: f.incidents || null, items_reviewed: f.items || null }).eq("id", visit.id);
    setBusy(false);
    setErr(error?.message ?? null);
    router.refresh();
  }

  return (
    <div className="max-w-2xl space-y-4">
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

      <div className="card space-y-3">
        <h2 className="font-medium">Fotos</h2>
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <div key={p.id} className="relative">
              {p.url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.url} alt="" className="aspect-square w-full rounded-lg object-cover" /> : <div className="aspect-square rounded-lg bg-slate-100" />}
              <button className="absolute right-1 top-1 rounded bg-white/90 px-1.5 text-xs text-red-600" onClick={() => removePhoto(p)}>✕</button>
            </div>
          ))}
        </div>
        <label className="btn-secondary cursor-pointer">
          Hacer / añadir foto
          <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => upload(e.target.files)} disabled={busy} />
        </label>
      </div>

      <div className="card space-y-3">
        <h2 className="font-medium">Datos de la visita</h2>
        {running && contacts.length > 0 && (
          <div>
            <label className="label">Persona que te atendió</label>
            <select className="input" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })}>
              <option value="">— ninguna —</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.full_name ?? "(sin nombre)"} {c.role ? `· ${c.role}` : ""}</option>)}
            </select>
          </div>
        )}
        {([["result", "Resultado"], ["items", "Productos / elementos revisados"], ["incidents", "Incidencias"], ["notes", "Notas"]] as const).map(([k, l]) => (
          <div key={k}><label className="label">{l}</label><textarea className="input" rows={2} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
        ))}
        {running && concepts.length > 0 && (
          <div>
            <label className="label">Pagos comprobados en esta visita</label>
            {concepts.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!checked[c.id]} disabled={c.default_amount == null} onChange={(e) => setChecked({ ...checked, [c.id]: e.target.checked })} />
                {CONCEPTS[c.concept]} {c.default_amount != null ? `· ${c.default_amount} €` : "(sin importe)"} {c.is_demo && <span className="badge bg-purple-100 text-purple-700">DEMO</span>}
              </label>
            ))}
          </div>
        )}
        {err && <p className="text-sm text-red-600">{err}</p>}
        {running ? (
          <div className="flex gap-2">
            <button className="btn flex-1" onClick={finish} disabled={busy}>Finalizar visita</button>
            <button className="btn-secondary" onClick={cancel}>Cancelar</button>
          </div>
        ) : (
          <button className="btn" onClick={saveEdits} disabled={busy}>Guardar cambios</button>
        )}
      </div>
    </div>
  );
}
