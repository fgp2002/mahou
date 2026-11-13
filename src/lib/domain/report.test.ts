import { test } from "node:test";
import assert from "node:assert/strict";
import { complianceInRange, windowsInRange, sumCompliance, pct } from "./report.ts";

test("ventanas de cada periodicidad dentro de un mes", () => {
  assert.equal(windowsInRange("mensual", "2026-11-01", "2026-11-30").length, 1);
  assert.equal(windowsInRange("quincenal", "2026-11-01", "2026-11-30").length, 2);
  // Noviembre 2026: semanas que lo tocan, del lunes 26/10 al lunes 30/11.
  assert.equal(windowsInRange("semanal", "2026-11-01", "2026-11-30").length, 6);
  assert.equal(windowsInRange("ninguna", "2026-11-01", "2026-11-30").length, 0);
  assert.equal(windowsInRange("mensual", "2026-01-01", "2026-12-31").length, 12);
});

test("cumplimiento: hecho, pendiente (abierto) e incumplido (cerrado)", () => {
  const q = complianceInRange("quincenal", false, ["2026-11-03"], "2026-11-01", "2026-11-30", "2026-11-20");
  assert.deepEqual(q, { required: 2, done: 1, pending: 1, missed: 0, visits: 1 });
  const m = complianceInRange("mensual", false, [], "2026-10-01", "2026-10-31", "2026-11-13");
  assert.deepEqual(m, { required: 1, done: 0, pending: 0, missed: 1, visits: 0 });
  // Audit sin periodicidad cuenta como mensual.
  assert.equal(complianceInRange("ninguna", true, ["2026-11-02"], "2026-11-01", "2026-11-30", "2026-11-13").done, 1);
  // Antes del inicio del seguimiento no hay obligación.
  assert.equal(complianceInRange("mensual", false, [], "2026-09-01", "2026-09-30", "2026-11-13", "2026-10-14").required, 0);
  // Las ventanas futuras no cuentan.
  assert.equal(complianceInRange("mensual", false, [], "2026-11-01", "2027-02-28", "2026-11-13").required, 1);
});

test("sumas y porcentajes", () => {
  const s = sumCompliance([{ required: 2, done: 1, pending: 1, missed: 0, visits: 1 }, { required: 1, done: 1, pending: 0, missed: 0, visits: 2 }]);
  assert.deepEqual(s, { required: 3, done: 2, pending: 1, missed: 0, visits: 3 });
  assert.equal(pct(2, 3), 66.7);
  assert.equal(pct(0, 0), null);
});
