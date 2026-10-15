import { supabaseServer } from "../supabase/server";
import { madridDate, madridHour, parseHM } from "../domain/dates.ts";
import { effectiveFrequency } from "../domain/periodicity.ts";
import { monthFeasibility, type FeasResult } from "../domain/feasibility.ts";
import type { Settings, StoreWithObligation } from "./load.ts";

/** Viabilidad del mes en curso con los datos reales (jornada, comida, festivos y conducción media de tus rutas). */
export async function loadFeasibility(rows: StoreWithObligation[], settings: Settings): Promise<FeasResult> {
  const sb = await supabaseServer();
  const { data: recent } = await sb.from("routes").select("est_drive_seconds,route_stops(count)").order("route_date", { ascending: false }).limit(10);
  let drive = 0, stops = 0;
  for (const r of (recent ?? []) as unknown as { est_drive_seconds: number | null; route_stops: { count: number }[] }[]) {
    drive += r.est_drive_seconds ?? 0;
    stops += r.route_stops?.[0]?.count ?? 0;
  }
  const pp = settings.planning_prefs as Settings["planning_prefs"] & { lunch?: { enabled?: boolean; minutes?: number }; default_visit_minutes?: number };
  const lunch = pp.lunch?.enabled === false ? 0 : pp.lunch?.minutes ?? 60;
  const minutesPerDay = Math.max(60, parseHM(settings.work_end) - parseHM(settings.route_start) - lunch);
  const today = madridDate();
  return monthFeasibility({
    today,
    stores: rows.map((s) => ({ id: s.id, name: s.name, frequency: effectiveFrequency(s.frequency, s.audit), audit: s.audit, ob: s.ob, minutes: pp.default_visit_minutes ?? 45 })),
    workDays: pp.work_days ?? [0, 1, 2, 3, 4],
    holidays: pp.holidays ?? [],
    minutesPerDay,
    driveMinutesPerVisit: stops >= 5 ? Math.max(5, Math.round(drive / stops / 60)) : 15,
    includeToday: madridHour() < Number(settings.work_end.slice(0, 2)),
  });
}
