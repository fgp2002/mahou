import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { loadAllStores, loadCompletedDates, loadSettings, withObligations } from "@/lib/server/load";
import { loadFeasibility } from "@/lib/server/feasibility";
import { FeasibilityCard } from "@/components/ui";
import { PageHeader } from "@/components/ui";
import { GenerateRoute } from "@/components/GenerateRoute";
import { madridDate, addDays, formatLong } from "@/lib/domain/dates";

const ST: Record<string, string> = { proposed: "Propuesta", accepted: "Aceptada", rejected: "Rechazada", completed: "Completada" };

export default async function RoutesPage() {
  const sb = await supabaseServer();
  const today = madridDate();
  const [settings, stores, dates] = await Promise.all([loadSettings(), loadAllStores(), loadCompletedDates()]);
  const feas = await loadFeasibility(withObligations(stores, dates, settings, today), settings);
  const { data: routes } = await sb.from("routes").select("id,route_date,status,generated_by,est_drive_seconds,est_visit_seconds,is_estimate,route_stops(count)").order("route_date", { ascending: false }).limit(60);
  const rows = (routes ?? []) as unknown as { id: string; route_date: string; status: string; generated_by: string; est_drive_seconds: number | null; est_visit_seconds: number | null; is_estimate: boolean; route_stops: { count: number }[] }[];
  const upcoming = rows.filter((r) => r.route_date >= today).reverse();
  const past = rows.filter((r) => r.route_date < today);
  const defaultDate = addDays(today, 1);
  const List = ({ items }: { items: typeof rows }) => (
    <ul className="divide-y divide-slate-100 text-sm">
      {items.map((r) => (
        <li key={r.id}>
          <Link href={`/routes/${r.route_date}`} className="flex items-center justify-between p-3 hover:bg-slate-50">
            <span>{formatLong(r.route_date)} <span className="text-slate-400">· {r.route_stops?.[0]?.count ?? 0} paradas · {r.generated_by === "auto" ? "automática" : "manual"}</span></span>
            <span className="badge bg-slate-100 text-slate-700">{ST[r.status]}</span>
          </Link>
        </li>
      ))}
      {items.length === 0 && <li className="p-4 text-slate-500">Nada por aquí.</li>}
    </ul>
  );
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Rutas" />
      <FeasibilityCard f={feas} />
      <GenerateRoute defaultDate={defaultDate} routeStart={settings.route_start} />
      <section className="card p-0"><h2 className="p-3 pb-0 font-medium">Próximas</h2><List items={upcoming} /></section>
      <section className="card p-0"><h2 className="p-3 pb-0 font-medium">Pasadas</h2><List items={past} /></section>
    </div>
  );
}
