"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export interface PickedStore { id: string; name: string; town: string | null }

export function StorePicker({ value, onChange }: { value: PickedStore | null; onChange: (s: PickedStore | null) => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<PickedStore[]>([]);

  useEffect(() => {
    const term = q.replace(/[,()%*\\]/g, " ").trim();
    if (term.length < 2) {
      setRes([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabaseBrowser()
        .from("stores").select("id,name,town").eq("active", true)
        .or(`name.ilike.%${term}%,town.ilike.%${term}%,address.ilike.%${term}%`).order("name").limit(8);
      setRes((data ?? []) as PickedStore[]);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  if (value)
    return (
      <div className="flex items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
        <span>{value.name} <span className="text-slate-400">· {value.town}</span></span>
        <button type="button" className="text-brand-700 underline" onClick={() => onChange(null)}>Cambiar</button>
      </div>
    );
  return (
    <div className="relative">
      <input className="input" placeholder="Busca tienda por nombre o municipio…" value={q} onChange={(e) => setQ(e.target.value)} />
      {res.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {res.map((s) => (
            <li key={s.id}>
              <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => onChange(s)}>
                {s.name} <span className="text-slate-400">· {s.town}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
