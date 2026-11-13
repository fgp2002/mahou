"use client";
import { Fragment, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Car, GripVertical, LocateFixed, Star, Trash2, X } from "lucide-react";
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

  /** Guarda un orden nuevo completo (tras arrastrar o con las flechas). */
  const reorder = (ids: string[]) => edit(async () => {
    for (let k = 0; k < ids.length; k++) {
      const cur = stops.find((s) => s.id === ids[k]);
      if (cur && cur.position === k + 1) continue;
      const r = await sb.from("route_stops").update({ position: k + 1 }).eq("id", ids[k]);
      if (r.error) return r;
    }
    return { error: null };
  });
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= stops.length) return;
    const ids = stops.map((s) => s.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    return reorder(ids);
  };

  // Arrastrar y soltar (dedo o ratón) desde el asa de cada parada.
  const listRef = useRef<HTMLOListElement>(null);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const targetAt = (y: number) => {
    const items = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-stop]") ?? [])];
    let to = items.length - 1;
    for (let k = 0; k < items.length; k++) { const r = items[k].getBoundingClientRect(); if (y < r.top + r.height / 2) { to = k; break; } }
    return to;
  };
  const onGrip = (i: number) => (e: React.PointerEvent) => {
    if (busy) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ from: i, to: i });
  };
  const onGripMove = (e: React.PointerEvent) => { if (drag) setDrag({ ...drag, to: targetAt(e.clientY) }); };
  const onGripUp = () => {
    if (!drag) return;
    const { from, to } = drag;
    setDrag(null);
    if (from === to) return;
    const ids = stops.map((s) => s.id);
    const [x] = ids.splice(from, 1);
    ids.splice(to, 0, x);
    void reorder(ids);
  };

  /** Reordena lo que falta desde tu ubicación actual; las visitas ya hechas se quedan como están. */
  const recalcFromHere = () => {
    if (!navigator.geolocation) return setErr("Este dispositivo no da la ubicación.");
    setBusy(true); setErr(null);
    navigator.geolocation.getCurrentPosition(async (p) => {
      const now = new Date();
      const minutes = Number(now.toLocaleString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", hour12: false })) * 60 + now.getMinutes();
      const r = await fetch(`/api/routes/${route.id}/recalc`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from: { lat: p.coords.latitude, lng: p.coords.longitude, minutes } }) });
      const j = await r.json().catch(() => ({}));
      setBusy(false);
      if (!r.ok) return setErr(j.error ?? "No se pudo recalcular");
      toast(j.reordered ? `Reordenadas ${j.reordered} paradas desde donde estás` : "No quedan paradas pendientes");
      router.refresh();
    }, () => { setBusy(false); setErr("No se pudo obtener tu ubicación. Revisa el permiso de ubicación del navegador."); }, { enableHighAccuracy: true, timeout: 15000 });
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
          {!locked && route.status === "accepted" && stops.length > 1 && <button className="btn-secondary" disabled={busy} onClick={recalcFromHere}><LocateFixed size={16} /> Recalcular desde donde estoy</button>}
        </div>
        {!locked && (
          <div className="border-t border-slate-100 pt-3">
            <button className="btn-secondary !text-red-600" disabled={busy} onClick={removeRoute}><Trash2 size={16} /> Eliminar ruta</button>
          </div>
        )}
        {err && <p className="text-red-600">{err}</p>}
      </div>

      {!locked && stops.length > 1 && <p className="-mb-4 text-xs text-slate-500">Arrastra una parada por el asa <GripVertical size={12} className="inline" /> para cambiar el orden.</p>}
      <ol ref={listRef} className="space-y-0">
        {stops.map((s, i) => {
          const driveMin = Math.round((s.drive_seconds_from_prev ?? 0) / 60);
          const firstNoDrive = i === 0 && !(s.drive_seconds_from_prev ?? 0);
          const dragging = drag?.from === i;
          const dropHere = drag && drag.to === i && drag.from !== i;
          return (
          <Fragment key={s.id}>
          {route.lunch_start && route.lunch_after === i && (
            <li className="my-2 flex items-center gap-3 rounded-lg border border-dashed border-slate-300 px-4 py-2.5 text-sm text-slate-600">🍽 Pausa para comer · {route.lunch_start.slice(0, 5)} (1 h)</li>
          )}
          {!firstNoDrive && (
            <li aria-hidden className="flex items-center gap-2 py-1.5 pl-5 text-xs text-slate-500">
              <span className="h-5 border-l-2 border-dotted border-slate-300" />
              <Car size={13} /> {i === 0 ? "Desde casa · " : ""}{fmtDuration(driveMin)} · {((s.distance_m_from_prev ?? 0) / 1000).toFixed(1)} km
            </li>
          )}
          <li data-stop className={`card relative flex items-stretch gap-2 text-sm transition ${dragging ? "opacity-60 ring-2 ring-brand-500" : ""} ${dropHere ? "ring-2 ring-brand-300" : ""}`}>
            {!locked && (
              <button type="button" aria-label="Arrastrar para reordenar" className="-my-1 -ml-2 flex w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded text-slate-400 active:cursor-grabbing"
                onPointerDown={onGrip(i)} onPointerMove={onGripMove} onPointerUp={onGripUp} onPointerCancel={() => setDrag(null)}>
                <GripVertical size={20} />
              </button>
            )}
            {!locked && <button className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-slate-400 hover:text-red-600" aria-label="Quitar de la ruta" disabled={busy} onClick={() => remove(s)}><X size={18} /></button>}
            <div className="min-w-0 flex-1 pr-8">
              <div className="flex items-baseline gap-2">
                <span className="text-base font-bold tabular-nums">{s.planned_arrival?.slice(0, 5) ?? "—"}</span>
                <span className="text-xs text-slate-500">{s.planned_minutes} min en tienda</span>
              </div>
              <div className="font-medium">
                {i + 1}. <Link href={`/stores/${s.store_id}`} className="hover:underline">{s.stores.name}</Link>
                {s.stores.audit && <span className="badge ml-2 bg-slate-900 text-slate-50">Audit</span>}
                {s.forced_priority && <span className="badge ml-2 bg-red-100 text-red-700">Prioritaria</span>}
              </div>
              <div className="text-slate-500">{s.stores.address}{s.stores.town ? `, ${s.stores.town}` : ""} · {s.reason}</div>
              {s.visit && <Link href={`/visits/${s.visit.id}`} className="text-xs underline">Visita: {s.visit.status === "completed" ? "hecha" : s.visit.status === "in_progress" ? "en curso" : s.visit.status === "planned" ? "prevista" : s.visit.status}</Link>}
              {!locked && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <label className="flex items-center gap-1 text-xs text-slate-500">
                    <input className="input h-11 w-16 text-center" inputMode="numeric" defaultValue={s.planned_minutes} onBlur={(e) => Number(e.target.value) !== s.planned_minutes && changeMinutes(s, Number(e.target.value))} aria-label="Minutos en tienda" /> min
                  </label>
                  <button className="btn-secondary h-11 w-11 !px-0" aria-label="Subir" disabled={busy || i === 0} onClick={() => move(i, -1)}><ArrowUp size={18} /></button>
                  <button className="btn-secondary h-11 w-11 !px-0" aria-label="Bajar" disabled={busy || i === stops.length - 1} onClick={() => move(i, 1)}><ArrowDown size={18} /></button>
                  <button className={`btn-secondary h-11 w-11 !px-0 ${s.forced_priority ? "!text-amber-500" : ""}`} aria-label="Prioritaria" disabled={busy} onClick={() => toggleForce(s)}><Star size={18} fill={s.forced_priority ? "currentColor" : "none"} /></button>
                </div>
              )}
            </div>
          </li>
          </Fragment>
          );
        })}
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
