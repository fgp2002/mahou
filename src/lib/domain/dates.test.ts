import test from "node:test";
import assert from "node:assert/strict";
import { addDays, diffDays, madridDate, madridHour, monthEnd, weekStart, weekdayMon0, fmtHM, parseHM } from "./dates.ts";

test("aritmética de fechas", () => {
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(diffDays("2026-10-20", "2026-10-14"), 6);
  assert.equal(monthEnd("2028-02-10"), "2028-02-29");
});

test("semana ISO empieza en lunes", () => {
  assert.equal(weekdayMon0("2026-10-14"), 2); // miércoles
  assert.equal(weekStart("2026-10-14"), "2026-10-12");
  assert.equal(weekStart("2026-10-18"), "2026-10-12"); // domingo
});

test("zona horaria Madrid: verano e invierno", () => {
  // 16:30 UTC en octubre (CEST, UTC+2) = 18:30 Madrid
  assert.equal(madridHour(new Date("2026-10-14T16:30:00Z")), 18);
  // 17:30 UTC en diciembre (CET, UTC+1) = 18:30 Madrid
  assert.equal(madridHour(new Date("2026-12-14T17:30:00Z")), 18);
  // 23:30 UTC el 14 en verano ya es día 15 en Madrid
  assert.equal(madridDate(new Date("2026-10-14T23:30:00Z")), "2026-10-15");
});

test("horas", () => {
  assert.equal(parseHM("09:00"), 540);
  assert.equal(fmtHM(615), "10:15");
});
