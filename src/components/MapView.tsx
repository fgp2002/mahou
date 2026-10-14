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
import { FilterSelect } from "./FilterSelect";
import { supabaseBrowser } from "@/lib/supabase/client";
import { StartVisitButton } from "./StartVisitButton";

export interface MapStore {
  id: string; name: string; banner: string | null; town: string | null; address: string | null; postal_code: string | null;
  lat: number; lng: number; audit: boolean; frequency: string; state: DueState; lastVisit: string | null; deadline: string | null; approx: boolean;
  logo: string | null; chain: string | null; storeType: string | null;
}

// Colores de estado: se conservan los de antes. Audit se indica con el anillo exterior negro.
const COLORS: Record<DueState, string> = { sin_obligacion: "#94a3b8", cumplida: "#16a34a", pendiente: "#d97706", proxima: "#ea580c", atrasada: "#dc2626" };
const STORE_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#555" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/></svg>';

function escapeAttr(s: string) { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)); }

function pinHtml(s: MapStore): string {
  const ring = s.audit ? `0 0 0 3px ${COLORS[s.state]}, 0 0 0 5.5px #111` : `0 0 0 3px ${COLORS[s.state]}`;
  const inner = s.logo
    ? `<img src="${escapeAttr(s.logo)}" alt="" decoding="async" draggable="false" style="width:24px;height:24px;object-fit:contain;pointer-events:none" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"/><span style="display:none">${STORE_SVG}</span>`
    : STORE_SVG;
  return `<div style="width:34px;height:34px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:${ring}${s.approx ? ";opacity:.8" : ""}">${inner}</div>`;
}

export function MapView({ stores }: { stores: MapStore[] }) {
  const el = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ref = useRef<{ L: any; map: any; cluster: any; me: any; markers: Map<string, any> } | null>(null);
  const [ready, setReady] = useState(false);
  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const [town, setTown] = useState("");
  const [freq, setFreq] = useState("");
  const [audit, setAudit] = useState("");
  const [banner, setBanner] = useState("");
  const [chain, setChain] = useState("");
  const [type, setType] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [sel, setSel] = useState<MapStore | null>(null);
  const [contacts, setContacts] = useState<{ id: string; full_name: string | null; phone: string | null }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const uniq = (xs: (string | null)[]): [string, string][] => ([...new Set(xs.filter(Boolean))].sort((a, b) => a!.localeCompare(b!, "es")) as string[]).map((x) => [x, x]);
  const towns = useMemo(() => uniq(stores.map((s) => s.town)), [stores]);
  const banners = useMemo(() => uniq(stores.map((s) => s.banner)), [stores]);
  const chains = useMemo(() => uniq(stores.map((s) => s.chain)), [stores]);
  const types = useMemo(() => uniq(stores.map((s) => s.storeType)), [stores]);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return stores.filter((s) =>
      (!state || s.state === state) && (!town || s.town === town) && (!freq || s.frequency === freq) && (!audit || s.audit) &&
      (!banner || s.banner === banner) && (!chain || s.chain === chain) && (!type || s.storeType === type) &&
      (!t || `${s.name} ${s.town} ${s.address}`.toLowerCase().includes(t)));
  }, [stores, q, state, town, freq, audit, banner, chain, type]);
  const filtersOn = !!(q || state || town || freq || audit || banner || chain || type);

  // Mapa y marcadores se crean UNA vez; los filtros solo cambian qué marcadores están en el clúster.
  useEffect(() => {
    let dead = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet.markercluster");
      if (dead || !el.current || ref.current) return;
      const map = L.map(el.current, { preferCanvas: true, zoomControl: true }).setView([36.72, -4.42], 9);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", { maxZoom: 19, subdomains: "abcd", attribution: "© OpenStreetMap © CARTO" }).addTo(map);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cluster = (L as any).markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 50, chunkedLoading: true, animate: false });
      map.addLayer(cluster);
      const markers = new Map();
      for (const s of stores) {
        const icon = L.divIcon({ className: "", iconSize: [34, 34], iconAnchor: [17, 17], html: pinHtml(s) });
        const m = L.marker([s.lat, s.lng], { icon, title: s.name, keyboard: true });
        m.on("click", () => setSel(s));
        markers.set(s.id, m);
      }
      ref.current = { L, map, cluster, me: null, markers };
      setReady(true);
    })();
    return () => { dead = true; ref.current?.map.remove(); ref.current = null; setReady(false); };
  }, [stores]);

  useEffect(() => {
    const r = ref.current;
    if (!r || !ready) return;
    const visible = filtered.map((s) => r.markers.get(s.id)).filter(Boolean);
    r.cluster.clearLayers();
    r.cluster.addLayers(visible);
    if (filtersOn && visible.length) r.map.fitBounds(r.cluster.getBounds().pad(0.15), { maxZoom: 15, animate: false });
  }, [filtered, ready, filtersOn]);

  useEffect(() => {
    setContacts([]);
    if (!sel) return;
    let live = true;
    (async () => {
      const { data } = await supabaseBrowser().from("store_contacts").select("id,full_name,phone").eq("store_id", sel.id).limit(3);
      if (live) setContacts((data ?? []) as { id: string; full_name: string | null; phone: string | null }[]);
    })();
    return () => { live = false; };
  }, [sel]);

  function locate() {
    if (!navigator.geolocation) return setMsg("Tu navegador no permite geolocalización.");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const r = ref.current;
        if (!r) return;
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
    else if (w.requestFullscreen) w.requestFullscreen().then(() => setTimeout(() => ref.current?.map.invalidateSize(), 200)).catch(() => setMsg("Este navegador no permite pantalla completa aquí."));
    else setMsg("Pantalla completa no disponible en este dispositivo.");
  }

  return (
    <div ref={wrap} className="flex h-[calc(100dvh-11.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] flex-col gap-2 bg-slate-50 md:h-[calc(100dvh-7.5rem)]">
      <div className="flex gap-2">
        <input className="input flex-1" placeholder="Buscar tienda o municipio…" aria-label="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-secondary md:hidden" aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}>Filtros{filtersOn ? " •" : ""}</button>
        <button className="btn-secondary" onClick={locate} aria-label="Mi ubicación">Mi ubicación</button>
        <button className="btn-secondary hidden md:inline-flex" onClick={fullscreen}>Pantalla completa</button>
      </div>
      <div className="fold" data-open={showFilters}>
        <div>
          <div className="grid grid-cols-2 items-end gap-2 pb-1 md:grid-cols-3 xl:grid-cols-4">
            <FilterSelect label="Estado" value={state} onChange={setState} options={Object.entries(STATE_LABEL)} />
            <FilterSelect label="Municipio" value={town} onChange={setTown} options={towns} />
            <FilterSelect label="Enseña" value={banner} onChange={setBanner} options={banners} all="Todas" />
            <FilterSelect label="Cadena" value={chain} onChange={setChain} options={chains} all="Todas" />
            <FilterSelect label="Tipo de tienda" value={type} onChange={setType} options={types} />
            <FilterSelect label="Periodicidad" value={freq} onChange={setFreq} options={Object.entries(FREQ_LABEL)} all="Todas" />
            <FilterSelect label="Audit" value={audit} onChange={setAudit} options={[["1", "Solo Audit"]]} all="Todas" />
            <button className="btn-secondary" disabled={!filtersOn} onClick={() => { setQ(""); setState(""); setTown(""); setFreq(""); setAudit(""); setBanner(""); setChain(""); setType(""); }}>Limpiar filtros</button>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
        {(Object.keys(COLORS) as DueState[]).map((k) => <span key={k} className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-full" style={{ background: COLORS[k] }} />{STATE_LABEL[k]}</span>)}
        <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-full bg-white" style={{ boxShadow: "0 0 0 1.5px #94a3b8, 0 0 0 3px #111" }} />Audit (aro negro)</span>
        <span>{filtered.length} de {stores.length}</span>
        {msg && <span className="text-red-600" role="alert">{msg}</span>}
      </div>
      <div className="relative isolate min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200">
        <div ref={el} className="h-full w-full" />
        {!ready && <div className="skeleton absolute inset-0 z-[400] rounded-none" aria-label="Cargando mapa" />}
        {sel && (
          <aside className="map-panel absolute inset-x-0 bottom-0 z-[500] max-h-[60%] overflow-y-auto rounded-t-3xl bg-white p-4 shadow-card md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-80 md:rounded-none" aria-label={`Ficha de ${sel.name}`}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold">{sel.name}</h3>
              <button aria-label="Cerrar ficha" className="-mr-2 -mt-2 flex h-11 w-11 items-center justify-center text-slate-500" onClick={() => setSel(null)}>✕</button>
            </div>
            <p className="text-sm text-slate-500">{sel.address}{sel.postal_code ? `, ${sel.postal_code}` : ""} {sel.town}</p>
            <dl className="my-3 space-y-1 text-sm">
              <div>Estado: <b>{STATE_LABEL[sel.state]}</b> {sel.audit && <span className="badge bg-slate-900 text-white">Audit</span>}</div>
              <div>Periodicidad: {FREQ_LABEL[sel.frequency]}</div>
              <div>Última visita: {sel.lastVisit ?? "ninguna"}</div>
              {sel.deadline && sel.state !== "cumplida" && <div>Vence: {sel.deadline}</div>}
              {sel.approx && <div className="text-amber-700">Ubicación aproximada: revísala en la ficha.</div>}
            </dl>
            {contacts.length > 0 && (
              <ul className="mb-3 space-y-1 text-sm">
                {contacts.map((c) => <li key={c.id}>{c.full_name ?? "Contacto"} {c.phone && <a className="underline" href={`tel:${c.phone}`}>{c.phone}</a>}</li>)}
              </ul>
            )}
            <div className="grid grid-cols-2 gap-2">
              <StartVisitButton storeId={sel.id} label="Iniciar visita" />
              <a className="btn-secondary" target="_blank" rel="noreferrer" href={googleMapsPlaceUrl(sel)}>Cómo llegar</a>
              <Link href={`/stores/${sel.id}`} className="btn-secondary col-span-2">Abrir ficha completa</Link>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
