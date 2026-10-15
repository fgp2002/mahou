"use client";
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { Maximize2, Minimize2 } from "lucide-react";
import { decodePolyline } from "@/lib/domain/geo";

export interface PreviewStop { lat: number; lng: number; name: string; done: boolean; next: boolean }

const pinHtml = (n: number, s: PreviewStop) =>
  `<div class="rp-pin${s.done ? " rp-done" : ""}${s.next ? " rp-next" : ""}">${s.done ? "✓" : n}</div>`;

/** Vista previa de la ruta: salida desde casa, paradas numeradas y trazado por carretera animado. */
export function RoutePreview({ stops, start, polyline }: { stops: PreviewStop[]; start: { lat: number; lng: number } | null; polyline: string | null }) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const [big, setBig] = useState(false);

  useEffect(() => {
    let dead = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (dead || !el.current || mapRef.current) return;
      const map = L.map(el.current, { zoomControl: false, attributionControl: true, zoomSnap: 0.25, wheelPxPerZoomLevel: 90 });
      L.control.zoom({ position: "bottomright" }).addTo(map);
      const tile = { maxZoom: 20, maxNativeZoom: 19, keepBuffer: 4, updateWhenZooming: false };
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { ...tile, attribution: "Imágenes © Esri" }).addTo(map);
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}", tile).addTo(map);

      const svg = L.svg();
      const line: [number, number][] = polyline
        ? decodePolyline(polyline)
        : [...(start ? [[start.lat, start.lng] as [number, number]] : []), ...stops.map((s) => [s.lat, s.lng] as [number, number])];
      if (line.length > 1) {
        L.polyline(line, { renderer: svg, color: "#fff", weight: 8, opacity: 0.9, lineCap: "round", lineJoin: "round" }).addTo(map);
        L.polyline(line, { renderer: svg, color: "#CE1A2B", weight: 4.5, lineCap: "round", lineJoin: "round", className: "rp-line" }).addTo(map);
        L.polyline(line, { renderer: svg, color: "#fff", weight: 2, dashArray: "1 14", lineCap: "round", className: "rp-flow" }).addTo(map);
      }
      if (start) {
        L.marker([start.lat, start.lng], { icon: L.divIcon({ className: "", iconSize: [34, 34], iconAnchor: [17, 17], html: '<div class="rp-home" title="Salida">⌂</div>' }), title: "Salida (casa)", zIndexOffset: 500 }).addTo(map);
      }
      stops.forEach((s, i) => {
        L.marker([s.lat, s.lng], { icon: L.divIcon({ className: "", iconSize: [30, 30], iconAnchor: [15, 15], html: pinHtml(i + 1, s) }), title: `${i + 1}. ${s.name}`, zIndexOffset: s.next ? 1000 : 0 })
          .bindTooltip(`${i + 1}. ${s.name}`, { direction: "top", offset: [0, -14] })
          .addTo(map);
      });
      const all = [...(start ? [[start.lat, start.lng] as [number, number]] : []), ...stops.map((s) => [s.lat, s.lng] as [number, number]), ...line];
      if (all.length) map.fitBounds(L.latLngBounds(all).pad(0.12), { animate: false, maxZoom: 15 });
      else map.setView([36.72, -4.42], 10);
      mapRef.current = map;
    })();
    // Pellizcar dentro del mapa solo hace zoom en el mapa, nunca en la página (Safari iOS).
    const node = el.current;
    const stop = (e: Event) => e.preventDefault();
    node?.addEventListener("gesturestart", stop, { passive: false });
    node?.addEventListener("gesturechange", stop, { passive: false });
    return () => {
      dead = true;
      node?.removeEventListener("gesturestart", stop);
      node?.removeEventListener("gesturechange", stop);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [stops, start, polyline]);

  useEffect(() => { const t = setTimeout(() => mapRef.current?.invalidateSize(), 260); return () => clearTimeout(t); }, [big]);

  return (
    <div className={big ? "fixed inset-0 z-[80] bg-black p-0 fade-in" : "relative"}>
      <div ref={el} className={big ? "map-touch h-full w-full" : "map-touch h-72 w-full overflow-hidden rounded-xl border border-slate-200 md:h-96"} aria-label="Vista previa de la ruta" />
      <button type="button" onClick={() => setBig(!big)} aria-label={big ? "Cerrar vista grande" : "Ver en grande"}
        className={`absolute z-[500] flex h-10 w-10 items-center justify-center rounded-lg bg-white text-slate-900 shadow-pop ${big ? "right-4 top-[max(1rem,env(safe-area-inset-top))]" : "right-3 top-3"}`}>
        {big ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
      </button>
    </div>
  );
}
