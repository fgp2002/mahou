// Informes: obligaciones de visita en un intervalo, a partir de las mismas ventanas que usa la periodicidad.
import { currentWindow, effectiveFrequency, type Frequency, type Window } from "./periodicity.ts";
import { addDays } from "./dates.ts";

/** Ventanas de la periodicidad que se solapan con [from, to] (semana, quincena o mes). */
export function windowsInRange(freq: Frequency, from: string, to: string): Window[] {
  if (freq === "ninguna" || from > to) return [];
  const out: Window[] = [];
  let w = currentWindow(freq, from);
  while (w && w.start <= to) {
    out.push(w);
    w = currentWindow(freq, addDays(w.end, 1));
  }
  return out;
}

export interface StoreCompliance { required: number; done: number; pending: number; missed: number; visits: number }

/**
 * Cumplimiento de una tienda en un intervalo: cada ventana obligatoria cuenta una vez.
 * - done: ventanas con al menos una visita completada.
 * - missed: ventanas ya cerradas (antes de hoy) sin visita.
 * - pending: ventanas aún abiertas sin visita.
 * Las ventanas anteriores al inicio del seguimiento no cuentan.
 */
export function complianceInRange(freq: Frequency, audit: boolean, visitDates: string[], from: string, to: string, today: string, trackingStart?: string): StoreCompliance {
  const f = effectiveFrequency(freq, audit);
  const visits = visitDates.filter((d) => d >= from && d <= to).length;
  const out: StoreCompliance = { required: 0, done: 0, pending: 0, missed: 0, visits };
  const lastDay = to < today ? to : today;
  for (const w of windowsInRange(f, from, to)) {
    if (w.start > lastDay) break;
    if (trackingStart && w.end < trackingStart) continue;
    out.required++;
    if (visitDates.some((d) => d >= w.start && d <= w.end)) out.done++;
    else if (w.end < today) out.missed++;
    else out.pending++;
  }
  return out;
}

export function sumCompliance(xs: StoreCompliance[]): StoreCompliance {
  return xs.reduce((a, b) => ({ required: a.required + b.required, done: a.done + b.done, pending: a.pending + b.pending, missed: a.missed + b.missed, visits: a.visits + b.visits }), { required: 0, done: 0, pending: 0, missed: 0, visits: 0 });
}

export const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);
