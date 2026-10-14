"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { VISIT_TYPES } from "@/lib/types";

export interface SettingsValues {
  owner_id: string; work_start: string; work_end: string; route_start: string; transport: string; tracking_start: string;
  visit_durations: Record<string, number>; holidays: string; work_days: number[]; max_stops: string; audit_first: boolean;
}
const DAYS = ["L", "M", "X", "J", "V", "S", "D"];

export function SettingsForm({ initial }: { initial: SettingsValues }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    const hol = v.holidays.split(/[\s,;]+/).filter(Boolean);
    if (hol.some((h) => !/^\d{4}-\d{2}-\d{2}$/.test(h))) return setMsg("Festivos: usa el formato AAAA-MM-DD separados por comas.");
    if (v.work_end <= v.work_start) return setMsg("La hora de fin debe ser posterior a la de inicio.");
    if (v.route_start < v.work_start || v.route_start >= v.work_end) return setMsg("La hora de salida debe estar dentro de la jornada.");
    const { error } = await supabaseBrowser().from("user_settings").update({
      work_start: v.work_start, work_end: v.work_end, route_start: v.route_start, transport: v.transport, tracking_start: v.tracking_start,
      visit_durations: v.visit_durations,
      planning_prefs: { audit_first: v.audit_first, max_stops_per_day: v.max_stops ? Number(v.max_stops) : null, holidays: hol, work_days: v.work_days },
    }).eq("owner_id", v.owner_id);
    setMsg(error ? error.message : "Ajustes guardados.");
    router.refresh();
  }

  return (
    <section className="card space-y-3">
      <h2 className="font-medium">Jornada y planificación</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([["work_start", "Inicio jornada"], ["work_end", "Fin jornada"], ["route_start", "Salida de la ruta"]] as const).map(([k, l]) => (
          <div key={k}><label className="label">{l}</label><input type="time" className="input" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></div>
        ))}
        <div>
          <label className="label">Transporte</label>
          <select className="input" value={v.transport} onChange={(e) => setV({ ...v, transport: e.target.value })}>
            <option value="driving">Coche</option><option value="walking">A pie</option><option value="transit">Transporte público</option>
          </select>
        </div>
        <div><label className="label">Seguimiento desde</label><input type="date" className="input" value={v.tracking_start} onChange={(e) => setV({ ...v, tracking_start: e.target.value })} /></div>
        <div><label className="label">Máx. paradas/día</label><input className="input" inputMode="numeric" placeholder="sin límite" value={v.max_stops} onChange={(e) => setV({ ...v, max_stops: e.target.value })} /></div>
      </div>
      <div>
        <label className="label">Días laborables</label>
        <div className="flex gap-2">
          {DAYS.map((d, i) => (
            <label key={d} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={v.work_days.includes(i)} onChange={(e) => setV({ ...v, work_days: e.target.checked ? [...v.work_days, i] : v.work_days.filter((x) => x !== i) })} />{d}</label>
          ))}
        </div>
      </div>
      <div><label className="label">Festivos (AAAA-MM-DD, separados por comas)</label><input className="input" value={v.holidays} onChange={(e) => setV({ ...v, holidays: e.target.value })} /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.audit_first} onChange={(e) => setV({ ...v, audit_first: e.target.checked })} /> Priorizar tiendas Audit</label>
      <div>
        <label className="label">Duración por tipo de visita (min)</label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.entries(VISIT_TYPES).map(([k, l]) => (
            <div key={k}><span className="text-xs text-slate-500">{l}</span>
              <input className="input" inputMode="numeric" value={v.visit_durations[k] ?? ""} onChange={(e) => setV({ ...v, visit_durations: { ...v.visit_durations, [k]: Number(e.target.value) || 0 } })} />
            </div>
          ))}
        </div>
      </div>
      {msg && <p className="text-sm text-slate-600">{msg}</p>}
      <button className="btn" onClick={save}>Guardar ajustes</button>
    </section>
  );
}
