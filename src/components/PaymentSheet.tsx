"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { Trash2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { madridDate } from "@/lib/domain/dates";
import { eur, dmy } from "@/lib/format";
import { defaultSettlement, type Agreement, type InvestmentCategory, type PaymentRow, type PaymentType } from "@/lib/payments";
import { monthLabel, PAY_HINT, PAY_LABEL, PAY_ORDER, UNIT_LABEL, UNIT_NAME, type PayStatus, type Unit } from "@/lib/economy";
import { equipmentTitle, type Equipment } from "@/lib/equipment";
import { paymentValues, parseAmount } from "@/lib/paymentRecord";
import { BrandSelect } from "./BrandSelect";
import { Segmented, Sheet } from "./Sheet";
import { toast } from "./Toast";

export interface PaymentDefaults { typeId?: string; equipmentId?: string | null; agreementId?: string | null; amount?: number | null; quantity?: number | null; periodStart?: string | null; status?: PayStatus; visitId?: string | null }

interface HistoryRow { id: string; action: string; changes: Record<string, unknown>; created_at: string }
const FIELD: Record<string, string> = {
  amount: "Importe", status: "Estado", payment_date: "Fecha", period_start: "Periodo", payment_type_id: "Concepto", concept_name: "Concepto",
  settlement: "Naturaleza", quantity: "Cantidad", unit: "Unidad", notes: "Observaciones", equipment_id: "Elemento", agreement_id: "Acuerdo", brand_name: "Marca", deleted_at: "Papelera",
};
const show = (k: string, v: unknown) => v == null ? "—" : k === "amount" ? eur(Number(v)) : k === "status" ? PAY_LABEL[v as PayStatus] ?? String(v) : typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? dmy(v.slice(0, 10)) : String(v);

/** Alta o edición de un pago con naturaleza, cantidad, periodo, acuerdo y elemento; avisa de duplicados y guarda historial. */
export function PaymentSheet({ storeId, payment, types, categories, equipment, agreements, defaults, onClose }: {
  storeId: string; payment: PaymentRow | null; types: PaymentType[]; categories: InvestmentCategory[]; equipment: Equipment[]; agreements: Agreement[];
  defaults?: PaymentDefaults; onClose: () => void;
}) {
  const router = useRouter();
  const sb = supabaseBrowser();
  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const init = payment ?? null;
  const t0 = typeById.get(init?.payment_type_id ?? defaults?.typeId ?? "");
  const [f, setF] = useState({
    typeId: init?.payment_type_id ?? defaults?.typeId ?? "",
    equipmentId: init?.equipment_id ?? defaults?.equipmentId ?? "",
    agreementId: init?.agreement_id ?? defaults?.agreementId ?? "",
    amount: init ? String(init.amount).replace(".", ",") : defaults?.amount != null ? String(defaults.amount).replace(".", ",") : t0?.default_amount != null ? String(t0.default_amount).replace(".", ",") : "",
    quantity: init?.quantity != null ? String(init.quantity).replace(".", ",") : defaults?.quantity != null ? String(defaults.quantity) : "",
    unit: (init?.unit ?? t0?.unit ?? "eur") as Unit,
    settlement: init?.settlement ?? defaultSettlement(t0, categories),
    date: init?.payment_date ?? madridDate(),
    period: (init?.period_start ?? defaults?.periodStart ?? madridDate()).slice(0, 7),
    status: (init?.status ?? defaults?.status ?? "comprobado") as PayStatus,
    notes: init?.notes ?? "",
    brandId: init?.brand_id ?? null as string | null, brandName: init?.brand_name ?? null as string | null,
  });
  const [tab, setTab] = useState<"datos" | "historial">("datos");
  const [hist, setHist] = useState<HistoryRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const type = typeById.get(f.typeId);
  const eqOptions = equipment.filter((e) => (!f.typeId || e.type_id === f.typeId || e.id === f.equipmentId) && (e.status !== "retirado" || e.id === f.equipmentId));
  const agOptions = agreements.filter((a) => (!f.typeId || a.type_id === f.typeId || a.id === f.agreementId) && (a.status !== "cancelado" || a.id === f.agreementId));

  useEffect(() => {
    if (!init || tab !== "historial") return;
    sb.from("change_history").select("id,action,changes,created_at").eq("entity", "payment_records").eq("entity_id", init.id).order("created_at", { ascending: false })
      .then(({ data }: { data: unknown[] | null }) => setHist((data ?? []) as HistoryRow[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, init?.id]);

  function pickType(id: string) {
    const t = typeById.get(id);
    const els = equipment.filter((e) => e.type_id === id && e.status !== "retirado");
    const ags = agreements.filter((a) => a.type_id === id && (a.status === "en_ejecucion" || a.status === "aprobado"));
    const el = els.length === 1 ? els[0] : null;
    const ag = ags.length === 1 ? ags[0] : null;
    setF({ ...f, typeId: id, unit: (t?.unit ?? "eur") as Unit, settlement: defaultSettlement(t, categories), equipmentId: el?.id ?? "", agreementId: ag?.id ?? "",
      amount: f.amount || String(ag?.amount ?? el?.reference_amount ?? t?.default_amount ?? "").replace(".", ","), quantity: f.quantity || (ag?.quantity != null ? String(ag.quantity) : "") });
  }

  async function save() {
    if (!type) return toast("Elige el concepto", "error");
    const amount = parseAmount(f.amount);
    if (amount == null) return toast("Importe no válido", "error");
    const quantity = f.quantity.trim() === "" ? null : parseAmount(f.quantity);
    if (f.quantity.trim() !== "" && quantity == null) return toast("Cantidad no válida", "error");
    const periodStart = `${f.period}-01`;
    // Aviso de posible duplicado: misma tienda, concepto y mes.
    if (f.status !== "cancelado") {
      let q = sb.from("payment_records").select("id,amount,status").eq("store_id", storeId).eq("payment_type_id", type.id).eq("period_start", periodStart).is("deleted_at", null).neq("status", "cancelado");
      if (init) q = q.neq("id", init.id);
      const { data: dup } = await q;
      if (dup?.length && !confirm(`Ya hay ${dup.length} pago${dup.length === 1 ? "" : "s"} de «${type.name}» en ${monthLabel(periodStart)} para esta tienda (${dup.map((d: { amount: number }) => eur(Number(d.amount))).join(", ")}).\n\n¿Puede ser un duplicado? Pulsa Aceptar para guardarlo igualmente.`)) return;
    }
    const eq = f.equipmentId ? equipment.find((e) => e.id === f.equipmentId) ?? null : null;
    const values = paymentValues({
      storeId, type, amount, date: f.date, status: f.status, visitId: init?.visit_id ?? defaults?.visitId ?? null, equipment: eq,
      brand: f.brandId && f.brandName ? { id: f.brandId, name: f.brandName } : null, agreementId: f.agreementId || null,
      quantity, unit: f.unit === "eur" ? null : f.unit, settlement: f.settlement, periodStart, notes: f.notes,
    });
    setBusy(true);
    const r = init
      ? await sb.from("payment_records").update({ ...values, id: undefined, visit_id: undefined, is_demo: undefined, concept_id: eq?.legacy_concept_id ?? undefined }).eq("id", init.id)
      : await sb.from("payment_records").insert(values);
    setBusy(false);
    if (r.error) return toast(r.error.message, "error");
    toast(init ? "Pago actualizado" : "Pago registrado");
    router.refresh();
    onClose();
  }

  async function trash() {
    if (!init || !confirm("¿Enviar este pago a la papelera? Podrás recuperarlo desde Ajustes → Papelera.")) return;
    const { error } = await sb.from("payment_records").update({ deleted_at: new Date().toISOString() }).eq("id", init.id);
    if (error) return toast(error.message, "error");
    toast("Pago en la papelera");
    router.refresh();
    onClose();
  }

  return (
    <Sheet title={init ? "Pago" : "Registrar pago"} subtitle={init ? `${init.concept_name ?? init.concept} · ${dmy(init.payment_date)}` : undefined} onClose={onClose}
      footer={<div className="flex gap-2">{init && <button className="btn-secondary !text-red-600" onClick={trash} aria-label="Enviar a la papelera"><Trash2 size={16} /></button>}<button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn flex-1" disabled={busy} onClick={save}>{busy ? "Guardando…" : "Guardar"}</button></div>}>
      {init && <div className="mb-3"><Segmented value={tab} onChange={setTab} options={[{ value: "datos", label: "Datos" }, { value: "historial", label: "Historial" }]} /></div>}
      {tab === "historial" && init ? (
        hist === null ? <div className="skeleton h-20" /> : hist.length === 0 ? <p className="text-sm text-slate-500">Sin cambios desde que se registró.</p> : (
          <ol className="space-y-3 text-sm">
            {hist.map((h) => (
              <li key={h.id} className="rounded-lg bg-slate-50 p-2.5">
                <div className="text-xs text-slate-500">{new Date(h.created_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" })} · {h.action === "delete" ? "Borrado" : "Cambio"}</div>
                {h.action === "update" && Object.entries(h.changes as Record<string, [unknown, unknown]>).filter(([k]) => FIELD[k]).map(([k, [a, b]]) => (
                  <div key={k}><b>{FIELD[k]}</b>: {show(k, a)} → {show(k, b)}</div>
                ))}
              </li>
            ))}
          </ol>
        )
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className="label">Concepto</label>
            <select className="input" value={f.typeId} onChange={(e) => pickType(e.target.value)}>
              <option value="">Elige…</option>
              {categories.map((c) => {
                const ts = types.filter((t) => t.category_id === c.id && (t.active || t.id === f.typeId));
                return ts.length ? <optgroup key={c.id} label={c.name}>{ts.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup> : null;
              })}
              {types.filter((t) => !t.category_id && (t.active || t.id === f.typeId)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select></div>
          {agOptions.length > 0 && (
            <div className="col-span-2"><label className="label">Acuerdo</label>
              <select className="input" value={f.agreementId} onChange={(e) => { const a = agreements.find((x) => x.id === e.target.value); setF({ ...f, agreementId: e.target.value, amount: a ? String(a.amount).replace(".", ",") : f.amount, quantity: a?.quantity != null ? String(a.quantity) : f.quantity, equipmentId: a?.equipment_id ?? f.equipmentId }); }}>
                <option value="">Sin acuerdo</option>
                {agOptions.map((a) => <option key={a.id} value={a.id}>{a.title || typeById.get(a.type_id)?.name} · {eur(Number(a.amount))} · desde {dmy(a.start_date)}</option>)}
              </select></div>
          )}
          {eqOptions.length > 0 && (
            <div className="col-span-2"><label className="label">Elemento del inventario</label>
              <select className="input" value={f.equipmentId} onChange={(e) => setF({ ...f, equipmentId: e.target.value })}>
                <option value="">Sin vincular</option>
                {eqOptions.map((e) => <option key={e.id} value={e.id}>{equipmentTitle(e, typeById.get(e.type_id)?.name ?? "Elemento")} ({e.code})</option>)}
              </select></div>
          )}
          {!f.equipmentId && <div className="col-span-2"><BrandSelect label="Marca" value={f.brandId} onChange={(b) => setF({ ...f, brandId: b?.id ?? null, brandName: b?.name ?? null })} /></div>}
          <div className="col-span-2">
            <label className="label">Naturaleza</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(["dinero", "especie"] as const).map((s) => (
                <button key={s} type="button" onClick={() => setF({ ...f, settlement: s })} className={clsx("tap min-h-11 rounded-lg border text-sm", f.settlement === s ? "border-brand-600 bg-brand-50 font-semibold text-brand-700" : "border-slate-200")}>
                  {s === "dinero" ? "Dinero" : "En especie"}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">{f.settlement === "dinero" ? "Pago económico a la tienda: cuenta como dinero abonado." : "Horas, producto o material entregado: se valora en euros pero no es salida de caja."}</p>
          </div>
          <div><label className="label">{f.settlement === "especie" ? "Valoración (€)" : "Importe (€)"}</label><input className="input" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
          <div className="flex gap-1.5">
            <div className="min-w-0 flex-1"><label className="label">Cantidad (opc.)</label><input className="input" inputMode="decimal" placeholder="—" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></div>
            <div className="w-20 shrink-0"><label className="label">Unidad</label><select className="input" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value as Unit })}>{(Object.keys(UNIT_NAME) as Unit[]).map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}</select></div>
          </div>
          <div><label className="label">Fecha</label><input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value, period: init || f.period !== f.date.slice(0, 7) ? f.period : e.target.value.slice(0, 7) })} /></div>
          <div><label className="label">Periodo (mes)</label><input type="month" className="input" value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} /></div>
          <div className="col-span-2">
            <label className="label">Estado</label>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
              {PAY_ORDER.map((s) => (
                <button key={s} type="button" onClick={() => setF({ ...f, status: s })} className={clsx("tap min-h-11 rounded-lg border px-1 text-sm", f.status === s ? "border-brand-600 bg-brand-50 font-semibold text-brand-700" : "border-slate-200")}>{PAY_LABEL[s]}</button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">{PAY_HINT[f.status]}</p>
          </div>
          <div className="col-span-2"><label className="label">Observaciones</label><input className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
          {init?.visit_id && <Link href={`/visits/${init.visit_id}`} className="col-span-2 text-sm font-semibold text-brand-600 underline">Ver la visita en la que se registró</Link>}
        </div>
      )}
    </Sheet>
  );
}
