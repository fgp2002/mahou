import { loadAllStores, loadCompletedDates, loadSettings, withObligations } from "@/lib/server/load";
import { MapLoader } from "@/components/MapLoader";
import type { MapStore } from "@/components/MapView";

export default async function MapPage() {
  const [settings, stores, dates] = await Promise.all([loadSettings(), loadAllStores(), loadCompletedDates()]);
  const rows = withObligations(stores, dates, settings);
  const data: MapStore[] = rows
    .filter((s) => s.lat != null && s.lng != null)
    .map((s) => ({
      id: s.id, name: s.name, banner: s.banner, town: s.town, address: s.address, postal_code: s.postal_code,
      lat: s.lat!, lng: s.lng!, audit: s.audit, frequency: s.frequency, state: s.ob.state, lastVisit: s.ob.lastVisit,
      deadline: s.ob.deadline, approx: s.geocode_status === "partial",
    }));
  return <MapLoader stores={data} />;
}
