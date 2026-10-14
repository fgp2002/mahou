"use client";
import dynamic from "next/dynamic";
import type { MapStore } from "./MapView";

const MapView = dynamic(() => import("./MapView").then((m) => m.MapView), { ssr: false, loading: () => <p className="p-4 text-sm text-slate-500">Cargando mapa…</p> });

export function MapLoader({ stores }: { stores: MapStore[] }) {
  return <MapView stores={stores} />;
}
