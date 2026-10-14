"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { VISIT_TYPES } from "@/lib/types";

export interface SettingsValues {
  owner_id: string; work_start: string; work_end: string; route_start: string; transport: string; tracking_start: string;
  visit_durations: Record<string, number>; holidays: string; work_days: number[]; max_stops: string; audit_first: boolean;
  home_address: string; home_located: boolean; default_minutes: string; lunch_enabled: boolean; lunch_from: string; lunch_to: string; lunch_minutes: string;
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
    const lm = Number(v.lunch_minutes), dm = Number(v.default_minutes);
    if (v.lunch_enabled && (!(lm >= 10 && lm <= 180) || v.lunch_to <= v.lunch_from)) return setMsg("Revisa la pausa de comida: franja y duración (10–180 min).");
    if (!(dm >= 5 && dm <= 240)) return setMsg("La duración por defecto debe estar entre 5 y 240 min.");
    const homeChanged = v.home_address.trim() !== initial.home_address.trim();
    const { error } = await supabaseBrowser().from("user_settings").update({
      home_address: v.home_address.trim() || null, ...(homeChanged ? { home_lat: null, home_lng: null } : {}),
      work_start: v.work_start, work_end: v.work_end, route_start: v.route_start, transport: v.transport, tracking_start: v.tracking_start,
      visit_durations: v.visit_durations,
      planning_prefs: {
        audit_first: v.audit_first, max_stops_per_day: v.max_stops ? Number(v.max_stops) : null, holidays: hol, work_days: v.work_days,
        default_visit_minutes: dm, lunch: { enabled: v.lunch_enabled, from: v.lunch_from, to: v.lunch_to, minutes: lm },
      },
    }).eq("owner_id", v.owner_id);
    setMsg(error ? error.message : "Ajustes guardados.");
    router.refresh();
  }

  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">Horario y disponibilidad</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div>
          <label className="label" htmlFor="home">Dirección de salida (cada día)</label>
          <input id="home" className="input" placeholder="Calle, número, código postal y municipio" value={v.home_address} onChange={(e) => setV({ ...v, home_address: e.target.value })} />
          <p className="mt-1 text-xs text-slate-500">{v.home_address.trim() && v.home_address.trim() === initial.home_address.trim() ? (initial.home_located ? "✓ Localizada en el mapa." : "Se localizará al generar la próxima ruta.") : "Las rutas empiezan aquí y acaban en la última tienda."}</p>
        </div>
        <div><label className="label" htmlFor="defmin">Minutos por visita (sin historial)</label><input id="defmin" className="input sm:w-40" inputMode="numeric" value={v.default_minutes} onChange={(e) => setV({ ...v, default_minutes: e.target.value.replace(/\D/g, "") })} /></div>
      </div>
      <div className="space-y-2 rounded-lg border border-slate-200 p-3">
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="h-4 w-4" checked={v.lunch_enabled} onChange={(e) => setV({ ...v, lunch_enabled: e.target.checked })} /> Pausa para comer flexible</label>
        {v.lunch_enabled && (
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label">Desde</label><input type="time" className="input" value={v.lunch_from} onChange={(e) => setV({ ...v, lunch_from: e.target.value })} /></div>
            <div><label className="label">Hasta</label><input type="time" className="input" value={v.lunch_to} onChange={(e) => setV({ ...v, lunch_to: e.target.value })} /></div>
            <div><label className="label">Duración (min)</label><input className="input" inputMode="numeric" value={v.lunch_minutes} onChange={(e) => setV({ ...v, lunch_minutes: e.target.value.replace(/\D/g, "") })} /></div>
          </div>
        )}
        <p className="text-xs text-slate-500">La ruta coloca la pausa entre dos tiendas dentro de la franja. La duración de cada visita se aprende de tus visitas cronometradas.</p>
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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
