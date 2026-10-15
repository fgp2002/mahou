// Viabilidad del mes: ¿caben todas las visitas obligatorias que quedan en los días laborables restantes?
// No reparte rutas: compara horas necesarias con horas disponibles y señala las tiendas en riesgo.
import { addDays, monthEnd, weekStart } from "./dates.ts";
import type { Frequency, Obligation } from "./periodicity.ts";

export interface FeasStore { id: string; name: string; frequency: Frequency; audit: boolean; ob: Obligation; minutes: number }
export interface FeasInput {
  today: string;
  stores: FeasStore[];
  workDays: number[]; // 0 = lunes
  holidays: string[];
  /** minutos útiles por día (jornada desde la salida, menos comida) */
  minutesPerDay: number;
  /** conducción media estimada entre tiendas */
  driveMinutesPerVisit: number;
  /** ¿cuenta el día de hoy? (no, si ya ha pasado la hora de fin) */
  includeToday: boolean;
}
export interface FeasResult {
  feasible: boolean;
  visitsNeeded: number;
  workDaysLeft: number;
  hoursAvailable: number;
  hoursNeeded: number;
  /** horas necesarias si las visitas no Audit duran 30 min */
  hoursNeededShort: number;
  shortFixes: boolean;
  atRisk: { id: string; name: string; deadline: string | null; pending: number }[];
  byFrequency: Record<string, number>;
}

const dow = (iso: string) => (new Date(iso + "T12:00:00Z").getUTCDay() + 6) % 7;

/** Visitas obligatorias que quedan hasta fin de mes (ventana actual + ventanas futuras dentro del mes). */
export function remainingVisits(freq: Frequency, ob: Obligation, today: string): number {
  const end = monthEnd(today);
  let n = ob.pending;
  if (freq === "semanal") {
    for (let ws = addDays(weekStart(today), 7); ws <= end; ws = addDays(ws, 7)) n++;
  } else if (freq === "quincenal") {
    if (Number(today.slice(8, 10)) <= 15) n++;
  }
  return n;
}

export function monthFeasibility(i: FeasInput): FeasResult {
  const end = monthEnd(i.today);
  let days = 0;
  for (let d = i.includeToday ? i.today : addDays(i.today, 1); d <= end; d = addDays(d, 1)) {
    if (i.workDays.includes(dow(d)) && !i.holidays.includes(d)) days++;
  }
  let minutes = 0, minutesShort = 0, visits = 0;
  const byFrequency: Record<string, number> = {};
  const needs: { s: FeasStore; n: number }[] = [];
  for (const s of i.stores) {
    if (s.frequency === "ninguna") continue;
    const n = remainingVisits(s.frequency, s.ob, i.today);
    if (!n) continue;
    visits += n;
    byFrequency[s.frequency] = (byFrequency[s.frequency] ?? 0) + n;
    minutes += n * (s.minutes + i.driveMinutesPerVisit);
    minutesShort += n * ((s.audit ? s.minutes : Math.min(30, s.minutes)) + i.driveMinutesPerVisit);
    needs.push({ s, n });
  }
  const available = days * i.minutesPerDay;
  const feasible = minutes <= available;
  // En riesgo: las que vencen antes, hasta cubrir el exceso de tiempo.
  const atRisk: FeasResult["atRisk"] = [];
  if (!feasible) {
    let excess = minutes - available;
    const sorted = [...needs].sort((a, b) => (b.s.ob.deadline ?? "9999").localeCompare(a.s.ob.deadline ?? "9999") || Number(a.s.audit) - Number(b.s.audit));
    for (const { s, n } of sorted) {
      if (excess <= 0) break;
      atRisk.push({ id: s.id, name: s.name, deadline: s.ob.deadline, pending: n });
      excess -= n * (s.minutes + i.driveMinutesPerVisit);
    }
  }
  return {
    feasible, visitsNeeded: visits, workDaysLeft: days,
    hoursAvailable: Math.round((available / 60) * 10) / 10,
    hoursNeeded: Math.round((minutes / 60) * 10) / 10,
    hoursNeededShort: Math.round((minutesShort / 60) * 10) / 10,
    shortFixes: !feasible && minutesShort <= available,
    atRisk, byFrequency,
  };
}
