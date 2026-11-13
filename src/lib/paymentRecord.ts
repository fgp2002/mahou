// Construcción de un pago (fila de payment_records) a partir de su contexto: tipo, elemento, visita y acuerdo.
// Un único sitio para que la ficha, la visita y el modo sin conexión guarden lo mismo.
import type { PaymentType } from "./payments";

export interface PaymentInput {
  storeId: string;
  type: Pick<PaymentType, "id" | "code" | "name">;
  amount: number;
  date: string;
  status: string;
  visitId?: string | null;
  equipment?: { id: string; brand_id: string | null; brand_name: string | null; legacy_concept_id?: string | null } | null;
  brand?: { id: string; name: string } | null;
  agreementId?: string | null;
  quantity?: number | null;
  unit?: string | null;
  settlement?: "dinero" | "especie" | null;
  periodStart?: string | null;
  notes?: string | null;
}

export function paymentValues(p: PaymentInput): Record<string, unknown> {
  const brandId = p.brand?.id ?? p.equipment?.brand_id ?? null;
  const brandName = p.brand?.name ?? p.equipment?.brand_name ?? null;
  const v: Record<string, unknown> = {
    id: crypto.randomUUID(),
    store_id: p.storeId,
    visit_id: p.visitId ?? null,
    equipment_id: p.equipment?.id ?? null,
    // Enlace antiguo: se mantiene mientras dure la transición para poder volver a la versión anterior.
    concept_id: p.equipment?.legacy_concept_id ?? null,
    concept: p.type.code,
    concept_name: p.type.name,
    payment_type_id: p.type.id,
    amount: Math.round(p.amount * 100) / 100,
    payment_date: p.date,
    status: p.status,
    is_demo: false,
    brand_id: brandId,
    brand_name: brandName,
    notes: p.notes?.trim() || null,
  };
  if (p.agreementId !== undefined) v.agreement_id = p.agreementId;
  if (p.quantity !== undefined) v.quantity = p.quantity;
  if (p.unit !== undefined) v.unit = p.unit;
  if (p.settlement) v.settlement = p.settlement;
  v.period_start = p.periodStart ?? `${p.date.slice(0, 7)}-01`;
  return v;
}

/** Lee un importe escrito a mano («1.234,50», «12,5», «12.5»). Devuelve null si no es válido. */
export function parseAmount(raw: string): number | null {
  const s = raw.trim().replace(/\s|€/g, "");
  if (!s) return null;
  const norm = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(norm);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
