import writeXlsxFile from "write-excel-file/node";
import { buildReport } from "@/lib/server/report";
import { madridDate } from "@/lib/domain/dates";
import { pct } from "@/lib/domain/report";
import { parseRange, UNIT_LABEL, type Unit } from "@/lib/economy";
import { csvResponse } from "@/lib/csv";
import { FREQ_LABEL } from "@/lib/types";

export const maxDuration = 60;

type Cell = { value: string | number | null; fontWeight?: "bold"; type?: NumberConstructor | StringConstructor; format?: string } | null;
const t = (v: string | null | undefined, bold = false): Cell => ({ value: v ?? "", type: String, ...(bold ? { fontWeight: "bold" as const } : {}) });
const n = (v: number | null | undefined, format?: string): Cell => (v == null ? null : { value: Math.round(v * 100) / 100, type: Number, ...(format ? { format } : {}) });
const EUR = "#,##0.00 €";

/** Informe en Excel (varias hojas) o CSV (detalle por tienda), con el mismo periodo y alcance que la pantalla. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const range = parseRange({ period: sp.get("period") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined }, madridDate());
  const r = await buildReport(range, { banner: sp.getAll("banner"), store: sp.getAll("store") });
  const units = (u: Partial<Record<Unit, number>>) => Object.entries(u).map(([k, x]) => `${Math.round(Number(x) * 10) / 10} ${UNIT_LABEL[k as Unit]}`).join(" · ");
  const name = `informe-${r.range.from}-${r.range.to}`;
  const storeHeader = ["Tienda", "Enseña", "Municipio", "Periodicidad", "Audit", "Visitas", "Obligatorias", "Cumplidas", "Pendientes", "Incumplidas", "Inversión ejecutada (€)", "Abonado en dinero (€)", "En especie (€)", "Equipamiento", "Incidencias abiertas"];
  const storeRow = (s: (typeof r.stores)[number]) => [s.name, s.banner, s.town, FREQ_LABEL[s.frequency] ?? s.frequency, s.audit ? "sí" : "no", s.visits, s.comp.required, s.comp.done, s.comp.pending, s.comp.missed, s.executed, s.cash, s.inKind, Object.entries(s.elements).map(([k, x]) => `${x} ${k}`).join(" · "), s.incOpen];

  if (sp.get("format") === "csv") return csvResponse(name, storeHeader, r.stores.map(storeRow));

  const a = r.activity, p = r.productivity, c = r.commercial;
  const summary: Cell[][] = [
    [t("Informe de actividad · Mahou San Miguel", true)],
    [t("Alcance"), t(r.scopeLabel)], [t("Periodo"), t(r.range.label)], [t("Comparado con"), t(r.prev.label)], [],
    [t("ACTIVIDAD", true)],
    [t("Visitas obligatorias"), n(a.comp.required)], [t("Cumplidas"), n(a.comp.done)], [t("Pendientes (abiertas)"), n(a.comp.pending)], [t("Incumplidas (cerradas)"), n(a.comp.missed)],
    [t("Cumplimiento (%)"), n(a.pct)], [t("Cumplimiento periodo anterior (%)"), n(r.previous.pct)], [t("Visitas canceladas"), n(a.cancelled)], [],
    [t("PRODUCTIVIDAD", true)],
    [t("Visitas realizadas"), n(p.visits)], [t("Horas en tienda"), n(p.minutes / 60)], [t("Tiempo medio por visita (min)"), n(p.avgMinutes)],
    [t("Minutos previstos (visitas comparables)"), n(p.plannedMinutes)], [t("Minutos reales (visitas comparables)"), n(p.realMinutes)],
    [t("Horas de conducción (rutas)"), n(p.driveMinutes / 60)], [t("Kilómetros (rutas)"), n(p.km)], [],
    [t("GESTIÓN COMERCIAL", true)],
    [t("Inversión ejecutada"), n(c.totals.executed, EUR)], [t("Inversión periodo anterior"), n(r.previous.executed, EUR)], [t("Abonado en dinero"), n(c.totals.paidCash, EUR)],
    [t("En especie (valorado)"), n(c.totals.paidInKind, EUR)], [t("Unidades en especie"), t(units(c.totals.units))], [t("Pendiente de pago"), n(c.totals.pending, EUR)],
    [t("Comprometido por acuerdos"), n(c.committed, EUR)], [t("Acuerdos activos"), n(c.agreementsActive)],
    [t("Elementos instalados"), n(c.installed)], [t("Elementos retirados"), n(c.removed)],
    [t("Incidencias abiertas en el periodo"), n(c.incOpened)], [t("Incidencias resueltas en el periodo"), n(c.incResolved)], [t("Incidencias abiertas hoy"), n(c.incOpenNow)],
  ];
  const byFreq: Cell[][] = [
    ["Periodicidad", "Obligatorias", "Cumplidas", "Pendientes", "Incumplidas", "%"].map((h) => t(h, true)),
    ...(["semanal", "quincenal", "mensual"] as const).filter((f) => r.activity.byFreq[f]?.required).map((f) => { const x = r.activity.byFreq[f]; return [t(FREQ_LABEL[f]), n(x.required), n(x.done), n(x.pending), n(x.missed), n(pct(x.done, x.required))]; }),
    ...(a.audit.required ? [[t("De ellas, Audit"), n(a.audit.required), n(a.audit.done), n(a.audit.pending), n(a.audit.missed), n(pct(a.audit.done, a.audit.required))]] : []),
  ];
  const byCat: Cell[][] = [["Tipo de inversión", "Ejecutado (€)", "Unidades"].map((h) => t(h, true)), ...c.byCategory.map((x) => [t(x.name), n(x.executed, EUR), t(units(x.units))])];
  const trend: Cell[][] = [["Mes", "Cumplimiento (%)", "Visitas", "Inversión ejecutada (€)", "Instalados", "Retirados"].map((h) => t(h, true)), ...r.trend.map((x) => [t(x.m.slice(0, 7)), n(x.pct), n(x.visits), n(x.executed, EUR), n(x.installed), n(x.removed)])];
  const storesSheet: Cell[][] = [storeHeader.map((h) => t(h, true)), ...r.stores.map((s) => storeRow(s).map((v, i) => (typeof v === "number" ? n(v, i >= 10 && i <= 12 ? EUR : undefined) : t(v as string))))];

  const buffer = await writeXlsxFile([summary, byFreq, byCat, trend, storesSheet] as never, {
    sheets: ["Resumen", "Periodicidad", "Inversión", "Evolución", "Tiendas"], buffer: true,
    columns: [[{ width: 42 }, { width: 22 }], [{ width: 18 }, {}, {}, {}, {}, {}], [{ width: 30 }, { width: 18 }, { width: 24 }], [{ width: 10 }, {}, {}, { width: 20 }], [{ width: 36 }, { width: 18 }, { width: 18 }]] as never,
  } as never) as unknown as Buffer;
  return new Response(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}.xlsx"`, "Cache-Control": "no-store" },
  });
}
