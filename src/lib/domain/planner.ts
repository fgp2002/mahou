// Planificador de rutas.
// 1) Selección por zona (pickZone): ancla urgente + tiendas cercanas, penalizando lo lejano a casa.
// 2) Orden (planRoute): sale de casa (nodo fijo), camino abierto (acaba en la última tienda),
//    inserción más barata + mejoras 2-opt y Or-opt sobre un coste mixto tiempo + km,
//    con pausa de comida flexible dentro de una franja.
import { haversineKm } from "./geo.ts";

export interface PlanStore {
  id: string;
  /** minutos que se estima pasar en la tienda */
  minutes: number;
  /** mayor = más prioritaria */
  priority: number;
  /** paradas forzadas por el usuario: se intentan incluir siempre primero */
  forced?: boolean;
}

export interface Lunch { earliest: number; latest: number; minutes: number }

export interface PlanInput {
  stores: PlanStore[];
  /** dur[a][b] en segundos. Si hasHome, el nodo 0 es casa y la tienda i es el nodo i+1. */
  dur: number[][];
  dist: number[][];
  /** minutos desde medianoche */
  startMinutes: number;
  endMinutes: number;
  hasHome?: boolean;
  lunch?: Lunch | null;
  /** minutos de «coste» por km recorrido (equilibrio tiempo/km). 0 = solo tiempo. */
  kmWeight?: number;
}

export type UnscheduledReason = "tiempo" | "no_cabe";

export interface PlannedStop {
  index: number;
  id: string;
  arrivalMinutes: number;
  minutes: number;
  driveSecondsFromPrev: number;
  distanceMFromPrev: number;
}

export interface PlanResult {
  stops: PlannedStop[];
  unscheduled: { index: number; id: string; reason: UnscheduledReason }[];
  totalDriveSeconds: number;
  totalDistanceM: number;
  totalVisitMinutes: number;
  endMinutes: number;
  /** comida: posición (0-based) de la parada tras la que se come, y hora de inicio; null si no aplica */
  lunch: { afterStop: number; start: number } | null;
}

interface Ctx { input: PlanInput; node: (i: number) => number; home: number | null; w: number }

function ctxOf(input: PlanInput): Ctx {
  return { input, node: (i) => (input.hasHome ? i + 1 : i), home: input.hasHome ? 0 : null, w: input.kmWeight ?? 0 };
}

function legCost(c: Ctx, a: number, b: number): number {
  return c.input.dur[a][b] / 60 + (c.w * c.input.dist[a][b]) / 1000;
}

/** Coste del camino (incluye el tramo casa → primera tienda). */
function pathCost(c: Ctx, order: number[]): number {
  let t = 0;
  let prev = c.home;
  for (const i of order) {
    const n = c.node(i);
    if (prev != null) t += legCost(c, prev, n);
    prev = n;
  }
  return t;
}

/** Simula horarios: trayectos, visitas y pausa de comida. */
function simulate(c: Ctx, order: number[]) {
  const { input } = c;
  let clock = input.startMinutes;
  let prev = c.home;
  let lunch: PlanResult["lunch"] = null;
  const legs: { arrival: number; drive: number; dist: number }[] = [];
  order.forEach((i, k) => {
    const n = c.node(i);
    const drive = prev != null ? input.dur[prev][n] : 0;
    const d = prev != null ? input.dist[prev][n] : 0;
    // Comida flexible: se hace en el primer hueco entre tiendas a partir de la hora mínima.
    if (input.lunch && !lunch && k > 0 && clock >= input.lunch.earliest) {
      lunch = { afterStop: k - 1, start: Math.round(clock) };
      clock += input.lunch.minutes;
    }
    clock += drive / 60;
    legs.push({ arrival: clock, drive, dist: d });
    clock += input.stores[i].minutes;
    prev = n;
  });
  return { end: clock, legs, lunch };
}

function feasible(c: Ctx, order: number[]): boolean {
  return simulate(c, order).end <= c.input.endMinutes + 1e-6;
}

/** Mejora local: 2-opt (invertir tramos) y Or-opt (mover 1–3 paradas), con el inicio en casa fijo. */
function improve(c: Ctx, order: number[]): number[] {
  let best = order.slice();
  let bestCost = pathCost(c, best);
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 100) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const cand = best.slice(0, i).concat(best.slice(i, k + 1).reverse(), best.slice(k + 1));
        const cc = pathCost(c, cand);
        if (cc + 1e-9 < bestCost && feasible(c, cand)) { best = cand; bestCost = cc; improved = true; }
      }
    }
    for (let len = 1; len <= 3; len++) {
      for (let i = 0; i + len <= best.length; i++) {
        const seg = best.slice(i, i + len);
        const rest = best.slice(0, i).concat(best.slice(i + len));
        for (let p = 0; p <= rest.length; p++) {
          if (p === i) continue;
          for (const s of [seg, seg.slice().reverse()]) {
            const cand = rest.slice(0, p).concat(s, rest.slice(p));
            const cc = pathCost(c, cand);
            if (cc + 1e-9 < bestCost && feasible(c, cand)) { best = cand; bestCost = cc; improved = true; }
          }
        }
      }
    }
  }
  return best;
}

function tryInsert(c: Ctx, order: number[], i: number): number[] | null {
  let bestOrder: number[] | null = null;
  let bestCost = Infinity;
  for (let pos = 0; pos <= order.length; pos++) {
    const cand = order.slice(0, pos).concat([i], order.slice(pos));
    const cc = pathCost(c, cand);
    if (cc < bestCost && feasible(c, cand)) { bestCost = cc; bestOrder = cand; }
  }
  return bestOrder;
}

export function planRoute(input: PlanInput): PlanResult {
  const c = ctxOf(input);
  const { stores } = input;
  const budget = input.endMinutes - input.startMinutes;

  const ranking = stores
    .map((s, i) => ({ s, i }))
    .sort((a, b) => Number(!!b.s.forced) - Number(!!a.s.forced) || b.s.priority - a.s.priority || a.i - b.i);

  let order: number[] = [];
  const pending: { s: PlanStore; i: number }[] = [];
  const unscheduled: PlanResult["unscheduled"] = [];

  for (const r of ranking) {
    if (r.s.minutes > budget) { unscheduled.push({ index: r.i, id: r.s.id, reason: "no_cabe" }); continue; }
    const next = tryInsert(c, order, r.i);
    if (next) order = next; else pending.push(r);
  }
  order = improve(c, order);
  // Con el orden mejorado puede quedar hueco: segundo intento con las que no entraron.
  for (const r of pending) {
    const next = tryInsert(c, order, r.i);
    if (next) order = improve(c, next); else unscheduled.push({ index: r.i, id: r.s.id, reason: "tiempo" });
  }

  const sim = simulate(c, order);
  const stops: PlannedStop[] = order.map((idx, k) => ({
    index: idx, id: stores[idx].id, arrivalMinutes: Math.round(sim.legs[k].arrival), minutes: stores[idx].minutes,
    driveSecondsFromPrev: sim.legs[k].drive, distanceMFromPrev: sim.legs[k].dist,
  }));
  return {
    stops,
    unscheduled,
    totalDriveSeconds: stops.reduce((a, s) => a + s.driveSecondsFromPrev, 0),
    totalDistanceM: stops.reduce((a, s) => a + s.distanceMFromPrev, 0),
    totalVisitMinutes: stops.reduce((a, s) => a + s.minutes, 0),
    endMinutes: Math.round(sim.end),
    lunch: sim.lunch,
  };
}

/** Recalcula horarios de una ruta con un orden ya fijado (edición manual). Mismos índices de matriz que planRoute. */
export function scheduleFixedOrder(
  order: { id: string; minutes: number }[],
  dur: number[][],
  dist: number[][],
  startMinutes: number,
  opts: { hasHome?: boolean; lunch?: Lunch | null } = {},
): PlanResult {
  const input: PlanInput = {
    stores: order.map((o) => ({ id: o.id, minutes: o.minutes, priority: 0 })), dur, dist,
    startMinutes, endMinutes: Infinity, hasHome: opts.hasHome, lunch: opts.lunch ?? null,
  };
  const c = ctxOf(input);
  const idx = order.map((_, k) => k);
  const sim = simulate(c, idx);
  const stops: PlannedStop[] = idx.map((k) => ({
    index: k, id: order[k].id, arrivalMinutes: Math.round(sim.legs[k].arrival), minutes: order[k].minutes,
    driveSecondsFromPrev: sim.legs[k].drive, distanceMFromPrev: sim.legs[k].dist,
  }));
  return {
    stops, unscheduled: [],
    totalDriveSeconds: stops.reduce((a, s) => a + s.driveSecondsFromPrev, 0),
    totalDistanceM: stops.reduce((a, s) => a + s.distanceMFromPrev, 0),
    totalVisitMinutes: stops.reduce((a, s) => a + s.minutes, 0),
    endMinutes: Math.round(sim.end),
    lunch: sim.lunch,
  };
}

// ── Selección por zona ─────────────────────────────────────────────────────
// La ruta del día se construye alrededor de un «ancla» (la tienda más urgente teniendo en cuenta
// lo lejos que está de casa) y se rellena con las pendientes CERCANAS. Cada km al ancla y a casa
// resta prioridad, y hay un tope de Audit por día para repartirlas entre jornadas.

export interface ZoneCandidate { id: string; lat: number; lng: number; score: number; audit: boolean; overdue: boolean; forced?: boolean }
export interface ZoneOptions {
  max: number; maxAudits: number;
  /** puntos de prioridad que resta cada km de distancia al ancla */
  kmPenalty: number;
  radiusKm: number;
  /** casa (punto de salida) y puntos que resta cada km de distancia a casa */
  home?: { lat: number; lng: number } | null;
  homePenalty?: number;
}
export type ZoneDropReason = "otra_zona" | "limite_audit" | "fuera_candidatos";
export interface ZonePick { picked: { id: string; priority: number; distKm: number }[]; dropped: { id: string; reason: ZoneDropReason }[] }

export const ZONE_DEFAULTS: ZoneOptions = { max: 24, maxAudits: 2, kmPenalty: 4, radiusKm: 30, homePenalty: 1.5 };

export function pickZone(cands: ZoneCandidate[], o: ZoneOptions = ZONE_DEFAULTS): ZonePick {
  const res: ZonePick = { picked: [], dropped: [] };
  if (!cands.length) return res;
  const hp = o.home ? (o.homePenalty ?? 0) : 0;
  const dHome = (c: ZoneCandidate) => (o.home ? haversineKm(o.home, c) : 0);
  // Ancla: la más urgente una vez descontada la distancia a casa (equilibrio urgencia/cercanía).
  const byUrgency = [...cands].sort((a, b) => Number(!!b.forced) - Number(!!a.forced) || (b.score - hp * dHome(b)) - (a.score - hp * dHome(a)));
  const anchors = byUrgency.filter((c) => c.forced);
  if (!anchors.length) anchors.push(byUrgency[0]);
  const near = (c: ZoneCandidate) => Math.min(...anchors.map((a) => haversineKm(a, c)));

  const ranked = byUrgency
    .map((c) => { const d = near(c); return { c, d, adj: c.score - o.kmPenalty * d - hp * dHome(c) }; })
    .sort((a, b) => Number(!!b.c.forced) - Number(!!a.c.forced) || b.adj - a.adj);

  let audits = 0;
  for (const { c, d, adj } of ranked) {
    if (!c.forced && d > o.radiusKm) { res.dropped.push({ id: c.id, reason: "otra_zona" }); continue; }
    if (c.audit && !c.forced) {
      // Tope de Audit al día; una Audit atrasada puede ocupar una plaza extra.
      const limit = o.maxAudits + (c.overdue ? 1 : 0);
      if (audits >= limit) { res.dropped.push({ id: c.id, reason: "limite_audit" }); continue; }
    }
    if (res.picked.length >= o.max) { res.dropped.push({ id: c.id, reason: "fuera_candidatos" }); continue; }
    if (c.audit) audits++;
    res.picked.push({ id: c.id, priority: adj, distKm: d });
  }
  return res;
}
