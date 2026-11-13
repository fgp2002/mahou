import type { SupabaseClient } from "@supabase/supabase-js";

export interface PaymentType {
  id: string; code: string; name: string; category: string | null; default_amount: number | null; notes: string | null;
  active: boolean; is_builtin: boolean; sort_order: number;
  /** Se instala en tienda: aparece en el inventario. */
  tracks_inventory?: boolean;
  /** Categoría de inversión (espacios, equipamiento, servicios…) y unidad en la que se mide. */
  category_id?: string | null;
  unit?: "eur" | "horas" | "cajas" | "litros" | "unidades";
}

export interface InvestmentCategory { id: string; code: string; name: string; nature: "dinero" | "horas" | "producto" | "material"; sort_order: number; active: boolean }

export interface Agreement {
  id: string; store_id: string; type_id: string; equipment_id: string | null; title: string | null;
  start_date: string; end_date: string | null; periodicity: import("./economy").Periodicity; amount: number;
  quantity: number | null; unit: import("./economy").Unit | null; status: import("./economy").AgreementStatus; notes: string | null; deleted_at: string | null; created_at: string;
}
export const AGREEMENT_COLS = "id,store_id,type_id,equipment_id,title,start_date,end_date,periodicity,amount,quantity,unit,status,notes,deleted_at,created_at";

export interface PaymentRow {
  id: string; store_id: string; payment_type_id: string | null; concept: string; concept_name: string | null; amount: number; payment_date: string;
  status: import("./economy").PayStatus; settlement: "dinero" | "especie"; quantity: number | null; unit: import("./economy").Unit | null;
  period_start: string | null; equipment_id: string | null; agreement_id: string | null; visit_id: string | null;
  brand_id: string | null; brand_name: string | null; notes: string | null; is_demo: boolean;
}
export const PAYMENT_COLS = "id,store_id,payment_type_id,concept,concept_name,amount,payment_date,status,settlement,quantity,unit,period_start,equipment_id,agreement_id,visit_id,brand_id,brand_name,notes,is_demo";

/** Naturaleza por defecto de un pago según la categoría de su concepto: dinero o en especie. */
export function defaultSettlement(type: Pick<PaymentType, "category_id"> | undefined, cats: Pick<InvestmentCategory, "id" | "nature">[]): "dinero" | "especie" {
  const c = type?.category_id ? cats.find((x) => x.id === type.category_id) : undefined;
  return !c || c.nature === "dinero" ? "dinero" : "especie";
}

export function slugify(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "tipo";
}

export { eur } from "./format";

/** Crea un tipo de pago evitando duplicados por nombre (sin distinguir mayúsculas ni espacios extra). */
export async function createPaymentType(sb: SupabaseClient, input: { name: string; default_amount?: number | null; category?: string | null; tracks_inventory?: boolean }) {
  const name = input.name.replace(/\s+/g, " ").trim();
  if (!name) return { data: null, error: "Escribe un nombre." };
  if (input.default_amount != null && (!Number.isFinite(input.default_amount) || input.default_amount < 0)) return { data: null, error: "El importe no es válido." };
  const { data: all } = await sb.from("payment_types").select("id,name,active");
  const dup = (all ?? []).find((t) => t.name.trim().toLowerCase() === name.toLowerCase());
  if (dup) return { data: null, error: dup.active ? `Ya existe un tipo llamado «${dup.name}».` : `«${dup.name}» existe pero está desactivado: actívalo en Ajustes.` };
  let code = slugify(name);
  for (let i = 0; i < 3; i++) {
    const { data, error } = await sb.from("payment_types")
      .insert({ code, name, default_amount: input.default_amount ?? null, category: input.category?.trim() || null, sort_order: 100, tracks_inventory: !!input.tracks_inventory })
      .select("*").single();
    if (!error) return { data: data as PaymentType, error: null };
    if (error.code === "23505" && /code/.test(error.message)) { code = `${slugify(name)}_${Math.random().toString(36).slice(2, 6)}`; continue; }
    if (error.code === "23505") return { data: null, error: `Ya existe un tipo llamado «${name}».` };
    return { data: null, error: error.message };
  }
  return { data: null, error: "No se pudo crear el tipo." };
}
