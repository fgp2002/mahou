// Horarios de tienda: apertura, días, franja preferida y minutos extra (aparcamiento o acceso).
// Días con la misma convención que la jornada: 0 = lunes … 6 = domingo. Sin datos = sin restricción.

export interface StoreHoursLike {
  opening_days?: number[] | null;
  open_time?: string | null;
  close_time?: string | null;
  preferred_from?: string | null;
  preferred_to?: string | null;
  extra_minutes?: number | null;
}

export const DAY_SHORT = ["L", "M", "X", "J", "V", "S", "D"];
export const DAY_NAME = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

export const toMin = (t: string | null | undefined): number | null => {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};
export const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : "");

/** Día de la semana (0 = lunes) de una fecha AAAA-MM-DD. */
export const weekdayMon0 = (iso: string) => (new Date(iso + "T12:00:00Z").getUTCDay() + 6) % 7;

/** ¿Abre ese día? Sin días configurados se considera abierta todos los días. */
export function opensOn(h: StoreHoursLike, iso: string): boolean {
  return !h.opening_days?.length || h.opening_days.includes(weekdayMon0(iso));
}

/**
 * Ventana en la que se puede visitar (minutos desde medianoche): la franja preferida si la hay, si no el horario de apertura.
 * null = sin restricción.
 */
export function visitWindow(h: StoreHoursLike): { from: number; to: number } | null {
  const pf = toMin(h.preferred_from), pt = toMin(h.preferred_to), o = toMin(h.open_time), c = toMin(h.close_time);
  const from = pf ?? o, to = pt ?? c;
  if (from == null && to == null) return null;
  return { from: from ?? 0, to: to ?? 24 * 60 };
}

/** Resumen corto: «L–S · 09:00–21:30 · mejor 10:00–12:00 · +10 min». */
export function hoursSummary(h: StoreHoursLike): string {
  const parts: string[] = [];
  const days = [...(h.opening_days ?? [])].sort();
  if (days.length && days.length < 7) {
    const consecutive = days.every((d, i) => i === 0 || d === days[i - 1] + 1);
    parts.push(consecutive && days.length > 2 ? `${DAY_SHORT[days[0]]}–${DAY_SHORT[days.at(-1)!]}` : days.map((d) => DAY_SHORT[d]).join(" "));
  }
  if (h.open_time || h.close_time) parts.push(`${hhmm(h.open_time) || "?"}–${hhmm(h.close_time) || "?"}`);
  if (h.preferred_from || h.preferred_to) parts.push(`mejor ${hhmm(h.preferred_from) || "?"}–${hhmm(h.preferred_to) || "?"}`);
  if (h.extra_minutes) parts.push(`+${h.extra_minutes} min de acceso`);
  return parts.join(" · ");
}
