"use client";
// Visitas sin conexión: todo se guarda en el móvil y se envía a Supabase al volver la red.
import { madridDate } from "../domain/dates";
import { resizeImage } from "../image";
import { kv } from "./db";
import { enqueue, saveBlob } from "./outbox";

export interface LocalVisit { id: string; storeId: string; storeName: string; startedAt: string; photos: number; payments: { name: string; amount: number }[] }
export interface CachedStore { id: string; name: string; town: string | null; lat: number | null; lng: number | null }
export interface CachedType { id: string; code: string; name: string; default_amount: number | null; active: boolean }
export interface CachedBrand { id: string; name: string }

const uuid = () => crypto.randomUUID();

export async function startOfflineVisit(o: { storeId: string; storeName?: string; plannedVisitId?: string | null; routeStopId?: string | null; minutes?: number }): Promise<string> {
  const startedAt = new Date().toISOString();
  const id = o.plannedVisitId ?? uuid();
  if (o.plannedVisitId) {
    await enqueue({ kind: "update", table: "visits", id, values: { status: "in_progress", started_at: startedAt, visit_date: madridDate() }, label: "Inicio de visita" });
  } else {
    await enqueue({
      kind: "insert", table: "visits", label: "Nueva visita",
      values: { id, store_id: o.storeId, route_stop_id: o.routeStopId ?? null, status: "in_progress", started_at: startedAt, visit_date: madridDate(), visit_type: "ordinaria", planned_minutes: o.minutes ?? 45 },
    });
  }
  let name = o.storeName;
  if (!name) name = ((await kv.get<CachedStore[]>("stores")) ?? []).find((s) => s.id === o.storeId)?.name ?? "Tienda";
  await kv.set(`visit:${id}`, { id, storeId: o.storeId, storeName: name, startedAt, photos: 0, payments: [] } satisfies LocalVisit);
  return id;
}

/** Guarda la foto (y su miniatura) en el móvil y deja en cola la subida y su registro. */
export async function savePhotoOffline(visitId: string, file: Blob) {
  const uid = await kv.get<string>("uid");
  if (!uid) throw new Error("Abre la app una vez con conexión para poder hacer fotos sin red.");
  const [full, thumb] = await Promise.all([resizeImage(file), resizeImage(file, 400, 0.7)]);
  const base = `${uid}/${visitId}/${uuid()}`;
  await saveBlob(`${base}.jpg`, full);
  await saveBlob(`${base}.thumb.jpg`, thumb);
  await enqueue({ kind: "upload", bucket: "visit-photos", path: `${base}.jpg`, blobKey: `${base}.jpg`, contentType: "image/jpeg", label: "Foto" });
  await enqueue({ kind: "upload", bucket: "visit-photos", path: `${base}.thumb.jpg`, blobKey: `${base}.thumb.jpg`, contentType: "image/jpeg", label: "Miniatura" });
  await enqueue({ kind: "insert", table: "visit_photos", label: "Registro de foto", values: { id: uuid(), visit_id: visitId, storage_path: `${base}.jpg`, thumb_path: `${base}.thumb.jpg`, mime_type: "image/jpeg", size_bytes: full.size } });
}

export async function addPaymentOffline(v: { visitId: string; storeId: string; type: CachedType; amount: number; brand?: CachedBrand | null }) {
  await enqueue({
    kind: "insert", table: "payment_records", label: `Pago ${v.type.name}`,
    values: {
      id: uuid(), store_id: v.storeId, visit_id: v.visitId, concept_id: null, concept: v.type.code, concept_name: v.type.name, payment_type_id: v.type.id,
      amount: v.amount, payment_date: madridDate(), status: "comprobado", is_demo: false, brand_id: v.brand?.id ?? null, brand_name: v.brand?.name ?? null,
    },
  });
}

export async function finishOfflineVisit(visitId: string, startedAt: string, f: { result?: string; notes?: string; incidents?: string }) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000));
  await enqueue({
    kind: "update", table: "visits", id: visitId, label: "Fin de visita",
    values: { status: "completed", ended_at: new Date().toISOString(), duration_minutes: minutes, result: f.result || null, notes: f.notes || null, incidents: f.incidents || null },
  });
}
