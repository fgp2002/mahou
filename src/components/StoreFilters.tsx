"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FREQ_LABEL } from "@/lib/types";
import { STATE_LABEL } from "@/lib/domain/periodicity";
import { FilterSelect } from "./FilterSelect";

export interface Facets { towns: string[]; banners: string[]; chains: string[]; types: string[] }

/** Filtros que se aplican solos (sin botón) y mantienen la URL, para poder volver atrás o compartir. */
export function StoreFilters({ facets }: { facets: Facets }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function push(next: Record<string, string>) {
    const u = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) (v ? u.set(k, v) : u.delete(k));
    u.delete("page");
    start(() => router.replace(`${path}?${u}`, { scroll: false }));
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const f = (name: string, label: string, options: [string, string][], all?: string) => (
    <FilterSelect label={label} value={sp.get(name) ?? ""} onChange={(v) => push({ [name]: v })} options={options} all={all} />
  );
  const same = (xs: string[]): [string, string][] => xs.map((x) => [x, x]);
  const anyFilter = ["q", "state", "town", "banner", "chain", "type", "freq", "audit", "geo"].some((k) => sp.get(k));

  return (
    <div className="card space-y-3" aria-busy={pending}>
      <input aria-label="Buscar" className="input" placeholder="Buscar nombre, municipio, dirección, ID" value={q}
        onChange={(e) => { setQ(e.target.value); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => push({ q: e.target.value.trim() }), 250); }} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {f("state", "Estado", Object.entries(STATE_LABEL))}
        {f("town", "Municipio", same(facets.towns))}
        {f("banner", "Enseña", same(facets.banners), "Todas")}
        {f("chain", "Cadena", same(facets.chains), "Todas")}
        {f("type", "Tipo de tienda", same(facets.types))}
        {f("freq", "Periodicidad", Object.entries(FREQ_LABEL), "Todas")}
        {f("audit", "Audit", [["1", "Solo Audit"]], "Todas")}
        {f("geo", "Ubicación", [["no", "Sin ubicación"]], "Todas")}
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-secondary" disabled={!anyFilter} onClick={() => { setQ(""); start(() => router.replace(path, { scroll: false })); }}>Limpiar filtros</button>
        {pending && <span className="text-xs text-slate-400">Actualizando…</span>}
      </div>
    </div>
  );
}
