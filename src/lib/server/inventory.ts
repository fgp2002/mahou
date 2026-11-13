import { supabaseServer } from "../supabase/server";
import { EQUIPMENT_COLS, isPresent, type Equipment, type EquipmentStatus } from "../equipment";
import { loadPaymentTypes } from "./load";

export interface InventoryRow extends Equipment {
  typeName: string;
  store: { id: string; name: string; banner: string | null; chain: string | null; town: string | null };
}

export interface InventoryFilters { type: string[]; status: string[]; brand: string[]; banner: string[]; chain: string[]; q: string }

export function parseInventoryFilters(raw: Record<string, string | string[] | undefined>): InventoryFilters {
  const many = (k: string) => { const v = raw[k]; return (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean); };
  const one = (k: string) => { const v = raw[k]; return (Array.isArray(v) ? v[0] : v) ?? ""; };
  return { type: many("type"), status: many("status"), brand: many("brand"), banner: many("banner"), chain: many("chain"), q: one("q").trim().toLowerCase() };
}

/** Todo el inventario (sin papelera) con su tienda y tipo; los filtros se aplican en memoria (cientos de filas). */
export async function loadInventory(f: InventoryFilters) {
  const sb = await supabaseServer();
  const [types, rows, stores] = await Promise.all([
    loadPaymentTypes(),
    (async () => {
      const out: Equipment[] = [];
      for (let from = 0; ; from += 1000) {
        const { data } = await sb.from("store_equipment").select(EQUIPMENT_COLS).is("deleted_at", null).order("created_at").range(from, from + 999);
        out.push(...((data ?? []) as unknown as Equipment[]));
        if (!data || data.length < 1000) break;
      }
      return out;
    })(),
    (async () => {
      const out: InventoryRow["store"][] = [];
      for (let from = 0; ; from += 1000) {
        const { data } = await sb.from("stores").select("id,name,banner,chain,town").range(from, from + 999);
        out.push(...((data ?? []) as InventoryRow["store"][]));
        if (!data || data.length < 1000) break;
      }
      return out;
    })(),
  ]);
  const typeById = new Map(types.map((t) => [t.id, t]));
  const storeById = new Map(stores.map((s) => [s.id, s]));
  const all: InventoryRow[] = rows.map((e) => ({ ...e, typeName: typeById.get(e.type_id)?.name ?? "Elemento", store: storeById.get(e.store_id) ?? { id: e.store_id, name: "Tienda", banner: null, chain: null, town: null } }));
  const inF = (vals: string[], x: string | null | undefined) => !vals.length || vals.includes(x ?? "");
  const filtered = all.filter((e) =>
    inF(f.type, e.type_id) && inF(f.status, e.status) && inF(f.brand, e.brand_name ?? "Sin marca") &&
    inF(f.banner, e.store.banner) && inF(f.chain, e.store.chain) &&
    (!f.q || `${e.code ?? ""} ${e.name ?? ""} ${e.typeName} ${e.store.name} ${e.store.town ?? ""} ${e.location ?? ""}`.toLowerCase().includes(f.q)));
  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a!.localeCompare(b!, "es")) as string[];
  const facets = {
    types: types.filter((t) => t.tracks_inventory || all.some((e) => e.type_id === t.id)).map((t) => [t.id, t.name] as [string, string]),
    brands: uniq(all.map((e) => e.brand_name ?? "Sin marca")),
    banners: uniq(all.map((e) => e.store.banner)),
    chains: uniq(all.map((e) => e.store.chain)),
  };
  // Resumen: unidades presentes por tipo y elementos por estado (de lo filtrado).
  const byType = new Map<string, { name: string; units: number; review: number }>();
  const byStatus = new Map<EquipmentStatus, number>();
  for (const e of filtered) {
    byStatus.set(e.status, (byStatus.get(e.status) ?? 0) + 1);
    const t = byType.get(e.type_id) ?? { name: e.typeName, units: 0, review: 0 };
    if (isPresent(e.status)) t.units += e.quantity;
    if (e.status === "pendiente_revision" || e.status === "deteriorado") t.review++;
    byType.set(e.type_id, t);
  }
  return { rows: filtered, total: all.length, facets, byType, byStatus, stores: new Set(filtered.map((e) => e.store_id)).size };
}
