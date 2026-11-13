"use client";
/** Llama a la API de administración y devuelve el resultado o el mensaje de error en castellano. */
export async function adminOp<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const r = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j.error ?? "No se pudo completar la operación" };
    return { ok: true, data: j as T };
  } catch {
    return { ok: false, error: "Sin conexión: la administración necesita internet" };
  }
}
