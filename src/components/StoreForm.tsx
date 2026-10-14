"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { FREQ_LABEL, type Store } from "@/lib/types";
import { Field } from "./Field";
import { toast } from "./Toast";

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
    toast("Tienda guardada");
    router.refresh();
  }

  return (
    <form onSubmit={save} className={store ? "space-y-4" : "card space-y-4"}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <Field key={f} label={LABELS[f]} value={v[f]} onChange={(x) => setV({ ...v, [f]: x })} required={f === "name"}
            rows={f === "notes" ? 4 : undefined} className={f === "notes" || f === "address" ? "sm:col-span-2" : ""} />
        ))}
        <Field label="Latitud" inputMode="decimal" value={v.lat} onChange={(x) => setV({ ...v, lat: x })} />
        <Field label="Longitud" inputMode="decimal" value={v.lng} onChange={(x) => setV({ ...v, lng: x })} />
        <Field label="Periodicidad" value={v.frequency} onChange={(x) => setV({ ...v, frequency: x })} options={Object.entries(FREQ_LABEL)} />
        <label className="flex min-h-[3.4rem] items-center gap-3 rounded-lg border border-slate-300 bg-white px-4 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-[rgb(var(--slate-900))]" checked={audit} onChange={(e) => setAudit(e.target.checked)} /> Audit (prioridad máxima)
        </label>
      </div>
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      <button className="btn w-full sm:w-auto" disabled={busy}>{busy ? "Guardando…" : store ? "Guardar cambios" : "Crear tienda"}</button>
    </form>
  );
}
