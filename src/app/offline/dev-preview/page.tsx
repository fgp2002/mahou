"use client";
// SOLO LOCAL: banco de pruebas visual. No se sube al repositorio.
import { useState } from "react";
import { EquipmentPanel, type EquipmentRow } from "@/components/EquipmentPanel";
import { VisitEquipment } from "@/components/VisitEquipment";
import type { PaymentType, Agreement, InvestmentCategory, PaymentRow } from "@/lib/payments";
import { StoreEconomy } from "@/components/StoreEconomy";

const types: PaymentType[] = [
  { id: "t1", code: "nevera", name: "Nevera", category: null, default_amount: 700, notes: null, active: true, is_builtin: true, sort_order: 1, tracks_inventory: true },
  { id: "t2", code: "cabecera", name: "Cabecera", category: null, default_amount: 1800, notes: null, active: true, is_builtin: true, sort_order: 2, tracks_inventory: true },
  { id: "t3", code: "horas_reposicion", name: "Horas de reposición", category: null, default_amount: null, notes: null, active: true, is_builtin: true, sort_order: 3, tracks_inventory: false },
];
const base = { store_id: "s1", brand_id: null, installed_on_estimated: false, removed_on: null, last_reviewed_at: null, notes: null, deleted_at: null, created_at: "2026-10-15", name: null, thumb: null };
const items: EquipmentRow[] = [
  { ...base, id: "e1", type_id: "t1", code: "NEV-0001", brand_name: "Mahou", quantity: 1, location: "Entrada", status: "activo", installed_on: "2026-10-15", reference_amount: 700, paid: 700, payments: 1 },
  { ...base, id: "e2", type_id: "t2", code: "CAB-0002", brand_name: "San Miguel", quantity: 2, location: "Cabecera de pasillo", status: "pendiente_revision", installed_on: "2026-10-15", installed_on_estimated: true, reference_amount: 1800, paid: 1800, payments: 2 },
  { ...base, id: "e3", type_id: "t2", code: "CAB-0003", brand_name: "Alhambra", quantity: 1, location: null, status: "retirado", installed_on: "2026-09-01", removed_on: "2026-11-02", reference_amount: null, paid: 0, payments: 0 },
];
const cats: InvestmentCategory[] = [
  { id: "c1", code: "espacios", name: "Espacios comerciales", nature: "dinero", sort_order: 1, active: true },
  { id: "c2", code: "equipamiento", name: "Equipamiento", nature: "dinero", sort_order: 2, active: true },
  { id: "c3", code: "servicios", name: "Servicios y personal", nature: "horas", sort_order: 3, active: true },
];
types[0].category_id = "c2"; types[1].category_id = "c1"; types[2].category_id = "c3"; types[2].unit = "horas";
const ags: Agreement[] = [
  { id: "a1", store_id: "s1", type_id: "t3", equipment_id: null, title: "Horas de reposición 2026", start_date: "2026-01-01", end_date: "2026-12-31", periodicity: "mensual", amount: 1160, quantity: 115, unit: "horas", status: "en_ejecucion", notes: null, deleted_at: null, created_at: "2026-01-01" },
  { id: "a2", store_id: "s1", type_id: "t2", equipment_id: "e2", title: null, start_date: "2026-10-01", end_date: null, periodicity: "trimestral", amount: 1800, quantity: null, unit: null, status: "pendiente_aprobacion", notes: null, deleted_at: null, created_at: "2026-10-01" },
];
const pb = { store_id: "s1", concept: "x", period_start: null, visit_id: null, brand_id: null, notes: null, is_demo: false, agreement_id: null, equipment_id: null, quantity: null, unit: null, brand_name: null } as const;
const pays: PaymentRow[] = [
  { ...pb, id: "p1", payment_type_id: "t3", concept_name: "Horas de reposición", amount: 1760, payment_date: "2026-11-02", status: "abonado", settlement: "especie", quantity: 115, unit: "horas", agreement_id: "a1" },
  { ...pb, id: "p2", payment_type_id: "t2", concept_name: "Cabecera", amount: 1800, payment_date: "2026-10-15", status: "abonado", settlement: "dinero", equipment_id: "e2", brand_name: "San Miguel" },
  { ...pb, id: "p3", payment_type_id: "t1", concept_name: "Nevera", amount: 700, payment_date: "2026-11-10", status: "previsto", settlement: "dinero", equipment_id: "e1" },
];
export default function Dev() {
  const [v, setV] = useState("panel");
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="flex gap-2"><button className="btn-secondary" onClick={() => setV("panel")}>panel</button><button className="btn-secondary" onClick={() => setV("visit")}>visit</button><button className="btn-secondary" onClick={() => setV("eco")}>eco</button></div>
      {v === "eco" ? <div className="card"><StoreEconomy store={{ id: "s1", name: "Carrefour Alameda", town: "Madrid" }} payments={pays} agreements={ags} types={types} categories={cats} equipment={items} /></div> : v === "panel" ? <div className="card"><EquipmentPanel storeId="s1" items={items} types={types} /></div> : <div className="card"><VisitEquipment visitId="v1" storeId="s1" items={items} types={types} /></div>}
    </div>
  );
}
