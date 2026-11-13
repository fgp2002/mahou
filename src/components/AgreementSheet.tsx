"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { CalendarPlus, Trash2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { madridDate } from "@/lib/domain/dates";
import { eur, dmy } from "@/lib/format";
import { defaultSettlement, type Agreement, type InvestmentCategory, type PaymentType } from "@/lib/payments";
import { AGREEMENT_LABEL, AGREEMENT_STYLE, annualEquivalent, monthlyEquivalent, monthOf, PAY_LABEL, PAY_STYLE, PERIODICITY_LABEL, schedule, UNIT_LABEL, type AgreementStatus, type PayStatus, type Periodicity, type Unit } from "@/lib/economy";
import { equipmentTitle, type Equipment } from "@/lib/equipment";
import { paymentValues, parseAmount } from "@/lib/paymentRecord";
import { StorePicker, type PickedStore } from "./StorePicker";
import { Segmented, Sheet } from "./Sheet";
import { toast } from "./Toast";

interface Pay { id: string; amount: number; status: PayStatus; payment_date: string; period_start: string | null }
interface HistoryRow { id: string; action: string; changes: Record<string, [unknown, unknown]>; created_at: string }
const STATUSES = Object.keys(AGREEMENT_LABEL) as AgreementStatus[];

export function AgreementBadge({ status }: { status: AgreementStatus }) {
  return <span className={clsx("badge font-semibold", AGREEMENT_STYLE[status])}>{AGREEMENT_LABEL[status]}</span>;
}

/** Alta o ficha de un acuerdo comercial: compromiso, vigencia, calendario de pagos e historial. */
export function AgreementSheet({ agreement, store, types, categories, equipment, onClose }: {
  agreement: Agreement | null; store?: PickedStore | null; types: PaymentType[]; categories: InvestmentCategory[]; equipment?: Equipment[]; onClose: () => void;
}) {
  const router = useRouter();
  const sb = supabaseBrowser();
  const today = madridDate();
  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const a = agreement;
  const [st, setSt] = useState<PickedStore | null>(store ?? null);
  const [eqs, setEqs] = useState<Equipment[]>(equipment ?? []);
  const [f, setF] = useState({
    typeId: a?.type_id ?? "", equipmentId: a?.equipment_id ?? "", title: a?.title ?? "", start: a?.start_date ?? monthOf(today), end: a?.end_date ?? "",
    periodicity: (a?.periodicity ?? "mensual") as Periodicity, amount: a ? String(a.amount).replace(".", ",") : "", quantity: a?.quantity != null ? String(a.quantity).replace(".", ",") : "",
    unit: (a?.unit ?? "eur") as Unit, status: (a?.status ?? "borrador") as AgreementStatus, notes: a?.notes ?? "",
  });
  const [tab, setTab] = useState<"datos" | "calendario" | "historial">(a ? "calendario" : "datos");
  const [pays, setPays] = useState<Pay[] | null>(null);
  const [hist, setHist] = useState<HistoryRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const type = typeById.get(f.typeId);

  useEffect(() => {
    if (!st || equipment) return;
    sb.from("store_equipment").select("id,store_id,type_id,code,name,brand_id,brand_name,quantity,location,status,installed_on,installed_on_estimated,removed_on,last_reviewed_at,reference_amount,notes,deleted_at,created_at,legacy_concept_id").eq("store_id", st.id).is("deleted_at", null)
      .then(({ data }: { data: unknown[] | null }) => setEqs((data ?? []) as Equipment[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st?.id]);
  async function loadPays() {
    if (!a) return;
    const { data } = await sb.from("payment_records").select("id,amount,status,payment_date,period_start").eq("agreement_id", a.id).is("deleted_at", null).order("payment_date");
    setPays((data ?? []) as Pay[]);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadPays(); }, [a?.id]);
  useEffect(() => {
    if (!a || tab !== "historial") return;
    sb.from("change_history").select("id,action,changes,created_at").eq("entity", "agreements").eq("entity_id", a.id).order("created_at", { ascending: false }).then(({ data }: { data: unknown[] | null }) => setHist((data ?? []) as HistoryRow[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, a?.id]);

  const amountN = parseAmount(f.amount) ?? 0;
  const like = { start_date: f.start, end_date: f.end || null, periodicity: f.periodicity, amount: amountN };
  const periods = a ? schedule({ ...a, amount: Number(a.amount) }, today) : [];
  const byPeriod = new Map<string, Pay[]>();
  for (const p of pays ?? []) { const k = (p.period_start ?? p.payment_date).slice(0, 7); byPeriod.set(k, [...(byPeriod.get(k) ?? []), p]); }
  const missing = periods.filter((d) => !(byPeriod.get(d.slice(0, 7)) ?? []).some((p) => p.status !== "cancelado"));

  async function save() {
    if (!st) return toast("Elige la tienda", "error");
    if (!type) return toast("Elige el concepto", "error");
    if (parseAmount(f.amount) == null) return toast("Importe no válido", "error");
    if (f.end && f.end < f.start) return toast("El fin no puede ser anterior al inicio", "error");
    const qty = f.quantity.trim() === "" ? null : parseAmount(f.quantity);
    const values = {
      store_id: st.id, type_id: type.id, equipment_id: f.equipmentId || null, title: f.title.trim() || null, start_date: f.start, end_date: f.end || null,
      periodicity: f.periodicity, amount: amountN, quantity: qty, unit: f.unit === "eur" ? null : f.unit, status: f.status, notes: f.notes.trim() || null,
    };
    setBusy(true);
    const r = a ? await sb.from("agreements").update(values).eq("id", a.id) : await sb.from("agreements").insert(values);
    setBusy(false);
    if (r.error) return toast(r.error.message, "error");
    toast(a ? "Acuerdo actualizado" : "Acuerdo creado");
    router.refresh();
    onClose();
  }

  async function createPlanned() {
    if (!a || !missing.length) return;
    const t = typeById.get(a.type_id);
    if (!t) return;
    const eq = (equipment ?? eqs).find((e) => e.id === a.equipment_id) ?? null;
    if (!confirm(`Se crearán ${missing.length} pago${missing.length === 1 ? "" : "s"} «Previsto» de ${eur(Number(a.amount))} (${missing.map((d) => d.slice(5, 7) + "/" + d.slice(0, 4)).join(", ")}). ¿Continuar?`)) return;
    setBusy(true);
    const rows = missing.map((d) => paymentValues({ storeId: a.store_id, type: t, amount: Number(a.amount), date: d, status: "previsto", equipment: eq, agreementId: a.id, quantity: a.quantity, unit: a.unit, settlement: defaultSettlement(t, categories), periodStart: monthOf(d) }));
    const { error } = await sb.from("payment_records").insert(rows);
    setBusy(false);
    if (error) return toast(error.message, "error");
    toast("Pagos previstos creados");
    loadPays();
    router.refresh();
  }

  async function trash() {
    if (!a || !confirm("¿Enviar este acuerdo a la papelera? Sus pagos se conservan. Podrás recuperarlo desde Ajustes → Papelera.")) return;
    const { error } = await sb.from("agreements").update({ deleted_at: new Date().toISOString() }).eq("id", a.id);
    if (error) return toast(error.message, "error");
    toast("Acuerdo en la papelera");
    router.refresh();
    onClose();
  }

  return (
    <Sheet title={a ? (a.title || typeById.get(a.type_id)?.name || "Acuerdo") : "Nuevo acuerdo"}
      subtitle={a ? <span className="flex flex-wrap items-center gap-2"><AgreementBadge status={a.status} />{PERIODICITY_LABEL[a.periodicity]} · {eur(Number(a.amount))}{a.quantity ? ` · ${a.quantity} ${UNIT_LABEL[(a.unit ?? "eur") as Unit]}` : ""}</span> : "Un acuerdo es el compromiso; los pagos son los movimientos."}
      onClose={onClose}
      footer={tab === "datos" ? <div className="flex gap-2">{a && <button className="btn-secondary !text-red-600" aria-label="Enviar a la papelera" onClick={trash}><Trash2 size={16} /></button>}<button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn flex-1" disabled={busy} onClick={save}>{busy ? "Guardando…" : "Guardar acuerdo"}</button></div> : undefined}>
      {a && <div className="mb-3"><Segmented value={tab} onChange={setTab} options={[{ value: "calendario", label: "Pagos" }, { value: "datos", label: "Datos" }, { value: "historial", label: "Historial" }]} /></div>}

      {tab === "calendario" && a && (
        <div className="space-y-3">
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-slate-50 p-2"><dt className="text-[11px] text-slate-500">Mensual equiv.</dt><dd className="font-bold tabular-nums">{eur(monthlyEquivalent({ ...a, amount: Number(a.amount) }))}</dd></div>
            <div className="rounded-lg bg-slate-50 p-2"><dt className="text-[11px] text-slate-500">Anual equiv.</dt><dd className="font-bold tabular-nums">{eur(annualEquivalent({ ...a, amount: Number(a.amount) }))}</dd></div>
            <div className="rounded-lg bg-slate-50 p-2"><dt className="text-[11px] text-slate-500">Vigencia</dt><dd className="text-sm font-semibold">{dmy(a.start_date)} → {a.end_date ? dmy(a.end_date) : "sin fin"}</dd></div>
          </dl>
          {pays === null ? <div className="skeleton h-24" /> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {periods.map((d) => {
                const ps = byPeriod.get(d.slice(0, 7)) ?? [];
                return (
                  <li key={d} className="flex items-center gap-2 py-2">
                    <span className="w-20 shrink-0 tabular-nums text-slate-500">{d.slice(5, 7)}/{d.slice(0, 4)}</span>
                    <span className="flex flex-1 flex-wrap gap-1">{ps.length ? ps.map((p) => <span key={p.id} className={clsx("badge font-semibold", PAY_STYLE[p.status])}>{PAY_LABEL[p.status]} · {eur(Number(p.amount))}</span>) : <span className="text-xs font-semibold text-[rgb(var(--st-late))]">Sin pago registrado</span>}</span>
                  </li>
                );
              })}
              {periods.length === 0 && <li className="py-2 text-slate-500">El acuerdo todavía no ha empezado.</li>}
            </ul>
          )}
          {pays !== null && missing.length > 0 && <button className="btn-secondary w-full" disabled={busy} onClick={createPlanned}><CalendarPlus size={16} /> Crear {missing.length} pago{missing.length === 1 ? "" : "s"} previsto{missing.length === 1 ? "" : "s"}</button>}
          <p className="text-xs text-slate-500">Se muestran los periodos hasta hoy. Para registrar o cambiar un pago, ábrelo desde la lista de pagos.</p>
        </div>
      )}

      {tab === "historial" && a && (
        hist === null ? <div className="skeleton h-20" /> : hist.length === 0 ? <p className="text-sm text-slate-500">Sin cambios desde que se creó.</p> : (
          <ol className="space-y-2 text-sm">{hist.map((h) => (
            <li key={h.id} className="rounded-lg bg-slate-50 p-2.5">
              <div className="text-xs text-slate-500">{new Date(h.created_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" })}</div>
              {Object.entries(h.changes).filter(([k]) => !["updated_at"].includes(k)).map(([k, v]) => <div key={k}><b>{k === "status" ? "Estado" : k === "amount" ? "Importe" : k === "end_date" ? "Fin" : k === "start_date" ? "Inicio" : k}</b>: {Array.isArray(v) ? `${k === "status" ? AGREEMENT_LABEL[v[0] as AgreementStatus] ?? v[0] : v[0] ?? "—"} → ${k === "status" ? AGREEMENT_LABEL[v[1] as AgreementStatus] ?? v[1] : v[1] ?? "—"}` : ""}</div>)}
            </li>
          ))}</ol>
        )
      )}

      {tab === "datos" && (
        <div className="grid grid-cols-2 gap-3">
          {!store && <div className="col-span-2"><label className="label">Tienda</label><StorePicker value={st} onChange={setSt} /></div>}
          <div className="col-span-2"><label className="label">Concepto</label>
            <select className="input" value={f.typeId} onChange={(e) => { const t = typeById.get(e.target.value); setF({ ...f, typeId: e.target.value, unit: (t?.unit ?? "eur") as Unit, amount: f.amount || String(t?.default_amount ?? "").replace(".", ",") }); }}>
              <option value="">Elige…</option>
              {categories.map((c) => { const ts = types.filter((t) => t.category_id === c.id && (t.active || t.id === f.typeId)); return ts.length ? <optgroup key={c.id} label={c.name}>{ts.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup> : null; })}
            </select></div>
          {eqs.filter((e) => !f.typeId || e.type_id === f.typeId || e.id === f.equipmentId).length > 0 && (
            <div className="col-span-2"><label className="label">Elemento del inventario</label>
              <select className="input" value={f.equipmentId} onChange={(e) => setF({ ...f, equipmentId: e.target.value })}>
                <option value="">Sin vincular</option>
                {eqs.filter((e) => !f.typeId || e.type_id === f.typeId || e.id === f.equipmentId).map((e) => <option key={e.id} value={e.id}>{equipmentTitle(e, typeById.get(e.type_id)?.name ?? "Elemento")} ({e.code})</option>)}
              </select></div>
          )}
          <div className="col-span-2"><label className="label">Título (opcional)</label><input className="input" placeholder={type ? `${type.name}${st ? ` · ${st.name}` : ""}` : "p. ej. Horas de reposición 2026"} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div><label className="label">Inicio</label><input type="date" className="input" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></div>
          <div><label className="label">Fin</label><input type="date" className="input" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></div>
          <div><label className="label">Periodicidad</label><select className="input" value={f.periodicity} onChange={(e) => setF({ ...f, periodicity: e.target.value as Periodicity })}>{(Object.keys(PERIODICITY_LABEL) as Periodicity[]).map((p) => <option key={p} value={p}>{PERIODICITY_LABEL[p]}</option>)}</select></div>
          <div><label className="label">Importe pactado (€{f.periodicity === "puntual" ? "" : " por periodo"})</label><input className="input" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
          <div className="flex gap-1.5 col-span-2 sm:col-span-1">
            <div className="min-w-0 flex-1"><label className="label">Cantidad por periodo</label><input className="input" inputMode="decimal" placeholder="opcional" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></div>
            <div className="w-24"><label className="label">Unidad</label><select className="input" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value as Unit })}>{(Object.keys(UNIT_LABEL) as Unit[]).map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}</select></div>
          </div>
          <div className="col-span-2 sm:col-span-1 rounded-lg bg-slate-50 p-2 text-sm"><span className="text-slate-500">Equivale a</span> <b>{eur(monthlyEquivalent(like))}</b>/mes · <b>{eur(annualEquivalent(like))}</b>/año</div>
          <div className="col-span-2"><label className="label">Estado</label>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">{STATUSES.map((s) => <button key={s} type="button" onClick={() => setF({ ...f, status: s })} className={clsx("tap min-h-11 rounded-lg border px-1 text-sm", f.status === s ? "border-brand-600 bg-brand-50 font-semibold text-brand-700" : "border-slate-200")}>{AGREEMENT_LABEL[s]}</button>)}</div>
            <p className="mt-1 text-xs text-slate-500">Solo los acuerdos Aprobados, En ejecución o Finalizados cuentan como importe comprometido.</p>
          </div>
          <div className="col-span-2"><label className="label">Observaciones</label><textarea className="input" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
        </div>
      )}
    </Sheet>
  );
}
