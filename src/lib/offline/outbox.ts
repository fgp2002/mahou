"use client";
// Cola de cambios hechos sin conexión. Se envían en orden en cuanto vuelve la red.
import { supabaseBrowser } from "../supabase/client";
import { idb } from "./db";

export type Op =
  | { kind: "insert"; table: string; values: Record<string, unknown>; label: string }
  | { kind: "update"; table: string; values: Record<string, unknown>; id: string; label: string }
  | { kind: "upload"; bucket: string; path: string; blobKey: string; contentType: string; label: string };

type Stored = Op & { seq?: number; tries?: number; error?: string };

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
  await idb.add("outbox", { ...op, tries: 0 });
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

let running = false;
/** Envía la cola. Para en el primer fallo de red; los errores de datos se marcan y se reintentan más tarde. */
export async function flush(): Promise<number> {
  if (running || (typeof navigator !== "undefined" && !navigator.onLine)) return 0;
  running = true;
  let sent = 0;
  try {
    const sb = supabaseBrowser();
    const ops = await idb.all<Stored>("outbox");
    for (const op of ops) {
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
