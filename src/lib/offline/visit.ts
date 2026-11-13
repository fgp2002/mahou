"use client";
// Visitas sin conexión: todo se guarda en el móvil y se envía a Supabase al volver la red.
import { madridDate } from "../domain/dates";
import { resizeImage } from "../image";
import { kv } from "./db";
import { enqueue, saveBlob } from "./outbox";
import { paymentValues } from "../paymentRecord";

export interface LocalVisit { id: string; storeId: string; storeName: string; startedAt: string; photos: number; payments: { name: string; amount: number }[] }
export interface CachedStore { id: string; name: string; town: string | null; lat: number | null; lng: number | null }
export interface CachedType { id: string; code: string; name: string; default_amount: number | null; active: boolean; tracks_inventory?: boolean }
export interface CachedEquipment { id: string; store_id: string; type_id: string; code: string | null; name: string | null; brand_id: string | null; brand_name: string | null; quantity: number; location: string | null; status: string; reference_amount: number | null; legacy_concept_id: string | null }
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
export async function savePhotoOffline(visitId: string, file: Blob, equipmentId?: string | null) {
  const uid = await kv.get<string>("uid");
  if (!uid) throw new Error("Abre la app una vez con conexión para poder hacer fotos sin red.");
  const [full, thumb] = await Promise.all([resizeImage(file), resizeImage(file, 400, 0.7)]);
  const base = `${uid}/${visitId}/${uuid()}`;
  await saveBlob(`${base}.jpg`, full);
  await saveBlob(`${base}.thumb.jpg`, thumb);
  await enqueue({ kind: "upload", bucket: "visit-photos", path: `${base}.jpg`, blobKey: `${base}.jpg`, contentType: "image/jpeg", label: "Foto" });
  await enqueue({ kind: "upload", bucket: "visit-photos", path: `${base}.thumb.jpg`, blobKey: `${base}.thumb.jpg`, contentType: "image/jpeg", label: "Miniatura" });
  await enqueue({ kind: "insert", table: "visit_photos", label: "Registro de foto", values: { id: uuid(), visit_id: visitId, equipment_id: equipmentId ?? null, kind: equipmentId ? "elemento" : "visita", storage_path: `${base}.jpg`, thumb_path: `${base}.thumb.jpg`, mime_type: "image/jpeg", size_bytes: full.size } });
}

export async function addPaymentOffline(v: { visitId: string; storeId: string; type: CachedType; amount: number; brand?: CachedBrand | null; equipment?: CachedEquipment | null }) {
  await enqueue({
    kind: "insert", table: "payment_records", label: `Pago ${v.type.name}`,
    values: paymentValues({ storeId: v.storeId, type: v.type, amount: v.amount, date: madridDate(), status: "comprobado", visitId: v.visitId, equipment: v.equipment ?? null, brand: v.brand ?? null }),
  });
}

/** Abre una incidencia sin conexión (se envía al volver la red). */
export async function addIncidentOffline(v: { visitId: string; storeId: string; type: string; description: string; priority: string }) {
  await enqueue({ kind: "insert", table: "incidents", label: "Incidencia", values: { id: uuid(), store_id: v.storeId, visit_id: v.visitId, type: v.type, description: v.description.trim() || null, priority: v.priority, status: "abierta", opened_on: madridDate() } });
}

/** Marca un elemento del inventario como revisado en esta visita (sin conexión). */
export async function reviewEquipmentOffline(visitId: string, equipmentId: string) {
  await enqueue({ kind: "update", table: "store_equipment", id: equipmentId, label: "Revisión de elemento", values: { last_reviewed_at: new Date().toISOString(), context_visit_id: visitId } });
}

export async function finishOfflineVisit(visitId: string, startedAt: string, f: { result?: string; notes?: string; checklist?: Record<string, boolean> }) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000));
  await enqueue({
    kind: "update", table: "visits", id: visitId, label: "Fin de visita",
    values: { status: "completed", ended_at: new Date().toISOString(), duration_minutes: minutes, result: f.result || null, notes: f.notes || null, checklist: f.checklist ?? {} },
  });
}
