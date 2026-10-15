"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { StorePicker, type PickedStore } from "./StorePicker";
import { NearbyStores } from "./NearbyStores";
import { VISIT_TYPES } from "@/lib/types";
import { madridDate } from "@/lib/domain/dates";

export function NewVisit({ initialStore, durations }: { initialStore: PickedStore | null; durations: Record<string, number> }) {
  const router = useRouter();
  const [store, setStore] = useState<PickedStore | null>(initialStore);
  const [type, setType] = useState("ordinaria");
  const [manual, setManual] = useState(false);
  const [date, setDate] = useState(madridDate());
  const [minutes, setMinutes] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const planned = durations[type] ?? 30;

  useEffect(() => { if (manual && minutes === "") setMinutes(String(planned)); }, [manual, planned, minutes]);

  async function go() {
    if (!store) return setErr("Elige una tienda.");
    setBusy(true);
    setErr(null);
    const sb = supabaseBrowser();
    let row: Record<string, unknown>;
    if (manual) {
      const m = Number(minutes);
      if (!Number.isFinite(m) || m < 0) { setBusy(false); return setErr("Duración no válida."); }
      if (date > madridDate()) { setBusy(false); return setErr("La fecha no puede ser futura."); }
      row = { store_id: store.id, visit_type: type, visit_date: date, status: "completed", is_manual: true, duration_minutes: Math.round(m), planned_minutes: planned, notes: notes || null };
    } else {
      const { data: open } = await sb.from("visits").select("id").eq("status", "in_progress").limit(1);
      if (open && open.length) { setBusy(false); setErr("Ya tienes una visita en curso. Termínala antes de iniciar otra."); return; }
      row = { store_id: store.id, visit_type: type, visit_date: madridDate(), status: "in_progress", started_at: new Date().toISOString(), planned_minutes: planned };
    }
    const { data, error } = await sb.from("visits").insert(row).select("id").single();
    setBusy(false);
    if (error) return setErr(error.message);
    router.replace(`/visits/${data.id}`);
    router.refresh();
  }

  return (
    <div className="max-w-xl space-y-3">
    {!initialStore && !store && !manual && <NearbyStores onPick={setStore} />}
    <div className="card space-y-3">
      <div><label className="label">Tienda</label><StorePicker value={store} onChange={setStore} /></div>
      <div>
        <label className="label">Tipo de visita (duración prevista {planned} min)</label>
        <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(VISIT_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} /> Registrar una visita ya realizada (manual)</label>
      {manual && (
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Fecha</label><input type="date" className="input" value={date} max={madridDate()} onChange={(e) => setDate(e.target.value)} /></div>
          <div><label className="label">Duración (min)</label><input className="input" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></div>
          <div className="col-span-2"><label className="label">Notas</label><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button className="btn w-full" onClick={go} disabled={busy}>{manual ? "Guardar visita" : "Iniciar visita ahora"}</button>
    </div>
    </div>
  );
}
