"use client";
import { Fragment, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "./Toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { StorePicker, type PickedStore } from "./StorePicker";
import { googleMapsRouteUrl } from "@/lib/domain/geo";
import { fmtDuration } from "@/lib/domain/dates";
import { UNSCHEDULED_LABEL } from "@/lib/server/labels";

export interface StopView {
  id: string; store_id: string; position: number; planned_arrival: string | null; planned_minutes: number;
  drive_seconds_from_prev: number | null; distance_m_from_prev: number | null; reason: string | null; manually_added: boolean; forced_priority: boolean;
  stores: { name: string; town: string | null; address: string | null; postal_code: string | null; lat: number | null; lng: number | null; audit: boolean };
  visit: { id: string; status: string } | null;
}
interface RouteView {
  id: string; date: string; status: string; start_time: string; is_estimate: boolean; provider: string | null; drive: number; visit: number; dist: number;
  unscheduled: { store_id: string; name: string; reason: string }[]; warnings: string[]; generated_by: string; user_modified: boolean;
  lunch_start?: string | null; lunch_after?: number | null; banners?: string[] | null; saved?: number | null;
}
const ST: Record<string, string> = { proposed: "Propuesta (pendiente de aceptar)", accepted: "Aceptada", rejected: "Rechazada", completed: "Completada" };

export function RouteEditor({ route, stops }: { route: RouteView; stops: StopView[] }) {
  const router = useRouter();
  const sb = supabaseBrowser();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState<PickedStore | null>(null);
  const [start, setStart] = useState(route.start_time);
  const locked = route.status === "completed";

  async function recalc() {
    const r = await fetch(`/api/routes/${route.id}/recalc`, { method: "POST" });
    if (!r.ok) setErr((await r.json()).error ?? "No se pudo recalcular");
  }
  async function edit(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setErr(null);
    const { error } = await fn();
    if (error) { setErr(error.message); setBusy(false); return; }
    await sb.from("routes").update({ user_modified: true }).eq("id", route.id);
    await recalc();
    setBusy(false);
    router.refresh();
  }

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= stops.length) return;
    const a = stops[i], b = stops[j];
    // posiciones únicas: se pasa por una temporal para no chocar si hubiese restricción
    return edit(async () => {
      const r1 = await sb.from("route_stops").update({ position: 9999 }).eq("id", a.id);
      if (r1.error) return r1;
      const r2 = await sb.from("route_stops").update({ position: a.position }).eq("id", b.id);
      if (r2.error) return r2;
      return sb.from("route_stops").update({ position: b.position }).eq("id", a.id);
    });
  };
  const remove = (s: StopView) => confirm(`¿Quitar ${s.stores.name} de la ruta?`) && edit(async () => {
    if (s.visit?.status === "planned") await sb.from("visits").delete().eq("id", s.visit.id);
    return sb.from("route_stops").delete().eq("id", s.id);
  });
  const toggleForce = (s: StopView) => edit(() => sb.from("route_stops").update({ forced_priority: !s.forced_priority }).eq("id", s.id));
  const addStop = () => {
    if (!adding) return;
    if (stops.some((s) => s.store_id === adding.id)) return setErr("Esa tienda ya está en la ruta.");
    return edit(async () => {
      const { data: st } = await sb.from("stores").select("lat,lng").eq("id", adding.id).single();
      if (st?.lat == null) return { error: { message: "Esa tienda no tiene ubicación; geocodifícala primero." } };
      const { data: ins, error } = await sb.from("route_stops").insert({ route_id: route.id, store_id: adding.id, position: stops.length + 1, planned_minutes: 60, manually_added: true, reason: "Añadida a mano" }).select("id").single();
      if (error) return { error };
      if (route.status === "accepted") await sb.from("visits").insert({ store_id: adding.id, route_stop_id: ins.id, visit_date: route.date, status: "planned", visit_type: "ordinaria", planned_minutes: 60 });
      setAdding(null);
      return { error: null };
    });
  };
  const changeStart = () => edit(() => sb.from("routes").update({ start_time: start }).eq("id", route.id));
  const changeMinutes = (s: StopView, m: number) => m > 0 && edit(() => sb.from("route_stops").update({ planned_minutes: m }).eq("id", s.id));

  async function accept() {
    setBusy(true);
    const r = await fetch(`/api/routes/${route.id}/accept`, { method: "POST" });
    if (!r.ok) setErr((await r.json()).error ?? "Error");
    setBusy(false);
    router.refresh();
  }
  async function removeRoute() {
    const done = stops.filter((s) => s.visit?.status === "completed").length;
    if (!confirm(`¿Eliminar la ruta de este día?${done ? ` Las ${done} visitas ya hechas se conservan en el historial.` : ""} Después podrás generar otra.`)) return;
    setBusy(true);
    setErr(null);
    const planned = stops.map((s) => s.visit).filter((v): v is NonNullable<typeof v> => !!v && v.status === "planned").map((v) => v.id);
    if (planned.length) await sb.from("visits").delete().in("id", planned);
    const { error } = await sb.from("routes").delete().eq("id", route.id);
    if (!error) await sb.from("alerts").delete().in("dedupe_key", [`route:${route.date}`, `unsched:${route.date}`]);
    setBusy(false);
    if (error) return setErr(error.message);
    toast("Ruta eliminada");
    router.refresh();
  }

  const last = stops[stops.length - 1];
  const endTime = last?.planned_arrival ? (() => {
    const [h, m] = last.planned_arrival!.slice(0, 5).split(":").map(Number);
    const t = h * 60 + m + (last.planned_minutes ?? 0);
    return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  })() : null;
  const url = googleMapsRouteUrl(stops.map((s) => ({ lat: s.stores.lat, lng: s.stores.lng, address: s.stores.address, town: s.stores.town, postal_code: s.stores.postal_code })));

  return (
    <div className="space-y-6">
      <div className="card space-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge bg-slate-200 text-slate-800">{ST[route.status]}</span>
          <span className="text-slate-500">{route.generated_by === "auto" ? "Generada automáticamente" : "Generada a mano"}{route.user_modified ? " · editada" : ""}</span>
        </div>
        <dl className="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
          {[
            ["Tiendas", String(stops.length)],
            ["Km", (route.dist / 1000).toFixed(1)],
            ["Conduciendo", fmtDuration(Math.round(route.drive / 60))],
            ["Visitando", fmtDuration(Math.round(route.visit / 60))],
            ["Fin estimado", endTime ?? "—"],
            ["Ahorro", route.saved ? fmtDuration(Math.round(route.saved / 60)) : "—"],
          ].map(([l, v]) => (
            <div key={l} className="rounded-lg bg-slate-50 p-2"><dt className="text-[11px] text-slate-500">{l}</dt><dd className="text-base font-bold tabular-nums">{v}</dd></div>
          ))}
        </dl>
        {route.saved ? <p className="text-xs text-slate-500">Ahorro: tiempo de conducción que te evita el orden optimizado frente a visitar las tiendas por orden de prioridad.</p> : null}
        {route.banners?.length ? <div className="flex flex-wrap items-center gap-1.5"><span className="text-slate-500">Solo enseñas:</span>{route.banners.map((b) => <span key={b} className="badge bg-brand-50 text-brand-700">{b}</span>)}</div> : null}
        {route.is_estimate && <div className="rounded bg-amber-50 p-2 text-amber-800">⚠ Tiempos ESTIMADOS (no por carretera real). {route.provider}</div>}
        {!route.is_estimate && route.provider && <div className="text-xs text-slate-400">Tiempos de trayecto: {route.provider}</div>}
        {route.warnings.filter((w) => !w.startsWith("Tiempos")).map((w, i) => <div key={i} className="text-amber-700">⚠ {w}</div>)}
        {!locked && (
          <div className="flex flex-wrap items-end gap-2 pt-1">
            <div><label className="label">Hora de salida</label><input type="time" className="input w-32" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <button className="btn-secondary" disabled={busy || start === route.start_time} onClick={changeStart}>Cambiar hora</button>
          </div>
        )}
        <div className="flex flex-wrap gap-2 pt-2">
          {route.status === "proposed" && <button className="btn" disabled={busy} onClick={accept}>Aceptar ruta</button>}
          {route.status === "rejected" && <button className="btn" disabled={busy} onClick={accept}>Aceptar</button>}
          {url && <a className="btn-secondary" href={url} target="_blank" rel="noreferrer">Abrir en Google Maps</a>}
        </div>
        {!locked && (
          <div className="border-t border-slate-100 pt-3">
            <button className="btn-secondary !text-red-600" disabled={busy} onClick={removeRoute}><Trash2 size={16} /> Eliminar ruta</button>
          </div>
        )}
        {err && <p className="text-red-600">{err}</p>}
      </div>

      <ol className="space-y-2">
        {stops.map((s, i) => (
          <Fragment key={s.id}>
          {route.lunch_start && route.lunch_after === i && (
            <li className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 px-4 py-2.5 text-sm text-slate-600">🍽 Pausa para comer · {route.lunch_start.slice(0, 5)} (1 h)</li>
          )}
          <li className="card flex flex-wrap items-start justify-between gap-2 text-sm">
            <div className="min-w-0">
              <div className="text-xs text-slate-400">{s.planned_arrival?.slice(0, 5)} · {i === 0 && !(s.drive_seconds_from_prev ?? 0) ? "salida" : `${i === 0 ? "desde casa " : ""}+${fmtDuration(Math.round((s.drive_seconds_from_prev ?? 0) / 60))} · ${((s.distance_m_from_prev ?? 0) / 1000).toFixed(1)} km`}</div>
              <div className="font-medium">
                {i + 1}. <Link href={`/stores/${s.store_id}`} className="hover:underline">{s.stores.name}</Link>
                {s.stores.audit && <span className="badge ml-2 bg-slate-900 text-slate-50">Audit</span>}
                {s.forced_priority && <span className="badge ml-2 bg-red-100 text-red-700">Prioritaria</span>}
              </div>
              <div className="text-slate-500">{s.stores.address}, {s.stores.town} · {s.reason}</div>
              {s.visit && <Link href={`/visits/${s.visit.id}`} className="text-xs underline">Visita: {s.visit.status}</Link>}
            </div>
            {!locked && (
              <div className="flex flex-wrap items-center gap-1">
                <input className="input w-16" inputMode="numeric" defaultValue={s.planned_minutes} onBlur={(e) => Number(e.target.value) !== s.planned_minutes && changeMinutes(s, Number(e.target.value))} title="Minutos en tienda" />
                <button className="btn-secondary px-2" disabled={busy || i === 0} onClick={() => move(i, -1)}>↑</button>
                <button className="btn-secondary px-2" disabled={busy || i === stops.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button className="btn-secondary px-2" disabled={busy} onClick={() => toggleForce(s)}>{s.forced_priority ? "★" : "☆"}</button>
                <button className="btn-secondary px-2 text-red-600" disabled={busy} onClick={() => remove(s)}>✕</button>
              </div>
            )}
          </li>
          </Fragment>
        ))}
        {stops.length === 0 && <li className="card text-sm text-slate-500">La ruta no tiene paradas.</li>}
      </ol>

      {!locked && (
        <div className="card space-y-2">
          <h2 className="font-medium">Añadir tienda a la ruta</h2>
          <StorePicker value={adding} onChange={setAdding} />
          <button className="btn" disabled={!adding || busy} onClick={addStop}>Añadir al final</button>
        </div>
      )}

      {route.unscheduled.length > 0 && (
        <div className="card text-sm">
          <h2 className="mb-2 font-medium">Pendientes que no entraron ({route.unscheduled.length})</h2>
          <ul className="space-y-1">
            {route.unscheduled.map((u) => (
              <li key={u.store_id}><Link className="underline" href={`/stores/${u.store_id}`}>{u.name}</Link> <span className="text-slate-500">— {UNSCHEDULED_LABEL[u.reason] ?? u.reason}</span></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
