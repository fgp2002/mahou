"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { VISIT_TYPES, type Visit } from "@/lib/types";
import { eur, type PaymentType } from "@/lib/payments";
import { NewTypeInline } from "./NewTypeInline";
import { PhotoTags, type PhotoTag } from "./PhotoTags";
import { madridDate } from "@/lib/domain/dates";
import type { Contact } from "./Contacts";
import type { PConcept } from "./Payments";

export interface PhotoView { id: string; url: string | null; caption: string | null; tagIds: string[] }

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

const NEW = "__new__";

export function VisitRunner({ visit, storeName, contacts, concepts, photos, types, suggestedNext, tags }: { visit: Visit; storeName: string; contacts: Contact[]; concepts: PConcept[]; photos: PhotoView[]; types: PaymentType[]; suggestedNext: string | null; tags: PhotoTag[] }) {
  const router = useRouter();
  const sb = supabaseBrowser();
  const running = visit.status === "in_progress";
  const [secs, setSecs] = useState(0);
  const [f, setF] = useState({ result: visit.result ?? "", notes: visit.notes ?? "", incidents: visit.incidents ?? "", items: visit.items_reviewed ?? "", contact: "" });
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [next, setNext] = useState(visit.next_visit_recommended ?? suggestedNext ?? "");
  const [extras, setExtras] = useState<{ typeId: string; amount: string }[]>([]);
  const [localTypes, setLocalTypes] = useState(types);
  const [allTags, setAllTags] = useState(tags);
  const [photoTagIds, setPhotoTagIds] = useState<Record<string, string[]>>(() => Object.fromEntries(photos.map((p) => [p.id, p.tagIds])));
  const [creatingFor, setCreatingFor] = useState<number | null>(null);
  const activeTypes = localTypes.filter((t) => t.active);
  const typeById = new Map(localTypes.map((t) => [t.id, t]));

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
      next_visit_recommended: next || null, contact_id: c?.id ?? null, contact_name_snapshot: c?.full_name ?? null, contact_role_snapshot: c?.role ?? null,
    }).eq("id", visit.id);
    if (error) { setBusy(false); return setErr(error.message); }
    const recs: Record<string, unknown>[] = concepts.filter((x) => checked[x.id] && x.default_amount != null).map((x) => ({
      store_id: visit.store_id, concept_id: x.id, concept: x.concept, concept_name: (x.payment_type_id && typeById.get(x.payment_type_id)?.name) || x.concept,
      payment_type_id: x.payment_type_id, visit_id: visit.id, amount: x.default_amount, payment_date: madridDate(), status: "comprobado", is_demo: x.is_demo,
    }));
    for (const ex of extras) {
      const t = typeById.get(ex.typeId);
      const amt = Number(ex.amount.replace(",", "."));
      if (!t || ex.amount.trim() === "" || !Number.isFinite(amt) || amt < 0) continue;
      let conceptId = concepts.find((c) => c.payment_type_id === t.id)?.id;
      if (!conceptId) {
        const ins = await sb.from("payment_concepts").insert({ store_id: visit.store_id, concept: t.code, payment_type_id: t.id, default_amount: amt }).select("id").single();
        conceptId = ins.data?.id;
      }
      recs.push({ store_id: visit.store_id, concept_id: conceptId ?? null, concept: t.code, concept_name: t.name, payment_type_id: t.id, visit_id: visit.id, amount: amt, payment_date: madridDate(), status: "comprobado", is_demo: false });
    }
    if (recs.length) {
      const pr = await sb.from("payment_records").insert(recs);
      if (pr.error) setErr("La visita se guardó, pero fallaron los pagos: " + pr.error.message);
    }
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

      <div className="card space-y-3">
        <h2 className="font-medium">Fotos</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {photos.map((p) => (
            <div key={p.id} className="relative">
              {p.url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.url} alt="Foto de la visita" loading="lazy" decoding="async" className="aspect-square w-full rounded-xl object-cover" /> : <div className="aspect-square rounded-lg bg-slate-100" />}
              <button aria-label="Eliminar foto" className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-red-600" onClick={() => removePhoto(p)}>✕</button>
              <PhotoTags photoId={p.id} allTags={allTags} selected={photoTagIds[p.id] ?? []}
                onTagCreated={(t) => setAllTags((a) => [...a, t])}
                onChange={(ids) => setPhotoTagIds((m) => ({ ...m, [p.id]: ids }))} />
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
        {running && (
          <div className="space-y-2">
            <label className="label">Cobros comprobados en esta visita</label>
            {concepts.map((c) => (
              <label key={c.id} className="flex min-h-11 items-center gap-3 text-sm">
                <input type="checkbox" className="h-5 w-5" checked={!!checked[c.id]} disabled={c.default_amount == null} onChange={(e) => setChecked({ ...checked, [c.id]: e.target.checked })} />
                {(c.payment_type_id && typeById.get(c.payment_type_id)?.name) || c.concept} {c.default_amount != null ? `· ${eur(c.default_amount)}` : "(sin importe)"} {c.is_demo && <span className="badge bg-slate-200 text-slate-700">DEMO</span>}
              </label>
            ))}
            {extras.map((ex, i) => (
              <div key={i} className="space-y-2">
                <div className="flex gap-2">
                  <select className="input" aria-label="Tipo de pago" value={creatingFor === i ? NEW : ex.typeId} onChange={(e) => {
                    if (e.target.value === NEW) return setCreatingFor(i);
                    const t = typeById.get(e.target.value);
                    setExtras(extras.map((x, j) => (j === i ? { typeId: e.target.value, amount: x.amount || (t?.default_amount != null ? String(t.default_amount) : "") } : x)));
                  }}>
                    <option value="">Elige tipo…</option>
                    {activeTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    <option value={NEW}>＋ Nuevo tipo de pago…</option>
                  </select>
                  <input className="input w-28" inputMode="decimal" placeholder="€" aria-label="Importe" value={ex.amount} onChange={(e) => setExtras(extras.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                  <button type="button" className="btn-secondary" aria-label="Quitar cobro" onClick={() => setExtras(extras.filter((_, j) => j !== i))}>✕</button>
                </div>
                {creatingFor === i && (
                  <NewTypeInline onCancel={() => setCreatingFor(null)} onCreated={(t) => {
                    setLocalTypes([...localTypes, t]);
                    setExtras(extras.map((x, j) => (j === i ? { typeId: t.id, amount: t.default_amount != null ? String(t.default_amount) : x.amount } : x)));
                    setCreatingFor(null);
                  }} />
                )}
              </div>
            ))}
            <button type="button" className="btn-secondary" onClick={() => setExtras([...extras, { typeId: "", amount: "" }])}>＋ Añadir otro cobro</button>
          </div>
        )}
        {running && (
          <div>
            <label className="label">Próxima visita recomendada{suggestedNext ? " (sugerida según la periodicidad)" : ""}</label>
            <input type="date" className="input" value={next} onChange={(e) => setNext(e.target.value)} />
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
