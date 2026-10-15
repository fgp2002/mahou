import type { SupabaseClient } from "@supabase/supabase-js";

export interface PaymentType {
  id: string; code: string; name: string; category: string | null; default_amount: number | null; notes: string | null;
  active: boolean; is_builtin: boolean; sort_order: number;
}

export function slugify(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "tipo";
}

export { eur } from "./format";

/** Crea un tipo de pago evitando duplicados por nombre (sin distinguir mayúsculas ni espacios extra). */
export async function createPaymentType(sb: SupabaseClient, input: { name: string; default_amount?: number | null; category?: string | null }) {
  const name = input.name.replace(/\s+/g, " ").trim();
  if (!name) return { data: null, error: "Escribe un nombre." };
  if (input.default_amount != null && (!Number.isFinite(input.default_amount) || input.default_amount < 0)) return { data: null, error: "El importe no es válido." };
  const { data: all } = await sb.from("payment_types").select("id,name,active");
  const dup = (all ?? []).find((t) => t.name.trim().toLowerCase() === name.toLowerCase());
  if (dup) return { data: null, error: dup.active ? `Ya existe un tipo llamado «${dup.name}».` : `«${dup.name}» existe pero está desactivado: actívalo en Ajustes.` };
  let code = slugify(name);
  for (let i = 0; i < 3; i++) {
    const { data, error } = await sb.from("payment_types")
      .insert({ code, name, default_amount: input.default_amount ?? null, category: input.category?.trim() || null, sort_order: 100 })
      .select("*").single();
    if (!error) return { data: data as PaymentType, error: null };
    if (error.code === "23505" && /code/.test(error.message)) { code = `${slugify(name)}_${Math.random().toString(36).slice(2, 6)}`; continue; }
    if (error.code === "23505") return { data: null, error: `Ya existe un tipo llamado «${name}».` };
    return { data: null, error: error.message };
  }
  return { data: null, error: "No se pudo crear el tipo." };
}
