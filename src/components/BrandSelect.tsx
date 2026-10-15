"use client";
import { useEffect, useId, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export interface Brand { id: string; name: string }
const NEW = "__new__";
let cache: Brand[] | null = null;
const listeners = new Set<(b: Brand[]) => void>();

async function loadBrands(force = false): Promise<Brand[]> {
  if (cache && !force) return cache;
  const { data } = await supabaseBrowser().from("payment_brands").select("id,name").eq("active", true).order("name");
  cache = (data ?? []) as Brand[];
  listeners.forEach((l) => l(cache!));
  return cache;
}

/** Desplegable de marca del pago (Mahou, San Miguel, Alhambra…) con «＋ Nueva marca…». Sin duplicados. */
export function BrandSelect({ value, onChange, label = "Marca", compact = false }: { value: string | null; onChange: (b: Brand | null) => void; label?: string; compact?: boolean }) {
  const id = useId();
  const [brands, setBrands] = useState<Brand[]>(cache ?? []);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    listeners.add(setBrands);
    loadBrands(true).then(setBrands);
    return () => { listeners.delete(setBrands); };
  }, []);

  async function create() {
    const n = name.trim().replace(/\s+/g, " ");
    if (!n) return;
    const existing = brands.find((b) => b.name.toLowerCase() === n.toLowerCase());
    if (existing) { onChange(existing); setCreating(false); setName(""); return; }
    const { data, error } = await supabaseBrowser().from("payment_brands").insert({ name: n }).select("id,name").single();
    if (error || !data) {
      const all = await loadBrands(true);
      const again = all.find((b) => b.name.toLowerCase() === n.toLowerCase());
      if (again) { onChange(again); setCreating(false); setName(""); return; }
      return setErr(error?.message ?? "No se pudo crear la marca");
    }
    await loadBrands(true);
    onChange(data as Brand);
    setCreating(false);
    setName("");
  }

  return (
    <div className="min-w-0">
      {!compact && <label className="label" htmlFor={id}>{label}</label>}
      {creating ? (
        <div className="flex gap-1.5">
          <input id={id} className="input" autoFocus placeholder="Nombre de la marca" value={name} maxLength={80}
            onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); create(); } if (e.key === "Escape") setCreating(false); }} />
          <button type="button" className="btn" onClick={create}>Crear</button>
          <button type="button" className="btn-secondary" onClick={() => setCreating(false)} aria-label="Cancelar">✕</button>
        </div>
      ) : (
        <select id={id} className="input" aria-label={label} value={value ?? ""} onChange={(e) => {
          if (e.target.value === NEW) { setCreating(true); setErr(null); return; }
          onChange(brands.find((b) => b.id === e.target.value) ?? null);
        }}>
          <option value="">Sin marca</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          <option value={NEW}>＋ Nueva marca…</option>
        </select>
      )}
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}
