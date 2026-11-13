// Gestión económica: reglas puras de acuerdos, periodos, equivalencias y agregados. Sin red: se prueban con node --test.

export type Periodicity = "puntual" | "mensual" | "bimestral" | "trimestral" | "semestral" | "anual";
export type AgreementStatus = "borrador" | "pendiente_aprobacion" | "aprobado" | "en_ejecucion" | "finalizado" | "cancelado";
export type PayStatus = "previsto" | "aprobado" | "comprobado" | "abonado" | "cancelado";
export type Nature = "dinero" | "horas" | "producto" | "material";
export type Unit = "eur" | "horas" | "cajas" | "litros" | "unidades";

export const PERIODICITY_LABEL: Record<Periodicity, string> = {
  puntual: "Puntual", mensual: "Mensual", bimestral: "Bimestral", trimestral: "Trimestral", semestral: "Semestral", anual: "Anual",
};
export const PERIOD_MONTHS: Record<Exclude<Periodicity, "puntual">, number> = { mensual: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };

export const AGREEMENT_LABEL: Record<AgreementStatus, string> = {
  borrador: "Borrador", pendiente_aprobacion: "Pendiente de aprobación", aprobado: "Aprobado", en_ejecucion: "En ejecución", finalizado: "Finalizado", cancelado: "Cancelado",
};
export const AGREEMENT_STYLE: Record<AgreementStatus, string> = {
  borrador: "bg-slate-200 text-slate-700", pendiente_aprobacion: "bg-st-pend text-black", aprobado: "bg-brand-50 text-brand-700",
  en_ejecucion: "bg-st-ok text-[#fff]", finalizado: "bg-slate-100 text-slate-500", cancelado: "bg-slate-100 text-slate-400 line-through",
};
/** Estados en los que el acuerdo es un compromiso real (cuenta como «comprometido»). */
export const COMMITTED: AgreementStatus[] = ["aprobado", "en_ejecucion", "finalizado"];

export const PAY_LABEL: Record<PayStatus, string> = { previsto: "Previsto", aprobado: "Aprobado", comprobado: "Comprobado", abonado: "Abonado", cancelado: "Cancelado" };
export const PAY_ORDER: PayStatus[] = ["previsto", "aprobado", "comprobado", "abonado", "cancelado"];
export const PAY_STYLE: Record<PayStatus, string> = {
  previsto: "bg-slate-200 text-slate-700", aprobado: "bg-brand-50 text-brand-700", comprobado: "bg-st-soon text-[#fff]", abonado: "bg-st-ok text-[#fff]", cancelado: "bg-slate-100 text-slate-400 line-through",
};
export const PAY_HINT: Record<PayStatus, string> = {
  previsto: "Se espera pagar; aún sin aprobar.",
  aprobado: "Aprobado por la empresa; pendiente de ejecutar.",
  comprobado: "La contraprestación se ha hecho y la has comprobado en tienda.",
  abonado: "Pagado o entregado.",
  cancelado: "No se hará. No cuenta en ningún total.",
};

export const UNIT_LABEL: Record<Unit, string> = { eur: "€", horas: "h", cajas: "cajas", litros: "l", unidades: "uds." };
export const UNIT_NAME: Record<Unit, string> = { eur: "Euros", horas: "Horas", cajas: "Cajas", litros: "Litros", unidades: "Unidades" };
export const NATURE_LABEL: Record<Nature, string> = { dinero: "Dinero", horas: "Horas", producto: "Producto", material: "Material" };

// ── Fechas (AAAA-MM-DD) sin zonas horarias ──
const ym = (d: string) => [Number(d.slice(0, 4)), Number(d.slice(5, 7))] as const;
export const monthOf = (d: string) => d.slice(0, 7) + "-01";
export function addMonths(d: string, n: number): string {
  const [y, m] = ym(d);
  const t = y * 12 + (m - 1) + n;
  const day = Math.min(Number(d.slice(8, 10)), daysIn(Math.floor(t / 12), (t % 12) + 1));
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
export function daysIn(y: number, m: number) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
export function monthEnd(d: string) { const [y, m] = ym(d); return `${d.slice(0, 7)}-${String(daysIn(y, m)).padStart(2, "0")}`; }
/** Meses (enteros, mínimo 1) que abarca el intervalo, contando los dos extremos. */
export function monthsSpan(from: string, to: string): number {
  const [y1, m1] = ym(from), [y2, m2] = ym(to);
  return Math.max(1, (y2 - y1) * 12 + (m2 - m1) + 1);
}

export interface AgreementLike { start_date: string; end_date: string | null; periodicity: Periodicity; amount: number; quantity?: number | null; status?: AgreementStatus }

/** Importe mensual equivalente. Un acuerdo puntual se reparte entre los meses de su vigencia (o un mes si no tiene fin). */
export function monthlyEquivalent(a: AgreementLike): number {
  if (a.periodicity === "puntual") return a.amount / (a.end_date ? monthsSpan(a.start_date, a.end_date) : 1);
  return a.amount / PERIOD_MONTHS[a.periodicity];
}
/** Importe anual equivalente. En un acuerdo puntual de menos de un año es su propio importe. */
export function annualEquivalent(a: AgreementLike): number {
  if (a.periodicity === "puntual") {
    const months = a.end_date ? monthsSpan(a.start_date, a.end_date) : 1;
    return months <= 12 ? a.amount : (a.amount * 12) / months;
  }
  return monthlyEquivalent(a) * 12;
}

/** Inicio de cada periodo de pago del acuerdo entre su inicio y `until` (incluido), sin pasar de su fin. */
export function schedule(a: AgreementLike, until: string, max = 240): string[] {
  const last = a.end_date && a.end_date < until ? a.end_date : until;
  if (a.start_date > last) return [];
  if (a.periodicity === "puntual") return [a.start_date];
  const step = PERIOD_MONTHS[a.periodicity];
  const out: string[] = [];
  for (let i = 0, d = a.start_date; d <= last && i < max; i++, d = addMonths(a.start_date, step * i)) out.push(d);
  return out;
}

/** Comprometido en un intervalo: suma de los periodos del acuerdo que empiezan dentro de él (solo acuerdos firmes). */
export function committedIn(a: AgreementLike, from: string, to: string): { amount: number; quantity: number; periods: number } {
  if (a.status && !COMMITTED.includes(a.status)) return { amount: 0, quantity: 0, periods: 0 };
  const n = schedule(a, to).filter((d) => d >= from).length;
  return { amount: n * a.amount, quantity: n * (a.quantity ?? 0), periods: n };
}

/** Días hasta el fin del acuerdo (negativo si ya venció); null si no tiene fin. */
export function daysToEnd(end: string | null, today: string): number | null {
  if (!end) return null;
  return Math.round((Date.parse(end) - Date.parse(today)) / 86400000);
}

// ── Pagos ──
export interface PayLike { amount: number; status: PayStatus; settlement: "dinero" | "especie"; quantity?: number | null; unit?: Unit | null; payment_date: string }

/** Ejecutado = la contraprestación ya se ha hecho (comprobado) o pagado (abonado). */
export const isExecuted = (s: PayStatus) => s === "comprobado" || s === "abonado";
/** Pendiente = comprometido en un pago pero aún sin abonar ni cancelar. */
export const isPending = (s: PayStatus) => s === "previsto" || s === "aprobado" || s === "comprobado";
/** Aprobado o más avanzado (sin contar cancelados). */
export const isApproved = (s: PayStatus) => s === "aprobado" || s === "comprobado" || s === "abonado";

export interface Totals {
  approved: number; executed: number; pending: number;
  /** Abonado en dinero (lo único que es salida de caja). */
  paidCash: number;
  /** Valoración en euros de lo abonado en especie (producto, horas, material). No es dinero abonado. */
  paidInKind: number;
  /** Unidades abonadas en especie por unidad (h, cajas, l, uds.). */
  units: Partial<Record<Unit, number>>;
  count: number;
}

export function totals(ps: PayLike[]): Totals {
  const t: Totals = { approved: 0, executed: 0, pending: 0, paidCash: 0, paidInKind: 0, units: {}, count: 0 };
  for (const p of ps) {
    if (p.status === "cancelado") continue;
    const a = Number(p.amount) || 0;
    t.count++;
    if (isApproved(p.status)) t.approved += a;
    if (isExecuted(p.status)) t.executed += a;
    if (isPending(p.status)) t.pending += a;
    if (p.status === "abonado") {
      if (p.settlement === "especie") {
        t.paidInKind += a;
        if (p.unit && p.unit !== "eur" && p.quantity) t.units[p.unit] = (t.units[p.unit] ?? 0) + Number(p.quantity);
      } else t.paidCash += a;
    }
  }
  return t;
}

/** Variación relativa (en %) frente a un valor anterior; null si no hay base para comparar. */
export function deltaPct(now: number, before: number): number | null {
  if (!before) return now ? null : 0;
  return Math.round(((now - before) / before) * 1000) / 10;
}

/** Clave de posible duplicado: misma tienda, mismo concepto y mismo mes. */
export const dupKey = (p: { store_id: string; payment_type_id: string | null; concept?: string; period_start?: string | null; payment_date: string }) =>
  `${p.store_id}|${p.payment_type_id ?? p.concept ?? ""}|${(p.period_start ?? p.payment_date).slice(0, 7)}`;

/** Grupos de pagos (no cancelados) que coinciden en tienda, concepto y mes. */
export function findDuplicates<T extends { id: string; store_id: string; payment_type_id: string | null; concept?: string; period_start?: string | null; payment_date: string; status: PayStatus }>(ps: T[]): T[][] {
  const g = new Map<string, T[]>();
  for (const p of ps) if (p.status !== "cancelado") g.set(dupKey(p), [...(g.get(dupKey(p)) ?? []), p]);
  return [...g.values()].filter((x) => x.length > 1);
}

// ── Periodos de consulta ──
export interface Range { from: string; to: string; label: string; kind: "mes" | "año" | "personalizado" }
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const monthLabel = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

/** Interpreta ?period=AAAA-MM | AAAA | personalizado (&from&to). Por defecto, el mes de hoy. */
export function parseRange(p: { period?: string; from?: string; to?: string }, today: string): Range {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (p.from && p.to && iso.test(p.from) && iso.test(p.to) && p.from <= p.to) return { from: p.from, to: p.to, label: `${p.from.split("-").reverse().join("/")} – ${p.to.split("-").reverse().join("/")}`, kind: "personalizado" };
  if (p.period && /^\d{4}$/.test(p.period)) return { from: `${p.period}-01-01`, to: `${p.period}-12-31`, label: `Año ${p.period}`, kind: "año" };
  const m = p.period && /^\d{4}-\d{2}$/.test(p.period) ? `${p.period}-01` : monthOf(today);
  return { from: m, to: monthEnd(m), label: monthLabel(m), kind: "mes" };
}

/** El periodo inmediatamente anterior de la misma duración (mes anterior, año anterior o mismo número de días). */
export function previousRange(r: Range): Range {
  if (r.kind === "mes") { const m = addMonths(r.from, -1); return { from: m, to: monthEnd(m), label: monthLabel(m), kind: "mes" }; }
  if (r.kind === "año") { const y = Number(r.from.slice(0, 4)) - 1; return { from: `${y}-01-01`, to: `${y}-12-31`, label: `Año ${y}`, kind: "año" }; }
  const days = Math.round((Date.parse(r.to) - Date.parse(r.from)) / 86400000) + 1;
  const to = new Date(Date.parse(r.from) - 86400000).toISOString().slice(0, 10);
  const from = new Date(Date.parse(to) - (days - 1) * 86400000).toISOString().slice(0, 10);
  return { from, to, label: "periodo anterior", kind: "personalizado" };
}

/** Los últimos `n` meses que terminan en el mes de `d`, del más antiguo al más reciente. */
export function lastMonths(d: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addMonths(monthOf(d), i - n + 1));
}
