import test from "node:test";
import assert from "node:assert/strict";
import { computeObligation, currentWindow, priorityScore, suggestNextVisit } from "./periodicity.ts";

const opts = { trackingStart: "2026-01-01" };

test("ventanas", () => {
  assert.deepEqual(currentWindow("semanal", "2026-10-14"), { start: "2026-10-12", end: "2026-10-18" });
  assert.deepEqual(currentWindow("mensual", "2026-10-14"), { start: "2026-10-01", end: "2026-10-31" });
  assert.deepEqual(currentWindow("quincenal", "2026-10-14"), { start: "2026-10-01", end: "2026-10-15" });
  assert.deepEqual(currentWindow("quincenal", "2026-10-16"), { start: "2026-10-16", end: "2026-10-31" });
  assert.deepEqual(currentWindow("quincenal", "2026-02-20"), { start: "2026-02-16", end: "2026-02-28" });
  assert.equal(currentWindow("ninguna", "2026-10-14"), null);
});

test("ninguna no genera obligación pero admite visitas", () => {
  const o = computeObligation("ninguna", "2026-10-14", ["2026-10-10"], opts);
  assert.equal(o.state, "sin_obligacion");
  assert.equal(o.pending, 0);
  assert.equal(o.lastVisit, "2026-10-10");
});

test("mensual: una visita en el mes la cumple", () => {
  const sin = computeObligation("mensual", "2026-10-14", ["2026-09-20"], opts);
  assert.equal(sin.state, "pendiente");
  assert.equal(sin.pending, 1);
  const con = computeObligation("mensual", "2026-10-14", ["2026-09-20", "2026-10-02"], opts);
  assert.equal(con.state, "cumplida");
  assert.equal(con.pending, 0);
});

test("visitas adicionales no rompen el cumplimiento", () => {
  const o = computeObligation("mensual", "2026-10-14", ["2026-10-02", "2026-10-09", "2026-10-13"], opts);
  assert.equal(o.state, "cumplida");
  assert.equal(o.doneInWindow, 3);
});

test("mensual: vence pronto a final de mes", () => {
  const o = computeObligation("mensual", "2026-10-29", ["2026-09-20"], opts);
  assert.equal(o.state, "proxima");
  assert.equal(o.daysToDeadline, 2);
});

test("semanal: el mes anterior no cuenta, la semana sí", () => {
  const o = computeObligation("semanal", "2026-10-14", ["2026-10-05"], opts);
  // semana anterior cumplida; semana actual sin visita
  assert.equal(o.state, "pendiente");
  assert.equal(o.overdueCarry, 0);
});

test("semanal: semana anterior sin visita -> atrasada y arrastre", () => {
  const o = computeObligation("semanal", "2026-10-14", ["2026-09-25"], opts);
  assert.equal(o.state, "atrasada");
  assert.equal(o.overdueCarry, 1);
  assert.equal(o.pending, 2);
});

test("la primera visita regulariza el arrastre y la ventana actual sigue pendiente (sin contar dos veces)", () => {
  const o = computeObligation("semanal", "2026-10-14", ["2026-09-25", "2026-10-13"], opts);
  assert.equal(o.overdueCarry, 0);
  assert.equal(o.pending, 1);
  assert.equal(o.state, "pendiente");
  const dos = computeObligation("semanal", "2026-10-15", ["2026-09-25", "2026-10-13", "2026-10-14"], opts);
  assert.equal(dos.pending, 0);
  assert.equal(dos.state, "cumplida");
});

test("quincenal: dos ventanas por mes y separación entre visitas", () => {
  const a = computeObligation("quincenal", "2026-10-20", ["2026-10-08"], opts);
  assert.equal(a.state, "pendiente"); // 2ª quincena sin visita; la 1ª está cumplida
  assert.equal(a.eligibleFrom, "2026-10-15");
  const b = computeObligation("quincenal", "2026-10-16", ["2026-10-15"], opts);
  assert.equal(b.eligibleFrom, "2026-10-22"); // no se agrupan en días consecutivos
});

test("quincenal: primera quincena sin visita arrastra a la segunda", () => {
  const o = computeObligation("quincenal", "2026-10-18", [], opts);
  assert.equal(o.state, "atrasada");
  assert.equal(o.pending, 2);
});

test("trackingStart: sin historial anterior no hay atraso", () => {
  const o = computeObligation("semanal", "2026-10-14", [], { trackingStart: "2026-10-14" });
  assert.equal(o.state, "pendiente");
  assert.equal(o.overdueCarry, 0);
  const q = computeObligation("quincenal", "2026-10-18", [], { trackingStart: "2026-10-14" });
  assert.equal(q.overdueCarry, 0);
});

test("la prioridad de auditoría gana a las demás pero no las elimina", () => {
  const a = computeObligation("mensual", "2026-10-14", ["2026-09-20"], opts);
  const audit = priorityScore(a, true);
  const normal = priorityScore(a, false);
  assert.ok(audit > normal);
  assert.ok(normal > 0);
  const atrasada = computeObligation("semanal", "2026-10-14", [], opts);
  assert.ok(priorityScore(atrasada, false) > priorityScore(a, false));
});

test("cancelar o eliminar una visita recalcula el cumplimiento", () => {
  const con = computeObligation("mensual", "2026-10-14", ["2026-09-20", "2026-10-02"], opts);
  const sin = computeObligation("mensual", "2026-10-14", ["2026-09-20"], opts);
  assert.equal(con.state, "cumplida");
  assert.equal(sin.state, "pendiente");
});

test("próxima visita sugerida", () => {
  assert.equal(suggestNextVisit("semanal", "2026-10-14"), "2026-10-19");
  assert.equal(suggestNextVisit("quincenal", "2026-10-14"), "2026-10-21"); // el 16 queda a <7 días
  assert.equal(suggestNextVisit("quincenal", "2026-10-02"), "2026-10-16");
  assert.equal(suggestNextVisit("mensual", "2026-10-14"), "2026-11-01");
  assert.equal(suggestNextVisit("ninguna", "2026-10-14"), null);
});
