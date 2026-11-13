import { test } from "node:test";
import assert from "node:assert/strict";
import { describeEvent, equipmentTitle, groupOf, isPresent, statusPatch, validateEquipment } from "../equipment.ts";
import { parseAmount, paymentValues } from "../paymentRecord.ts";

test("cada estado cae en su pestaña", () => {
  assert.equal(groupOf("activo"), "actuales");
  assert.equal(groupOf("instalado"), "actuales");
  assert.equal(groupOf("pendiente_revision"), "revisar");
  assert.equal(groupOf("deteriorado"), "revisar");
  assert.equal(groupOf("pendiente_instalacion"), "revisar");
  assert.equal(groupOf("retirado"), "retirados");
  assert.equal(isPresent("deteriorado"), true);
  assert.equal(isPresent("retirado"), false);
  assert.equal(isPresent("pendiente_instalacion"), false);
});

test("retirar pone fecha de retirada; reponer la quita", () => {
  const cur = { status: "activo" as const, installed_on: "2026-10-01", removed_on: null };
  assert.deepEqual(statusPatch(cur, "retirado", "2026-11-13"), { status: "retirado", removed_on: "2026-11-13" });
  assert.deepEqual(statusPatch(cur, "retirado", "2026-11-13", "2026-11-10"), { status: "retirado", removed_on: "2026-11-10" });
  const back = statusPatch({ status: "retirado", installed_on: "2026-10-01", removed_on: "2026-11-10" }, "activo", "2026-11-13");
  assert.equal(back.removed_on, null);
  assert.equal(back.installed_on, undefined, "no cambia la instalación si ya la tenía");
});

test("instalar algo pendiente fija la fecha de instalación", () => {
  const p = statusPatch({ status: "pendiente_instalacion", installed_on: null, removed_on: null }, "instalado", "2026-11-13");
  assert.equal(p.installed_on, "2026-11-13");
  assert.equal(p.installed_on_estimated, false);
});

test("validación de datos", () => {
  assert.equal(validateEquipment({ quantity: 1, installed_on: null, removed_on: null, reference_amount: null }), null);
  assert.match(validateEquipment({ quantity: 0, installed_on: null, removed_on: null, reference_amount: null })!, /cantidad/);
  assert.match(validateEquipment({ quantity: 1, installed_on: "2026-11-10", removed_on: "2026-11-01", reference_amount: null })!, /retirada/);
  assert.match(validateEquipment({ quantity: 1, installed_on: null, removed_on: null, reference_amount: -5 })!, /importe/);
});

test("títulos y sucesos legibles", () => {
  assert.equal(equipmentTitle({ name: null, brand_name: "Mahou" }, "Nevera"), "Nevera · Mahou");
  assert.equal(equipmentTitle({ name: "Nevera Mahou 2 puertas", brand_name: "Mahou" }, "Nevera"), "Nevera Mahou 2 puertas");
  assert.equal(describeEvent({ event_type: "cambio_estado", from_status: "activo", to_status: "deteriorado", changes: null, note: null }), "Estado: Activo → Deteriorado");
  assert.equal(describeEvent({ event_type: "modificacion", from_status: null, to_status: null, changes: { location: [null, "Entrada"], quantity: [1, 2] }, note: null }), "Cambios: Ubicación, Cantidad");
});

test("importes escritos a mano", () => {
  assert.equal(parseAmount("1.234,50"), 1234.5);
  assert.equal(parseAmount("12,5"), 12.5);
  assert.equal(parseAmount("12.5"), 12.5);
  assert.equal(parseAmount("700 €"), 700);
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount("-3"), null);
  assert.equal(parseAmount("abc"), null);
});

test("un pago vinculado a un elemento guarda el elemento, su marca y el enlace antiguo", () => {
  const v = paymentValues({
    storeId: "s1", type: { id: "t1", code: "nevera", name: "Nevera" }, amount: 700.004, date: "2026-11-13", status: "comprobado",
    visitId: "v1", equipment: { id: "e1", brand_id: "b1", brand_name: "Mahou", legacy_concept_id: "c1" },
  });
  assert.equal(v.equipment_id, "e1");
  assert.equal(v.concept_id, "c1");
  assert.equal(v.brand_name, "Mahou");
  assert.equal(v.amount, 700);
  assert.equal(v.payment_type_id, "t1");
  assert.equal(typeof v.id, "string");
});
