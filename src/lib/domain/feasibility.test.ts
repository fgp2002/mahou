import test from "node:test";
import assert from "node:assert/strict";
import { monthFeasibility, remainingVisits } from "./feasibility.ts";
import { computeObligation } from "./periodicity.ts";

const today = "2026-10-15"; // jueves
const mk = (i: number, frequency: "mensual" | "semanal" | "quincenal", audit = false) => ({
  id: `s${i}`, name: `Tienda ${i}`, frequency, audit, minutes: 45, ob: computeObligation(frequency, today, [], { trackingStart: "2026-10-01" }),
});

test("cuenta las visitas que quedan por periodicidad", () => {
  assert.equal(remainingVisits("mensual", mk(1, "mensual").ob, today), 1);
  assert.equal(remainingVisits("quincenal", mk(1, "quincenal").ob, today), 2, "mitad actual + segunda mitad");
  assert.ok(remainingVisits("semanal", mk(1, "semanal").ob, today) >= 3, "semana actual + semanas restantes");
});

test("detecta un mes inviable y propone acortar visitas", () => {
  const stores = Array.from({ length: 80 }, (_, i) => mk(i, "mensual"));
  const base = { today, stores, workDays: [0, 1, 2, 3, 4], holidays: [], minutesPerDay: 480, driveMinutesPerVisit: 15, includeToday: true };
  const ok = monthFeasibility({ ...base, stores: stores.slice(0, 20) });
  assert.equal(ok.feasible, true);
  const bad = monthFeasibility({ ...base, minutesPerDay: 300 });
  assert.equal(bad.feasible, false);
  assert.ok(bad.atRisk.length > 0, "lista tiendas en riesgo");
  assert.ok(bad.hoursNeeded > bad.hoursAvailable);
});
