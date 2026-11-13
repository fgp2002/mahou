import { loadInventory, parseInventoryFilters } from "@/lib/server/inventory";
import { STATUS_LABEL } from "@/lib/equipment";
import { csvResponse } from "@/lib/csv";
import { madridDate } from "@/lib/domain/dates";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const raw: Record<string, string[]> = {};
  for (const [k, v] of sp) (raw[k] ??= []).push(v);
  const { rows } = await loadInventory(parseInventoryFilters(raw));
  return csvResponse(`inventario-${madridDate()}`,
    ["Código", "Tipo", "Descripción", "Marca", "Cantidad", "Estado", "Ubicación", "Instalación", "Instalación aproximada", "Retirada", "Importe de referencia", "Tienda", "Enseña", "Cadena", "Municipio", "Observaciones"],
    rows.map((e) => [e.code, e.typeName, e.name, e.brand_name, e.quantity, STATUS_LABEL[e.status], e.location, e.installed_on, e.installed_on_estimated ? "sí" : "no", e.removed_on, e.reference_amount, e.store.name, e.store.banner, e.store.chain, e.store.town, e.notes]));
}
