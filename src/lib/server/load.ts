import { computeObligation, priorityScore, type Obligation } from "../domain/periodicity.ts";
import { madridDate } from "../domain/dates.ts";
import type { Store } from "../types.ts";
import { supabaseServer } from "../supabase/server";

const STORE_COLS = "id,source_id,name,banner,chain,macro_chain,store_type,area,kam,address,town,postal_code,province,lat,lng,geocode_status,geocode_formatted,gpv,frequency,audit,notes,active,manual_overrides";

export interface Settings {
  tracking_start: string;
  work_start: string;
  work_end: string;
  route_start: string;
  transport: string;
  visit_durations: Record<string, number>;
  planning_prefs: { audit_first?: boolean; max_stops_per_day?: number | null; holidays?: string[]; work_days?: number[] };
}

export async function loadSettings(): Promise<Settings> {
  const sb = await supabaseServer();
  const { data } = await sb.from("user_settings").select("*").maybeSingle();
  return {
    tracking_start: data?.tracking_start ?? madridDate(),
    work_start: (data?.work_start ?? "08:00").slice(0, 5),
    work_end: (data?.work_end ?? "18:00").slice(0, 5),
    route_start: (data?.route_start ?? "09:00").slice(0, 5),
    transport: data?.transport ?? "driving",
    visit_durations: data?.visit_durations ?? {},
    planning_prefs: data?.planning_prefs ?? {},
  };
}

/** Fechas de visitas completadas por tienda (paginado para superar el límite de 1000 filas). */
export async function loadCompletedDates(): Promise<Map<string, string[]>> {
  const sb = await supabaseServer();
  const map = new Map<string, string[]>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("visits").select("store_id, visit_date").eq("status", "completed").range(from, from + 999);
    if (error || !data) break;
    for (const v of data) {
      const arr = map.get(v.store_id) ?? [];
      arr.push(v.visit_date);
      map.set(v.store_id, arr);
    }
    if (data.length < 1000) break;
  }
  return map;
}

export async function loadAllStores(): Promise<Store[]> {
  const sb = await supabaseServer();
  const out: Store[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("stores").select(STORE_COLS).eq("active", true).order("name").range(from, from + 999);
    if (error || !data) break;
    out.push(...(data as Store[]));
    if (data.length < 1000) break;
  }
  return out;
}

export interface StoreWithObligation extends Store {
  ob: Obligation;
  score: number;
}

export function withObligations(stores: Store[], dates: Map<string, string[]>, settings: Settings, today = madridDate()): StoreWithObligation[] {
  return stores.map((s) => {
    const ob = computeObligation(s.frequency, today, dates.get(s.id) ?? [], { trackingStart: settings.tracking_start });
    return { ...s, ob, score: priorityScore(ob, s.audit) };
  });
}

export async function loadPaymentTypes(): Promise<import("../payments").PaymentType[]> {
  const sb = await supabaseServer();
  let { data } = await sb.from("payment_types").select("*").order("sort_order").order("name");
  if (!data?.length) {
    await sb.rpc("ensure_payment_types");
    ({ data } = await sb.from("payment_types").select("*").order("sort_order").order("name"));
  }
  return (data ?? []) as import("../payments").PaymentType[];
}
