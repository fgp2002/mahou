import { test } from "node:test";
import assert from "node:assert/strict";
import { daysOpen, incidentStatusPatch, isOpen, sortIncidents } from "../incidents.ts";
import { hoursSummary, opensOn, visitWindow, weekdayMon0 } from "./hours.ts";

test("cerrar una incidencia fija la fecha; reabrir la quita", () => {
  assert.deepEqual(incidentStatusPatch("resuelta", "2026-11-13", "2026-11-01"), { status: "resuelta", resolved_on: "2026-11-13" });
  assert.deepEqual(incidentStatusPatch("descartada", "2026-11-13", "2026-11-01", "2026-11-05"), { status: "descartada", resolved_on: "2026-11-05" });
  assert.deepEqual(incidentStatusPatch("resuelta", "2026-11-13", "2026-11-10", "2026-11-01"), { status: "resuelta", resolved_on: "2026-11-10" }, "nunca antes de abrirse");
  assert.deepEqual(incidentStatusPatch("en_seguimiento", "2026-11-13", "2026-11-01"), { status: "en_seguimiento", resolved_on: null });
  assert.equal(isOpen("en_seguimiento"), true);
  assert.equal(isOpen("descartada"), false);
});

test("orden: abiertas, prioridad alta y más antiguas primero", () => {
  const xs = sortIncidents([
    { id: "a", status: "resuelta" as const, priority: "alta" as const, opened_on: "2026-10-01" },
    { id: "b", status: "abierta" as const, priority: "baja" as const, opened_on: "2026-10-01" },
    { id: "c", status: "abierta" as const, priority: "alta" as const, opened_on: "2026-11-01" },
    { id: "d", status: "en_seguimiento" as const, priority: "alta" as const, opened_on: "2026-10-15" },
  ]);
  assert.deepEqual(xs.map((x) => x.id), ["d", "c", "b", "a"]);
  assert.equal(daysOpen({ opened_on: "2026-11-01", resolved_on: null }, "2026-11-13"), 12);
});

test("horarios de tienda", () => {
  assert.equal(weekdayMon0("2026-11-16"), 0, "16/11/2026 es lunes");
  assert.equal(weekdayMon0("2026-11-15"), 6, "15/11/2026 es domingo");
  const h = { opening_days: [0, 1, 2, 3, 4, 5], open_time: "09:00:00", close_time: "21:30:00", preferred_from: "10:00", preferred_to: "12:00", extra_minutes: 10 };
  assert.equal(opensOn(h, "2026-11-15"), false);
  assert.equal(opensOn(h, "2026-11-16"), true);
  assert.equal(opensOn({}, "2026-11-15"), true, "sin días = abre siempre");
  assert.deepEqual(visitWindow(h), { from: 600, to: 720 });
  assert.deepEqual(visitWindow({ open_time: "09:00", close_time: "21:30" }), { from: 540, to: 1290 });
  assert.equal(visitWindow({}), null);
  assert.equal(hoursSummary(h), "L–S · 09:00–21:30 · mejor 10:00–12:00 · +10 min de acceso");
});
