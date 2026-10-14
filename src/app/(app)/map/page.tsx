import { loadAllStores, loadCompletedDates, loadSettings, withObligations } from "@/lib/server/load";
import { supabaseServer } from "@/lib/supabase/server";
import { brandKey, logoUrl } from "@/lib/brands";
import { MapLoader } from "@/components/MapLoader";
import type { MapStore } from "@/components/MapView";

export default async function MapPage() {
  const [settings, stores, dates] = await Promise.all([loadSettings(), loadAllStores(), loadCompletedDates()]);
  const sb = await supabaseServer();
  const { data: bl } = await sb.from("brand_logos").select("brand_key,storage_path");
  const logos = new Map((bl ?? []).map((l) => [l.brand_key, logoUrl(l.storage_path)]));
  const rows = withObligations(stores, dates, settings);
  const data: MapStore[] = rows
    .filter((s) => s.lat != null && s.lng != null)
    .map((s) => ({
      id: s.id, name: s.name, banner: s.banner, town: s.town, address: s.address, postal_code: s.postal_code,
      lat: s.lat!, lng: s.lng!, audit: s.audit, frequency: s.frequency, state: s.ob.state, lastVisit: s.ob.lastVisit,
      deadline: s.ob.deadline, approx: s.geocode_status === "partial", chain: s.chain, storeType: s.store_type, logo: logos.get(brandKey(s.banner) ?? "") ?? null,
    }));
  return <MapLoader stores={data} />;
}
