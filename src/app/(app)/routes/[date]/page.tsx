import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { RouteEditor, type StopView } from "@/components/RouteEditor";
import { formatLong } from "@/lib/domain/dates";
import { GenerateRoute } from "@/components/GenerateRoute";

export default async function RoutePage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return <p>Fecha no válida.</p>;
  const sb = await supabaseServer();
  const { data: route } = await sb.from("routes").select("*").eq("route_date", date).maybeSingle();
  if (!route) {
    return (
      <div className="max-w-3xl space-y-6">
        <PageHeader title={formatLong(date)}><Link href="/routes" className="btn-secondary">Todas las rutas</Link></PageHeader>
        <p className="text-sm text-slate-500">No hay ruta para este día.</p>
        <GenerateRoute defaultDate={date} routeStart="la hora configurada" />
      </div>
    );
  }
  const { data: stops } = await sb.from("route_stops").select("id,store_id,position,planned_arrival,planned_minutes,drive_seconds_from_prev,distance_m_from_prev,reason,manually_added,forced_priority,stores(name,town,address,postal_code,lat,lng,audit)").eq("route_id", route.id).order("position");
  const { data: visits } = await sb.from("visits").select("route_stop_id,status,id").eq("visit_date", date).not("route_stop_id", "is", null);
  const vmap = new Map((visits ?? []).map((v) => [v.route_stop_id, v]));
  const views: StopView[] = ((stops ?? []) as unknown as (Omit<StopView, "visit"> & { id: string })[]).map((s) => ({ ...s, visit: vmap.get(s.id) ? { id: vmap.get(s.id)!.id, status: vmap.get(s.id)!.status } : null }));
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title={formatLong(date)}><Link href="/routes" className="btn-secondary">Todas las rutas</Link></PageHeader>
      <RouteEditor
        route={{ id: route.id, date, status: route.status, start_time: String(route.start_time).slice(0, 5), is_estimate: route.is_estimate, provider: route.routing_provider, drive: route.est_drive_seconds ?? 0, visit: route.est_visit_seconds ?? 0, dist: route.est_distance_m ?? 0, unscheduled: route.unscheduled ?? [], warnings: route.warnings ?? [], generated_by: route.generated_by, user_modified: route.user_modified, lunch_start: route.lunch_start, lunch_after: route.lunch_after_position, banners: route.banner_filter }}
        stops={views}
      />
    </div>
  );
}
