"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Clock } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { DAY_SHORT, hhmm, hoursSummary, toMin, type StoreHoursLike } from "@/lib/domain/hours";
import { toast } from "./Toast";

export interface StoreHoursValues extends StoreHoursLike { id?: string }

/** Horario de la tienda (apertura, días, franja preferida y minutos de acceso). El planificador lo respeta. */
export function StoreHours({ store }: { store: StoreHoursValues & { id: string } }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    days: store.opening_days ?? [], open: hhmm(store.open_time), close: hhmm(store.close_time),
    pf: hhmm(store.preferred_from), pt: hhmm(store.preferred_to), extra: String(store.extra_minutes ?? 0),
  });
  const summary = hoursSummary(store);

  async function save() {
    const extra = Number(f.extra || 0);
    if (!Number.isInteger(extra) || extra < 0 || extra > 180) return toast("Minutos de acceso: entre 0 y 180", "error");
    if (f.open && f.close && toMin(f.close)! <= toMin(f.open)!) return toast("El cierre debe ser posterior a la apertura", "error");
    if (f.pf && f.pt && toMin(f.pt)! <= toMin(f.pf)!) return toast("La franja preferida no es válida", "error");
    setBusy(true);
    const { error } = await supabaseBrowser().from("stores").update({
      opening_days: f.days.length && f.days.length < 7 ? [...f.days].sort() : null, open_time: f.open || null, close_time: f.close || null,
      preferred_from: f.pf || null, preferred_to: f.pt || null, extra_minutes: extra,
    }).eq("id", store.id);
    setBusy(false);
    if (error) return toast(error.message, "error");
    toast("Horario guardado. Se usará en las próximas rutas.");
    setEdit(false);
    router.refresh();
  }

  if (!edit) return (
    <button type="button" onClick={() => setEdit(true)} className="tap flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left text-sm">
      <Clock size={18} className="shrink-0 text-slate-400" />
      <span className="min-w-0 flex-1"><span className="block font-semibold">Horario y acceso</span><span className="block truncate text-slate-500">{summary || "Sin horario: el planificador no pone restricciones"}</span></span>
      <span className="text-xs font-semibold text-brand-600">Editar</span>
    </button>
  );
  return (
    <div className="fade-in space-y-3 rounded-xl border border-slate-200 p-3">
      <div>
        <div className="label">Días de apertura</div>
        <div className="flex gap-1">{DAY_SHORT.map((d, i) => (
          <button key={d} type="button" aria-pressed={f.days.includes(i)} onClick={() => setF({ ...f, days: f.days.includes(i) ? f.days.filter((x) => x !== i) : [...f.days, i] })}
            className={clsx("tap h-10 flex-1 rounded-lg border text-sm font-semibold", f.days.includes(i) ? "border-slate-900 bg-slate-900 text-slate-50" : "border-slate-200 text-slate-500")}>{d}</button>
        ))}</div>
        <p className="mt-1 text-xs text-slate-500">Sin marcar ninguno = abre todos los días.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label">Apertura</label><input type="time" className="input" value={f.open} onChange={(e) => setF({ ...f, open: e.target.value })} /></div>
        <div><label className="label">Cierre</label><input type="time" className="input" value={f.close} onChange={(e) => setF({ ...f, close: e.target.value })} /></div>
        <div><label className="label">Mejor visitar desde</label><input type="time" className="input" value={f.pf} onChange={(e) => setF({ ...f, pf: e.target.value })} /></div>
        <div><label className="label">hasta</label><input type="time" className="input" value={f.pt} onChange={(e) => setF({ ...f, pt: e.target.value })} /></div>
        <div className="col-span-2"><label className="label">Minutos extra de aparcamiento o acceso</label><input className="input" inputMode="numeric" value={f.extra} onChange={(e) => setF({ ...f, extra: e.target.value.replace(/\D/g, "") })} /></div>
      </div>
      <div className="flex gap-2"><button className="btn-secondary" onClick={() => setEdit(false)}>Cancelar</button><button className="btn flex-1" disabled={busy} onClick={save}>Guardar horario</button></div>
    </div>
  );
}
