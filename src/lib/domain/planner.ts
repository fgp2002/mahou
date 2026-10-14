import { haversineKm } from "./geo.ts";
// Planificador de rutas: selección por prioridad con inserción más barata
// y mejora local 2-opt sobre la matriz de tiempos. No usa orden alfabético
// ni distancia en línea recta como si fuera una ruta optimizada: trabaja
// con la matriz de tiempos que se le entregue (por carretera o estimada).

export interface PlanStore {
  id: string;
  /** minutos que se estima pasar en la tienda */
  minutes: number;
  /** mayor = más prioritaria */
  priority: number;
  /** paradas forzadas por el usuario: se intentan incluir siempre primero */
  forced?: boolean;
}

export interface PlanInput {
  stores: PlanStore[];
  /** dur[i][j] en segundos entre tiendas (mismos índices que `stores`) */
  dur: number[][];
  dist: number[][];
  /** minutos desde medianoche */
  startMinutes: number;
  endMinutes: number;
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
}

function routeDriveSeconds(order: number[], dur: number[][]): number {
  let t = 0;
  for (let k = 1; k < order.length; k++) t += dur[order[k - 1]][order[k]];
  return t;
}

function totalMinutes(order: number[], input: PlanInput): number {
  const visit = order.reduce((acc, i) => acc + input.stores[i].minutes, 0);
  return visit + routeDriveSeconds(order, input.dur) / 60;
}

function twoOpt(order: number[], dur: number[][]): number[] {
  let best = order.slice();
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 200) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const cand = best.slice(0, i).concat(best.slice(i, k + 1).reverse(), best.slice(k + 1));
        if (routeDriveSeconds(cand, dur) + 1e-9 < routeDriveSeconds(best, dur)) {
          best = cand;
          improved = true;
        }
      }
    }
  }
  return best;
}

export function planRoute(input: PlanInput): PlanResult {
  const { stores, dur, dist } = input;
  const budget = input.endMinutes - input.startMinutes;

  const ranking = stores
    .map((s, i) => ({ s, i }))
    .sort((a, b) => Number(!!b.s.forced) - Number(!!a.s.forced) || b.s.priority - a.s.priority || a.i - b.i);

  let order: number[] = [];
  const unscheduled: PlanResult["unscheduled"] = [];

  for (const { s, i } of ranking) {
    if (s.minutes > budget) {
      unscheduled.push({ index: i, id: s.id, reason: "no_cabe" });
      continue;
    }
    let bestPos = -1;
    let bestTotal = Infinity;
    for (let pos = 0; pos <= order.length; pos++) {
      const cand = order.slice(0, pos).concat([i], order.slice(pos));
      const total = totalMinutes(cand, input);
      if (total < bestTotal) {
        bestTotal = total;
        bestPos = pos;
      }
    }
    if (bestTotal <= budget) {
      order = order.slice(0, bestPos).concat([i], order.slice(bestPos));
    } else {
      unscheduled.push({ index: i, id: s.id, reason: "tiempo" });
    }
  }

  order = twoOpt(order, dur);

  const stops: PlannedStop[] = [];
  let clock = input.startMinutes;
  let totalDrive = 0;
  let totalDist = 0;
  let totalVisit = 0;
  order.forEach((idx, k) => {
    const drive = k === 0 ? 0 : dur[order[k - 1]][idx];
    const d = k === 0 ? 0 : dist[order[k - 1]][idx];
    clock += drive / 60;
    stops.push({
      index: idx,
      id: stores[idx].id,
      arrivalMinutes: Math.round(clock),
      minutes: stores[idx].minutes,
      driveSecondsFromPrev: drive,
      distanceMFromPrev: d,
    });
    clock += stores[idx].minutes;
    totalDrive += drive;
    totalDist += d;
    totalVisit += stores[idx].minutes;
  });

  return {
    stops,
    unscheduled,
    totalDriveSeconds: totalDrive,
    totalDistanceM: totalDist,
    totalVisitMinutes: totalVisit,
    endMinutes: Math.round(clock),
  };
}

/** Recalcula horarios de una ruta con un orden ya fijado (edición manual). */
export function scheduleFixedOrder(
  order: { id: string; minutes: number }[],
  dur: number[][],
  dist: number[][],
  startMinutes: number,
): PlanResult {
  let clock = startMinutes;
  let totalDrive = 0;
  let totalDist = 0;
  let totalVisit = 0;
  const stops: PlannedStop[] = order.map((o, k) => {
    const drive = k === 0 ? 0 : dur[k - 1][k];
    const d = k === 0 ? 0 : dist[k - 1][k];
    clock += drive / 60;
    const stop: PlannedStop = {
      index: k,
      id: o.id,
      arrivalMinutes: Math.round(clock),
      minutes: o.minutes,
      driveSecondsFromPrev: drive,
      distanceMFromPrev: d,
    };
    clock += o.minutes;
    totalDrive += drive;
    totalDist += d;
    totalVisit += o.minutes;
    return stop;
  });
  return {
    stops,
    unscheduled: [],
    totalDriveSeconds: totalDrive,
    totalDistanceM: totalDist,
    totalVisitMinutes: totalVisit,
    endMinutes: Math.round(clock),
  };
}

// ── Selección por zona ─────────────────────────────────────────────────────
// La ruta del día se construye alrededor de un «ancla» (la tienda más urgente, normalmente
// una Audit) y se rellena con las pendientes CERCANAS. Cada km de distancia al ancla resta
// prioridad, y hay un tope de Audit por día para repartirlas entre jornadas.


export interface ZoneCandidate { id: string; lat: number; lng: number; score: number; audit: boolean; overdue: boolean; forced?: boolean }
export interface ZoneOptions { max: number; maxAudits: number; kmPenalty: number; radiusKm: number }
export type ZoneDropReason = "otra_zona" | "limite_audit" | "fuera_candidatos";
export interface ZonePick { picked: { id: string; priority: number; distKm: number }[]; dropped: { id: string; reason: ZoneDropReason }[] }

export const ZONE_DEFAULTS: ZoneOptions = { max: 25, maxAudits: 2, kmPenalty: 4, radiusKm: 30 };

export function pickZone(cands: ZoneCandidate[], o: ZoneOptions = ZONE_DEFAULTS): ZonePick {
  const res: ZonePick = { picked: [], dropped: [] };
  if (!cands.length) return res;
  const byScore = [...cands].sort((a, b) => Number(!!b.forced) - Number(!!a.forced) || b.score - a.score);
  const anchors = byScore.filter((c) => c.forced);
  if (!anchors.length) anchors.push(byScore[0]);
  const near = (c: ZoneCandidate) => Math.min(...anchors.map((a) => haversineKm(a, c)));

  const ranked = byScore
    .map((c) => { const d = near(c); return { c, d, adj: c.score - o.kmPenalty * d }; })
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
