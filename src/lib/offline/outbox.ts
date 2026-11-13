"use client";
// Cola de cambios hechos sin conexión. Se envían en orden en cuanto vuelve la red.
// Cada cambio guarda el usuario que lo hizo: solo se envía con la sesión de ese usuario y nunca se borra al cerrar sesión.
import { supabaseBrowser } from "../supabase/client";
import { idb, kv } from "./db";

export type Op =
  | { kind: "insert"; table: string; values: Record<string, unknown>; label: string }
  | { kind: "update"; table: string; values: Record<string, unknown>; id: string; label: string }
  | { kind: "upload"; bucket: string; path: string; blobKey: string; contentType: string; label: string };

type Stored = Op & { seq?: number; tries?: number; error?: string; uid?: string | null };

const listeners = new Set<() => void>();
export const onOutboxChange = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const emit = () => listeners.forEach((l) => l());

/** ¿El fallo es por falta de red (y no un error de datos)? */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const m = String((e as { message?: string })?.message ?? e ?? "");
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(m);
}

export async function enqueue(op: Op) {
  const uid = (await kv.get<string>("uid")) ?? null;
  await idb.add("outbox", { ...op, tries: 0, uid });
  emit();
}
export async function saveBlob(key: string, blob: Blob) {
  await idb.put("blobs", blob, key);
}
export async function pending(): Promise<{ total: number; failed: number }> {
  try {
    const all = await idb.all<Stored>("outbox");
    return { total: all.length, failed: all.filter((o) => o.error).length };
  } catch {
    return { total: 0, failed: 0 };
  }
}

/**
 * Escribe en la base de datos si hay red; si no (o si la red falla a mitad), deja el cambio en la cola del móvil.
 * Devuelve `queued: true` cuando el cambio quedó pendiente de enviar. Los inserts deben llevar `id` para no duplicarse.
 */
export async function writeOrQueue(op: Extract<Op, { kind: "insert" | "update" }>): Promise<{ error: string | null; queued: boolean }> {
  if (op.kind === "insert" && !op.values.id) op = { ...op, values: { id: crypto.randomUUID(), ...op.values } };
  if (typeof navigator !== "undefined" && !navigator.onLine) { await enqueue(op); return { error: null, queued: true }; }
  const sb = supabaseBrowser();
  try {
    const { error } = op.kind === "insert"
      ? await sb.from(op.table).insert(op.values)
      : await sb.from(op.table).update(op.values).eq("id", op.id);
    if (!error) return { error: null, queued: false };
    if (isNetworkError(error)) { await enqueue(op); return { error: null, queued: true }; }
    return { error: error.message, queued: false };
  } catch (e) {
    if (isNetworkError(e)) { await enqueue(op); return { error: null, queued: true }; }
    return { error: String((e as Error)?.message ?? e), queued: false };
  }
}

let running = false;
/** Envía la cola. Para en el primer fallo de red; los errores de datos se marcan y se reintentan más tarde. */
export async function flush(): Promise<number> {
  if (running || (typeof navigator !== "undefined" && !navigator.onLine)) return 0;
  running = true;
  let sent = 0;
  try {
    const sb = supabaseBrowser();
    const { data: u } = await sb.auth.getUser();
    const me = u.user?.id ?? null;
    if (!me) return 0;
    const ops = await idb.all<Stored>("outbox");
    for (const op of ops) {
      // Los cambios de otro usuario esperan a que ese usuario vuelva a entrar.
      if (op.uid && op.uid !== me) continue;
      try {
        let error: { message: string } | null = null;
        if (op.kind === "insert") {
          // upsert con id: si ya llegó en un intento anterior, no se duplica.
          ({ error } = await sb.from(op.table).upsert(op.values, { onConflict: "id", ignoreDuplicates: true }));
        } else if (op.kind === "update") {
          ({ error } = await sb.from(op.table).update(op.values).eq("id", op.id));
        } else {
          const blob = await idb.get<Blob>("blobs", op.blobKey);
          if (blob) {
            const r = await sb.storage.from(op.bucket).upload(op.path, blob, { contentType: op.contentType, upsert: true, cacheControl: "31536000" });
            error = r.error;
            if (!error) await idb.del("blobs", op.blobKey);
          }
        }
        if (error) {
          if (isNetworkError(error)) break;
          await idb.put("outbox", { ...op, tries: (op.tries ?? 0) + 1, error: error.message });
          continue;
        }
        await idb.del("outbox", op.seq!);
        sent++;
      } catch (e) {
        if (isNetworkError(e)) break;
        await idb.put("outbox", { ...op, tries: (op.tries ?? 0) + 1, error: String((e as Error)?.message ?? e) });
      }
    }
  } finally {
    running = false;
    emit();
  }
  return sent;
}
