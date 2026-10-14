import test from "node:test";
import assert from "node:assert/strict";
import { planRoute, scheduleFixedOrder } from "./planner.ts";
import { estimateMatrix } from "./geo.ts";

// Cuatro puntos: A y B muy cerca entre sí, C y D lejos.
const pts = [
  { lat: 36.72, lng: -4.42 },
  { lat: 36.721, lng: -4.421 },
  { lat: 37.2, lng: -4.8 },
  { lat: 36.5, lng: -4.9 },
];

function input(stores: any[], endMinutes = 18 * 60) {
  const m = estimateMatrix(pts.slice(0, stores.length));
  return { stores, dur: m.dur, dist: m.dist, startMinutes: 9 * 60, endMinutes };
}

test("incluye todo si cabe y respeta la jornada", () => {
  const r = planRoute(input([
    { id: "a", minutes: 60, priority: 10 },
    { id: "b", minutes: 60, priority: 10 },
  ]));
  assert.equal(r.stops.length, 2);
  assert.equal(r.unscheduled.length, 0);
  assert.ok(r.endMinutes <= 18 * 60);
  assert.equal(r.stops[0].arrivalMinutes, 9 * 60);
});

test("la auditoría (mayor prioridad) entra antes y lo que no cabe se reporta con motivo", () => {
  // jornada de 3 h: caben dos visitas de 60 min + traslado corto, la tercera no
  const r = planRoute(input([
    { id: "normal1", minutes: 60, priority: 10 },
    { id: "audit", minutes: 60, priority: 110 },
    { id: "lejos", minutes: 60, priority: 5 },
    { id: "normal2", minutes: 60, priority: 12 },
  ], 12 * 60));
  const ids = r.stops.map((s) => s.id);
  assert.ok(ids.includes("audit"));
  assert.ok(r.unscheduled.length >= 1);
  for (const u of r.unscheduled) assert.ok(["tiempo", "no_cabe"].includes(u.reason));
  assert.ok(r.endMinutes <= 12 * 60);
});

test("una visita más larga que la jornada se marca como no_cabe", () => {
  const r = planRoute(input([{ id: "x", minutes: 600, priority: 1 }], 18 * 60));
  assert.equal(r.stops.length, 0);
  assert.equal(r.unscheduled[0].reason, "no_cabe");
});

test("agrupa por cercanía: A y B consecutivas", () => {
  const r = planRoute(input([
    { id: "a", minutes: 30, priority: 10 },
    { id: "c", minutes: 30, priority: 10 },
    { id: "b", minutes: 30, priority: 10 },
  ]).stores && {
    stores: [
      { id: "a", minutes: 30, priority: 10 },
      { id: "c", minutes: 30, priority: 10 },
      { id: "b", minutes: 30, priority: 10 },
    ],
    ...(() => { const m = estimateMatrix([pts[0], pts[2], pts[1]]); return { dur: m.dur, dist: m.dist }; })(),
    startMinutes: 540,
    endMinutes: 1080,
  });
  const ids = r.stops.map((s) => s.id);
  const ia = ids.indexOf("a");
  const ib = ids.indexOf("b");
  assert.equal(Math.abs(ia - ib), 1);
});

test("una parada forzada se incluye antes que el resto", () => {
  const r = planRoute(input([
    { id: "a", minutes: 120, priority: 100 },
    { id: "b", minutes: 120, priority: 1, forced: true },
  ], 9 * 60 + 130));
  assert.deepEqual(r.stops.map((s) => s.id), ["b"]);
});

test("orden fijo manual recalcula horarios", () => {
  const m = estimateMatrix([pts[0], pts[2]]);
  const r = scheduleFixedOrder([{ id: "a", minutes: 60 }, { id: "c", minutes: 30 }], m.dur, m.dist, 540);
  assert.equal(r.stops[0].arrivalMinutes, 540);
  assert.ok(r.stops[1].arrivalMinutes > 600);
});

import { pickZone } from "./planner.ts";

test("la zona se construye alrededor del ancla y limita las Audit por día", () => {
  const base = { lat: 36.72, lng: -4.42 };
  const at = (dLat: number) => ({ lat: base.lat + dLat, lng: base.lng });
  const r = pickZone([
    { id: "audit1", ...at(0), score: 130, audit: true, overdue: false },
    { id: "audit2", ...at(0.01), score: 125, audit: true, overdue: false },
    { id: "audit3", ...at(0.02), score: 120, audit: true, overdue: false },
    { id: "cerca", ...at(0.005), score: 20, audit: false, overdue: false },
    { id: "lejos", ...at(0.6), score: 90, audit: false, overdue: true },
  ], { max: 25, maxAudits: 2, kmPenalty: 4, radiusKm: 30 });
  const ids = r.picked.map((p) => p.id);
  assert.deepEqual(ids.slice(0, 2), ["audit1", "audit2"]);
  assert.ok(ids.includes("cerca"), "incluye la pendiente cercana");
  assert.equal(r.dropped.find((d) => d.id === "audit3")?.reason, "limite_audit");
  assert.equal(r.dropped.find((d) => d.id === "lejos")?.reason, "otra_zona");
});
