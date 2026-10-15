"use client";
import { useEffect, useState } from "react";
import { LocateFixed, MapPin } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { haversineKm } from "@/lib/domain/geo";
import { currentPosition } from "@/lib/geoClient";
import type { PickedStore } from "./StorePicker";

const NEAR_KM = 0.15; // «Estás en…» a menos de 150 m

type Near = PickedStore & { km: number };

/** Detecta la tienda en la que estás con la ubicación del móvil y propone las más cercanas. */
export function NearbyStores({ onPick }: { onPick: (s: PickedStore) => void }) {
  const [state, setState] = useState<"loading" | "denied" | "ready">("loading");
  const [list, setList] = useState<Near[]>([]);

  async function locate() {
    setState("loading");
    const [pos, { data }] = await Promise.all([
      currentPosition(8000),
      supabaseBrowser().from("stores").select("id,name,town,lat,lng").eq("active", true).not("lat", "is", null).limit(5000),
    ]);
    if (!pos) return setState("denied");
    const near = ((data ?? []) as (PickedStore & { lat: number; lng: number })[])
      .map((s) => ({ id: s.id, name: s.name, town: s.town, km: haversineKm(pos, s) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 5);
    setList(near);
    setState("ready");
  }
  useEffect(() => { locate(); }, []);

  const fmt = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);
  const here = list[0] && list[0].km <= NEAR_KM ? list[0] : null;

  if (state === "loading") return <div className="card flex items-center gap-3 text-sm text-slate-500"><LocateFixed size={18} className="animate-pulse" /> Buscando dónde estás…</div>;
  if (state === "denied") return (
    <div className="card flex flex-wrap items-center gap-3 text-sm text-slate-600">
      <MapPin size={18} /> No se pudo usar tu ubicación. Elige la tienda abajo o
      <button type="button" className="font-semibold text-brand-600 underline" onClick={locate}>vuelve a intentarlo</button>.
    </div>
  );
  return (
    <div className="card space-y-3">
      {here && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-brand-50 p-3">
          <span className="min-w-0 flex-1 text-sm">¿Estás en <b>{here.name}</b>? <span className="text-slate-500">({fmt(here.km)})</span></span>
          <button type="button" className="btn" onClick={() => onPick(here)}>Sí, empezar aquí</button>
        </div>
      )}
      <div>
        <div className="label">{here ? "¿Otra tienda cercana?" : "Tiendas más cercanas"}</div>
        <ul className="divide-y divide-slate-100">
          {list.filter((s) => s.id !== here?.id).map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => onPick(s)} className="row-link -mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-2 rounded-lg px-2 text-left text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                <span className="shrink-0 tabular-nums text-slate-500">{fmt(s.km)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
