import { cache } from "react";
import { supabaseServer } from "../supabase/server";
import { AGREEMENT_COLS, PAYMENT_COLS, type Agreement, type InvestmentCategory, type PaymentRow, type PaymentType } from "../payments";
import { loadPaymentTypes } from "./load";

type Q<T> = (from: number, to: number) => PromiseLike<{ data: T[] | null }>;
export async function fetchAll<T>(q: Q<T>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await q(from, from + 999);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Catálogo económico: categorías de inversión y conceptos (se siembran la primera vez). */
export const loadCatalog = cache(async (): Promise<{ types: PaymentType[]; categories: InvestmentCategory[] }> => {
  const sb = await supabaseServer();
  let { data: cats } = await sb.from("investment_categories").select("id,code,name,nature,sort_order,active").order("sort_order");
  if (!cats?.length) {
    await sb.rpc("ensure_investment_catalog");
    ({ data: cats } = await sb.from("investment_categories").select("id,code,name,nature,sort_order,active").order("sort_order"));
  }
  return { types: await loadPaymentTypes(), categories: (cats ?? []) as InvestmentCategory[] };
});

export interface StoreLite { id: string; name: string; banner: string | null; chain: string | null; town: string | null }

export const loadStoresLite = cache(async (): Promise<StoreLite[]> => {
  const sb = await supabaseServer();
  return fetchAll<StoreLite>((a, b) => sb.from("stores").select("id,name,banner,chain,town").order("name").range(a, b));
});

/** Pagos (sin papelera) entre dos fechas, ambas incluidas. */
export async function loadPayments(from?: string, to?: string): Promise<PaymentRow[]> {
  const sb = await supabaseServer();
  return fetchAll<PaymentRow>((a, b) => {
    let q = sb.from("payment_records").select(PAYMENT_COLS).is("deleted_at", null);
    if (from) q = q.gte("payment_date", from);
    if (to) q = q.lte("payment_date", to);
    return q.order("payment_date", { ascending: false }).range(a, b);
  });
}

export async function loadAgreements(storeId?: string): Promise<Agreement[]> {
  const sb = await supabaseServer();
  return fetchAll<Agreement>((a, b) => {
    let q = sb.from("agreements").select(AGREEMENT_COLS).is("deleted_at", null);
    if (storeId) q = q.eq("store_id", storeId);
    return q.order("start_date", { ascending: false }).range(a, b);
  });
}

export interface EconomyFilters { banner: string[]; chain: string[]; store: string[]; category: string[]; status: string[]; type: string[] }

export function parseEconomyFilters(raw: Record<string, string | string[] | undefined>): EconomyFilters {
  const many = (k: string) => { const v = raw[k]; return (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean); };
  return { banner: many("banner"), chain: many("chain"), store: many("store"), category: many("category"), status: many("status"), type: many("type") };
}

/** Devuelve un filtro para pagos o acuerdos según tienda (enseña/cadena/tienda) y concepto/categoría. */
export function scopeFilter(f: EconomyFilters, storeById: Map<string, StoreLite>, typeById: Map<string, PaymentType>) {
  const inF = (vals: string[], x: string | null | undefined) => !vals.length || vals.includes(x ?? "");
  return (storeId: string, typeId: string | null) => {
    const s = storeById.get(storeId);
    const t = typeId ? typeById.get(typeId) : undefined;
    return inF(f.store, storeId) && inF(f.banner, s?.banner) && inF(f.chain, s?.chain) && inF(f.type, typeId) && inF(f.category, t?.category_id ?? "sin_categoria");
  };
}
