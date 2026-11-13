import { loadCatalog, loadPayments, loadStoresLite, parseEconomyFilters, scopeFilter } from "@/lib/server/economy";
import { madridDate } from "@/lib/domain/dates";
import { PAY_LABEL, parseRange } from "@/lib/economy";
import { csvResponse } from "@/lib/csv";

/** Pagos del periodo y filtros de la pantalla Economía, en CSV para Excel. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const raw: Record<string, string[]> = {};
  for (const [k, v] of sp) (raw[k] ??= []).push(v);
  const range = parseRange({ period: sp.get("period") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined }, madridDate());
  const f = parseEconomyFilters(raw);
  const [{ types, categories }, stores, payments] = await Promise.all([loadCatalog(), loadStoresLite(), loadPayments(range.from, range.to)]);
  const storeById = new Map(stores.map((s) => [s.id, s]));
  const typeById = new Map(types.map((t) => [t.id, t]));
  const catById = new Map(categories.map((c) => [c.id, c]));
  const inScope = scopeFilter(f, storeById, typeById);
  const rows = payments.filter((p) => inScope(p.store_id, p.payment_type_id) && (!f.status.length || f.status.includes(p.status)));
  return csvResponse(`pagos-${range.from}-${range.to}`,
    ["Fecha", "Periodo", "Tienda", "Enseña", "Cadena", "Municipio", "Concepto", "Tipo de inversión", "Naturaleza", "Importe (€)", "Cantidad", "Unidad", "Estado", "Marca", "Observaciones"],
    rows.map((p) => {
      const s = storeById.get(p.store_id);
      const t = p.payment_type_id ? typeById.get(p.payment_type_id) : undefined;
      return [p.payment_date, (p.period_start ?? p.payment_date).slice(0, 7), s?.name, s?.banner, s?.chain, s?.town, p.concept_name ?? p.concept, t?.category_id ? catById.get(t.category_id)?.name : "",
        p.settlement === "especie" ? "En especie" : "Dinero", Number(p.amount), p.quantity, p.unit, PAY_LABEL[p.status] ?? p.status, p.brand_name, p.notes];
    }));
}
