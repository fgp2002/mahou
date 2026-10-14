// Lógica de periodicidad de visitas.
//
// Modelo de ventanas (cada ventana exige 1 visita completada):
//  - semanal:   semana ISO (lunes a domingo)
//  - mensual:   mes natural
//  - quincenal: dos ventanas por mes, días 1-15 y 16-fin de mes
//  - ninguna:   sin obligación automática (se admiten visitas manuales)
//
// Arrastre: si la ventana inmediatamente anterior quedó sin visita, la primera
// visita de la ventana actual la regulariza (no cuenta dos veces) y la actual
// sigue pendiente. Solo se arrastra una ventana; las más antiguas caducan.
// Una ventana anterior que empezó antes de `trackingStart` no genera atraso.

import { addDays, daysInMonth, diffDays, monthEnd, monthStart, weekEnd, weekStart } from "./dates.ts";

export type Frequency = "semanal" | "quincenal" | "mensual" | "ninguna";

export type DueState = "sin_obligacion" | "cumplida" | "pendiente" | "proxima" | "atrasada";

export interface Window {
  start: string;
  end: string;
}

export interface Obligation {
  frequency: Frequency;
  state: DueState;
  window: Window | null;
  /** Visitas completadas dentro de la ventana actual. */
  doneInWindow: number;
  /** Visitas que todavía se deben (incluye arrastre). */
  pending: number;
  /** Visitas atrasadas de la ventana anterior. */
  overdueCarry: number;
  /** Fecha límite de la obligación vigente. */
  deadline: string | null;
  /** Días hasta la fecha límite (negativo si ya pasó). */
  daysToDeadline: number | null;
  /** Primera fecha recomendable para visitar (separa las visitas quincenales). */
  eligibleFrom: string | null;
  lastVisit: string | null;
}

export interface ObligationOptions {
  /** Fecha de inicio del seguimiento: antes de esta fecha no hay obligaciones. */
  trackingStart?: string;
  /** Días de antelación para considerar una visita "próxima a vencer". */
  soonDays?: number;
  /** Separación mínima entre visitas quincenales. */
  quincenalGapDays?: number;
}

export function currentWindow(freq: Frequency, today: string): Window | null {
  switch (freq) {
    case "semanal":
      return { start: weekStart(today), end: weekEnd(today) };
    case "mensual":
      return { start: monthStart(today), end: monthEnd(today) };
    case "quincenal": {
      const [y, m, d] = today.split("-").map(Number);
      const ms = `${y}-${String(m).padStart(2, "0")}`;
      if (d <= 15) return { start: `${ms}-01`, end: `${ms}-15` };
      return { start: `${ms}-16`, end: `${ms}-${String(daysInMonth(y, m)).padStart(2, "0")}` };
    }
    default:
      return null;
  }
}

export function previousWindow(freq: Frequency, w: Window): Window | null {
  return currentWindow(freq, addDays(w.start, -1));
}

function inWindow(date: string, w: Window): boolean {
  return date >= w.start && date <= w.end;
}

/**
 * @param visitDates fechas (YYYY-MM-DD) de visitas COMPLETADAS de la tienda.
 */
export function computeObligation(
  freq: Frequency,
  today: string,
  visitDates: string[],
  opts: ObligationOptions = {},
): Obligation {
  const soonDays = opts.soonDays ?? (freq === "semanal" ? 2 : 3);
  const gap = opts.quincenalGapDays ?? 7;
  const sorted = [...visitDates].sort();
  const lastVisit = sorted.length ? sorted[sorted.length - 1] : null;

  const base: Obligation = {
    frequency: freq,
    state: "sin_obligacion",
    window: null,
    doneInWindow: 0,
    pending: 0,
    overdueCarry: 0,
    deadline: null,
    daysToDeadline: null,
    eligibleFrom: null,
    lastVisit,
  };

  const w = currentWindow(freq, today);
  if (!w) return base;

  const prev = previousWindow(freq, w);
  const inCurrent = sorted.filter((d) => inWindow(d, w));
  const prevDone = prev ? sorted.filter((d) => inWindow(d, prev)).length : 0;
  // La ventana anterior solo genera atraso si empezó cuando ya había seguimiento.
  const prevCounts = !!prev && prevDone === 0 && (!opts.trackingStart || prev.start >= opts.trackingStart);
  const carry = prevCounts ? 1 : 0;

  const effectiveDone = Math.max(0, inCurrent.length - carry);
  const currentCounts = !opts.trackingStart || w.end >= opts.trackingStart;
  const pendingCurrent = currentCounts ? Math.max(0, 1 - effectiveDone) : 0;
  const carryOwed = Math.max(0, carry - inCurrent.length);
  const pending = pendingCurrent + carryOwed;

  // Fecha límite: si hay arrastre, vencía al final de la ventana anterior.
  let deadline: string | null = w.end;
  if (carryOwed > 0 && prev) deadline = prev.end;
  const daysToDeadline = diffDays(deadline, today);

  let state: DueState;
  if (pending === 0) state = "cumplida";
  else if (carryOwed > 0) state = "atrasada";
  else if (daysToDeadline <= soonDays) state = "proxima";
  else state = "pendiente";

  let eligibleFrom: string | null = null;
  if (freq === "quincenal" && lastVisit && pending > 0) {
    eligibleFrom = addDays(lastVisit, gap);
  }

  return {
    frequency: freq,
    state,
    window: w,
    doneInWindow: inCurrent.length,
    pending,
    overdueCarry: carryOwed,
    deadline: pending > 0 ? deadline : w.end,
    daysToDeadline,
    eligibleFrom,
    lastVisit,
  };
}

/** Prioridad numérica para ordenar la planificación (mayor = antes). */
export function priorityScore(ob: Obligation, audit: boolean): number {
  let score = 0;
  if (audit) score += 100;
  if (ob.state === "atrasada") score += 80 + Math.min(30, Math.abs(Math.min(0, ob.daysToDeadline ?? 0)));
  else if (ob.state === "proxima") score += 40;
  else if (ob.state === "pendiente") score += 10;
  if (ob.daysToDeadline !== null && ob.state !== "cumplida") {
    score += Math.max(0, 14 - Math.max(0, ob.daysToDeadline));
  }
  return score;
}

export const STATE_LABEL: Record<DueState, string> = {
  sin_obligacion: "Sin obligación",
  cumplida: "Cumplida",
  pendiente: "Pendiente",
  proxima: "Vence pronto",
  atrasada: "Atrasada",
};
