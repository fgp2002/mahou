"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { FREQ_LABEL, type Store } from "@/lib/types";

const FIELDS = ["name", "banner", "chain", "store_type", "area", "kam", "address", "town", "postal_code", "province", "gpv", "notes"] as const;
const LABELS: Record<string, string> = {
  name: "Nombre", banner: "Enseña", chain: "Cadena", store_type: "Tipo", area: "Zona", kam: "KAM",
  address: "Dirección", town: "Municipio", postal_code: "C.P.", province: "Provincia", gpv: "GPV", notes: "Notas",
};

export function StoreForm({ store }: { store?: Store }) {
  const router = useRouter();
  const [v, setV] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const f of FIELDS) o[f] = ((store as unknown as Record<string, string | null>)?.[f] ?? "") as string;
    o.lat = store?.lat?.toString() ?? "";
    o.lng = store?.lng?.toString() ?? "";
    o.frequency = store?.frequency ?? "semanal";
    return o;
  });
  const [audit, setAudit] = useState(store?.audit ?? false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) return setMsg("El nombre es obligatorio.");
    const lat = v.lat === "" ? null : Number(v.lat.replace(",", "."));
    const lng = v.lng === "" ? null : Number(v.lng.replace(",", "."));
    if ((lat !== null && (Number.isNaN(lat) || lat < -90 || lat > 90)) || (lng !== null && (Number.isNaN(lng) || lng < -180 || lng > 180)))
      return setMsg("Coordenadas no válidas.");
    setBusy(true);
    setMsg(null);
    const payload: Record<string, unknown> = { frequency: v.frequency, audit, lat, lng };
    for (const f of FIELDS) payload[f] = v[f].trim() === "" ? null : v[f].trim();
    payload.name = v.name.trim();
    const sb = supabaseBrowser();
    if (!store) {
      if (lat !== null && lng !== null) payload.geocode_status = "manual";
      const { data, error } = await sb.from("stores").insert(payload).select("id").single();
      setBusy(false);
      if (error) return setMsg("No se pudo crear: " + error.message);
      router.replace(`/stores/${data.id}`);
      router.refresh();
      return;
    }
    // Protege los campos editados a mano frente a futuras importaciones.
    const changed = new Set(store.manual_overrides ?? []);
    const old = store as unknown as Record<string, unknown>;
    for (const [k, val] of Object.entries(payload)) if ((old[k] ?? null) !== val) changed.add(k);
    payload.manual_overrides = [...changed];
    if (lat !== store.lat || lng !== store.lng) payload.geocode_status = lat !== null && lng !== null ? "manual" : "pending";
    const { error } = await sb.from("stores").update(payload).eq("id", store.id);
    setBusy(false);
    if (error) return setMsg("No se pudo guardar: " + error.message);
    setMsg("Guardado.");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="card space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f} className={f === "notes" || f === "address" ? "sm:col-span-2" : ""}>
            <label className="label">{LABELS[f]}</label>
            {f === "notes" ? (
              <textarea className="input" rows={3} value={v[f]} onChange={(e) => setV({ ...v, [f]: e.target.value })} />
            ) : (
              <input className="input" value={v[f]} onChange={(e) => setV({ ...v, [f]: e.target.value })} />
            )}
          </div>
        ))}
        <div>
          <label className="label">Latitud</label>
          <input className="input" inputMode="decimal" value={v.lat} onChange={(e) => setV({ ...v, lat: e.target.value })} />
        </div>
        <div>
          <label className="label">Longitud</label>
          <input className="input" inputMode="decimal" value={v.lng} onChange={(e) => setV({ ...v, lng: e.target.value })} />
        </div>
        <div>
          <label className="label">Periodicidad</label>
          <select className="input" value={v.frequency} onChange={(e) => setV({ ...v, frequency: e.target.value })}>
            {Object.entries(FREQ_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 pt-5 text-sm">
          <input type="checkbox" checked={audit} onChange={(e) => setAudit(e.target.checked)} /> Audit (prioridad máxima)
        </label>
      </div>
      {msg && <p className="text-sm text-slate-600">{msg}</p>}
      <button className="btn" disabled={busy}>{busy ? "Guardando…" : store ? "Guardar cambios" : "Crear tienda"}</button>
    </form>
  );
}
