import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonths, annualEquivalent, committedIn, deltaPct, findDuplicates, monthlyEquivalent, monthsSpan, parseRange, previousRange, schedule, totals, lastMonths, daysToEnd } from "../economy.ts";

test("sumar meses respeta el fin de mes", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-11-15", 2), "2027-01-15");
  assert.equal(addMonths("2026-03-01", -3), "2025-12-01");
  assert.equal(monthsSpan("2026-01-10", "2026-03-05"), 3);
});

test("equivalentes mensual y anual", () => {
  assert.equal(monthlyEquivalent({ start_date: "2026-01-01", end_date: null, periodicity: "mensual", amount: 1160 }), 1160);
  assert.equal(annualEquivalent({ start_date: "2026-01-01", end_date: null, periodicity: "mensual", amount: 1160 }), 13920);
  assert.equal(monthlyEquivalent({ start_date: "2026-01-01", end_date: null, periodicity: "trimestral", amount: 900 }), 300);
  assert.equal(annualEquivalent({ start_date: "2026-01-01", end_date: null, periodicity: "anual", amount: 2400 }), 2400);
  // Puntual de 1.800 € con vigencia de 6 meses: 300 €/mes; su anual es el propio importe.
  const p = { start_date: "2026-01-01", end_date: "2026-06-30", periodicity: "puntual" as const, amount: 1800 };
  assert.equal(monthlyEquivalent(p), 300);
  assert.equal(annualEquivalent(p), 1800);
});

test("calendario de periodos", () => {
  assert.deepEqual(schedule({ start_date: "2026-01-15", end_date: "2026-04-30", periodicity: "mensual", amount: 1 }, "2026-12-31"), ["2026-01-15", "2026-02-15", "2026-03-15", "2026-04-15"]);
  assert.deepEqual(schedule({ start_date: "2026-01-01", end_date: null, periodicity: "trimestral", amount: 1 }, "2026-08-01"), ["2026-01-01", "2026-04-01", "2026-07-01"]);
  assert.deepEqual(schedule({ start_date: "2026-05-01", end_date: null, periodicity: "puntual", amount: 1 }, "2026-12-31"), ["2026-05-01"]);
  assert.deepEqual(schedule({ start_date: "2027-01-01", end_date: null, periodicity: "mensual", amount: 1 }, "2026-12-31"), []);
});

test("comprometido solo cuenta acuerdos firmes y periodos dentro del intervalo", () => {
  const a = { start_date: "2026-01-01", end_date: null, periodicity: "mensual" as const, amount: 1160, quantity: 115, status: "en_ejecucion" as const };
  assert.deepEqual(committedIn(a, "2026-11-01", "2026-11-30"), { amount: 1160, quantity: 115, periods: 1 });
  assert.deepEqual(committedIn(a, "2026-01-01", "2026-12-31"), { amount: 13920, quantity: 1380, periods: 12 });
  assert.equal(committedIn({ ...a, status: "borrador" }, "2026-11-01", "2026-11-30").amount, 0);
});

test("totales separan dinero y especie, y no cuentan cancelados", () => {
  const t = totals([
    { amount: 1800, status: "abonado", settlement: "dinero", payment_date: "2026-11-02" },
    { amount: 1760, status: "abonado", settlement: "especie", quantity: 115, unit: "horas", payment_date: "2026-11-03" },
    { amount: 600, status: "comprobado", settlement: "dinero", payment_date: "2026-11-04" },
    { amount: 300, status: "previsto", settlement: "dinero", payment_date: "2026-11-05" },
    { amount: 999, status: "cancelado", settlement: "dinero", payment_date: "2026-11-06" },
  ]);
  assert.equal(t.paidCash, 1800);
  assert.equal(t.paidInKind, 1760);
  assert.equal(t.units.horas, 115);
  assert.equal(t.executed, 1800 + 1760 + 600);
  assert.equal(t.pending, 600 + 300);
  assert.equal(t.approved, 1800 + 1760 + 600);
  assert.equal(t.count, 4);
});

test("posibles duplicados: misma tienda, concepto y mes", () => {
  const base = { store_id: "s1", payment_type_id: "t1", payment_date: "2026-11-02", status: "abonado" as const };
  const g = findDuplicates([{ ...base, id: "a" }, { ...base, id: "b", payment_date: "2026-11-20" }, { ...base, id: "c", payment_date: "2026-12-01" }, { ...base, id: "d", status: "cancelado" as const }]);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].map((p) => p.id), ["a", "b"]);
});

test("periodos de consulta y comparación", () => {
  const r = parseRange({}, "2026-11-13");
  assert.deepEqual([r.from, r.to, r.kind], ["2026-11-01", "2026-11-30", "mes"]);
  assert.deepEqual([previousRange(r).from, previousRange(r).to], ["2026-10-01", "2026-10-31"]);
  const y = parseRange({ period: "2026" }, "2026-11-13");
  assert.deepEqual([y.from, y.to, previousRange(y).from], ["2026-01-01", "2026-12-31", "2025-01-01"]);
  const c = parseRange({ from: "2026-11-01", to: "2026-11-10" }, "2026-11-13");
  assert.deepEqual([previousRange(c).from, previousRange(c).to], ["2026-10-22", "2026-10-31"]);
  assert.deepEqual(lastMonths("2026-11-13", 3), ["2026-09-01", "2026-10-01", "2026-11-01"]);
  assert.equal(deltaPct(150, 100), 50);
  assert.equal(deltaPct(0, 0), 0);
  assert.equal(deltaPct(10, 0), null);
  assert.equal(daysToEnd("2026-11-23", "2026-11-13"), 10);
});
