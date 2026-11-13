import { supabaseServer } from "../supabase/server";
import { EQUIPMENT_COLS, type Equipment } from "../equipment";

export interface EquipmentWithStats extends Equipment { thumb: string | null; paid: number; payments: number }

/** Inventario de una tienda (sin lo que está en la papelera), con la última foto y lo abonado por elemento. */
export async function loadStoreEquipment(storeId: string): Promise<EquipmentWithStats[]> {
  const sb = await supabaseServer();
  const { data } = await sb.from("store_equipment").select(EQUIPMENT_COLS).eq("store_id", storeId).is("deleted_at", null).order("created_at");
  const items = (data ?? []) as unknown as Equipment[];
  if (!items.length) return [];
  const ids = items.map((e) => e.id);
  const [{ data: photos }, { data: pays }] = await Promise.all([
    sb.from("visit_photos").select("equipment_id,thumb_path,storage_path,taken_at").in("equipment_id", ids).is("deleted_at", null).order("taken_at", { ascending: false }),
    sb.from("payment_records").select("equipment_id,amount,status").in("equipment_id", ids).is("deleted_at", null),
  ]);
  const lastPhoto = new Map<string, string>();
  for (const p of photos ?? []) if (p.equipment_id && !lastPhoto.has(p.equipment_id)) lastPhoto.set(p.equipment_id, p.thumb_path ?? p.storage_path);
  const paths = [...lastPhoto.values()];
  const { data: signed } = paths.length ? await sb.storage.from("visit-photos").createSignedUrls(paths, 3600) : { data: [] };
  const url = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const paid = new Map<string, { paid: number; n: number }>();
  for (const p of pays ?? []) {
    if (!p.equipment_id || p.status === "cancelado") continue;
    const a = paid.get(p.equipment_id) ?? { paid: 0, n: 0 };
    a.n++;
    if (p.status === "abonado") a.paid += Number(p.amount);
    paid.set(p.equipment_id, a);
  }
  return items.map((e) => ({ ...e, thumb: lastPhoto.has(e.id) ? url.get(lastPhoto.get(e.id)!) ?? null : null, paid: paid.get(e.id)?.paid ?? 0, payments: paid.get(e.id)?.n ?? 0 }));
}
