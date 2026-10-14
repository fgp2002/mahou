"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import type { DueState } from "@/lib/domain/periodicity";
import { STATE_LABEL } from "@/lib/domain/periodicity";
import { FREQ_LABEL } from "@/lib/types";
import { googleMapsPlaceUrl } from "@/lib/domain/geo";

export interface MapStore {
  id: string; name: string; banner: string | null; town: string | null; address: string | null; postal_code: string | null;
  lat: number; lng: number; audit: boolean; frequency: string; state: DueState; lastVisit: string | null; deadline: string | null; approx: boolean;
}

const COLORS: Record<DueState, string> = { sin_obligacion: "#94a3b8", cumplida: "#16a34a", pendiente: "#d97706", proxima: "#ea580c", atrasada: "#dc2626" };

export function MapView({ stores }: { stores: MapStore[] }) {
  const el = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ref = useRef<{ L: any; map: any; cluster: any; me: any } | null>(null);
  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const [town, setTown] = useState("");
  const [freq, setFreq] = useState("");
  const [audit, setAudit] = useState(false);
  const [sel, setSel] = useState<MapStore | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const towns = useMemo(() => [...new Set(stores.map((s) => s.town).filter(Boolean))].sort() as string[], [stores]);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return stores.filter((s) =>
      (!state || s.state === state) && (!town || s.town === town) && (!freq || s.frequency === freq) && (!audit || s.audit) &&
      (!t || `${s.name} ${s.town} ${s.address}`.toLowerCase().includes(t)));
  }, [stores, q, state, town, freq, audit]);

  useEffect(() => {
    let dead = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet.markercluster");
      if (dead || !el.current || ref.current) return;
      const map = L.map(el.current).setView([36.72, -4.42], 9);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cluster = (L as any).markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 45 });
      map.addLayer(cluster);
      ref.current = { L, map, cluster, me: null };
      setMsg("");
    })();
    return () => { dead = true; ref.current?.map.remove(); ref.current = null; };
  }, []);

  useEffect(() => {
    const r = ref.current;
    if (!r) return;
    r.cluster.clearLayers();
    const markers = filtered.map((s) => {
      const color = COLORS[s.state];
      const init = (s.banner ?? s.name).replace(/[^A-Za-zÁÉÍÓÚÑ0-9]/gi, "").slice(0, 2).toUpperCase();
      const icon = r.L.divIcon({
        className: "",
        iconSize: [34, 34],
        html: `<div style="width:34px;height:34px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font:700 12px system-ui;border:3px solid ${s.audit ? "#4f46e5" : "#fff"};box-shadow:0 1px 4px rgba(0,0,0,.4)${s.approx ? ";opacity:.75" : ""}">${init}</div>`,
      });
      const m = r.L.marker([s.lat, s.lng], { icon, title: s.name });
      m.on("click", () => setSel(s));
      return m;
    });
    r.cluster.addLayers(markers);
    if (markers.length && (q || state || town || freq || audit)) r.map.fitBounds(r.cluster.getBounds().pad(0.1), { maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, msg]);

  function locate() {
    if (!navigator.geolocation) return setMsg("Tu navegador no permite geolocalización.");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const r = ref.current!;
        r.me?.remove();
        r.me = r.L.circleMarker([p.coords.latitude, p.coords.longitude], { radius: 8, color: "#2563eb", fillOpacity: 0.8 }).addTo(r.map);
        r.map.setView([p.coords.latitude, p.coords.longitude], 13);
        setMsg(null);
      },
      () => setMsg("No se pudo obtener tu ubicación (revisa el permiso del navegador)."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function fullscreen() {
    const w = wrap.current;
    if (!w) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else w.requestFullscreen?.().then(() => setTimeout(() => ref.current?.map.invalidateSize(), 200));
  }

  return (
    <div ref={wrap} className="flex h-[calc(100vh-7rem)] flex-col gap-2 bg-slate-50 md:h-[calc(100vh-3rem)]">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-7">
        <input className="input col-span-2" placeholder="Buscar tienda o municipio…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">Estado</option>
          {Object.entries(STATE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select className="input" value={town} onChange={(e) => setTown(e.target.value)}>
          <option value="">Municipio</option>
          {towns.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select className="input" value={freq} onChange={(e) => setFreq(e.target.value)}>
          <option value="">Periodicidad</option>
          {Object.entries(FREQ_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={audit} onChange={(e) => setAudit(e.target.checked)} /> Solo Audit</label>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={locate}>Mi ubicación</button>
          <button className="btn-secondary" onClick={fullscreen}>Pantalla completa</button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
        {Object.entries(COLORS).map(([k, c]) => <span key={k} className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-full" style={{ background: c }} />{STATE_LABEL[k as DueState]}</span>)}
        <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-full border-2 border-indigo-600" />Audit</span>
        <span>{filtered.length} de {stores.length} tiendas con ubicación</span>
        {msg && <span className="text-red-600">{msg}</span>}
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200">
        <div ref={el} className="h-full w-full" />
        {sel && (
          <aside className="absolute inset-x-0 bottom-0 z-[500] max-h-[55%] overflow-y-auto bg-white p-4 shadow-xl md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-80">
            <button className="float-right text-slate-400" onClick={() => setSel(null)}>✕</button>
            <h3 className="font-semibold">{sel.name}</h3>
            <p className="text-sm text-slate-500">{sel.address}{sel.postal_code ? `, ${sel.postal_code}` : ""} {sel.town}</p>
            <dl className="my-2 space-y-1 text-sm">
              <div>Estado: <b>{STATE_LABEL[sel.state]}</b></div>
              <div>Periodicidad: {FREQ_LABEL[sel.frequency]} {sel.audit && <span className="badge bg-indigo-100 text-indigo-700">Audit</span>}</div>
              <div>Última visita: {sel.lastVisit ?? "ninguna"}</div>
              {sel.deadline && sel.state !== "cumplida" && <div>Vence: {sel.deadline}</div>}
              {sel.approx && <div className="text-amber-700">Ubicación aproximada: revísala en la ficha.</div>}
            </dl>
            <div className="flex flex-wrap gap-2">
              <Link href={`/stores/${sel.id}`} className="btn-secondary">Ficha</Link>
              <Link href={`/visits/new?store=${sel.id}`} className="btn">Visitar</Link>
              <a className="btn-secondary" target="_blank" rel="noreferrer" href={googleMapsPlaceUrl(sel)}>Cómo llegar</a>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
