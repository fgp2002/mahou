"use client";
// Subida de fotos (visita, lineal, elemento, incidencia) con reducción de tamaño y respaldo sin conexión.
import { supabaseBrowser } from "./supabase/client";
import { resizeImage } from "./image";
import { kv } from "./offline/db";
import { enqueue, isNetworkError, saveBlob } from "./offline/outbox";

export type PhotoKind = "visita" | "lineal" | "elemento" | "incidencia";
export interface PhotoTarget { kind: PhotoKind; storeId: string; visitId?: string | null; equipmentId?: string | null; incidentId?: string | null }

const BUCKET = "visit-photos";

function rowFor(t: PhotoTarget, id: string, path: string, thumb: string | null, size: number) {
  const row: Record<string, unknown> = {
    id, kind: t.kind, store_id: t.storeId, visit_id: t.visitId ?? null, equipment_id: t.equipmentId ?? null,
    storage_path: path, thumb_path: thumb, mime_type: "image/jpeg", size_bytes: size, taken_at: new Date().toISOString(),
  };
  if (t.incidentId) row.incident_id = t.incidentId;
  return row;
}

/**
 * Sube una foto (1600 px) y su miniatura (400 px). Sin red, ambas se guardan en el móvil y se suben solas al volver la conexión.
 * Devuelve `queued: true` si quedó pendiente.
 */
export async function uploadPhoto(file: Blob, t: PhotoTarget): Promise<{ queued: boolean }> {
  const max = t.kind === "lineal" ? 2000 : 1600;
  const [full, small] = await Promise.all([resizeImage(file, max, 0.84), resizeImage(file, 400, 0.7)]);
  const sb = supabaseBrowser();
  let uid = (await kv.get<string>("uid")) ?? null;
  const id = crypto.randomUUID();
  const folder = t.visitId ?? `${t.kind}-${t.storeId}`;

  if (navigator.onLine) {
    try {
      const { data: u } = await sb.auth.getUser();
      uid = u.user?.id ?? uid;
      if (!uid) throw new Error("Sesión caducada: vuelve a entrar.");
      const base = `${uid}/${folder}/${id}`;
      const [up, upT] = await Promise.all([
        sb.storage.from(BUCKET).upload(`${base}.jpg`, full, { contentType: "image/jpeg", cacheControl: "31536000" }),
        sb.storage.from(BUCKET).upload(`${base}.thumb.jpg`, small, { contentType: "image/jpeg", cacheControl: "31536000" }),
      ]);
      if (up.error) throw up.error;
      const ins = await sb.from("visit_photos").insert(rowFor(t, id, `${base}.jpg`, upT.error ? null : `${base}.thumb.jpg`, full.size));
      if (ins.error) { await sb.storage.from(BUCKET).remove([`${base}.jpg`, `${base}.thumb.jpg`]); throw ins.error; }
      return { queued: false };
    } catch (e) {
      if (!isNetworkError(e)) throw e;
    }
  }
  if (!uid) throw new Error("Abre la app una vez con conexión para poder hacer fotos sin red.");
  const base = `${uid}/${folder}/${id}`;
  await saveBlob(`${base}.jpg`, full);
  await saveBlob(`${base}.thumb.jpg`, small);
  await enqueue({ kind: "upload", bucket: BUCKET, path: `${base}.jpg`, blobKey: `${base}.jpg`, contentType: "image/jpeg", label: "Foto" });
  await enqueue({ kind: "upload", bucket: BUCKET, path: `${base}.thumb.jpg`, blobKey: `${base}.thumb.jpg`, contentType: "image/jpeg", label: "Miniatura" });
  await enqueue({ kind: "insert", table: "visit_photos", label: "Registro de foto", values: rowFor(t, id, `${base}.jpg`, `${base}.thumb.jpg`, full.size) });
  return { queued: true };
}

/** Envía una foto a la papelera (recuperable). El archivo no se borra hasta vaciar la papelera. */
export async function trashPhoto(id: string) {
  return supabaseBrowser().from("visit_photos").update({ deleted_at: new Date().toISOString() }).eq("id", id);
}
