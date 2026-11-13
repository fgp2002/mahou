"use client";
import { useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MultiFilter } from "./MultiFilter";
import { FilterSelect } from "./FilterSelect";

export interface FilterDef { name: string; label: string; options: [string, string][]; multi?: boolean; all?: string }

/** Barra de filtros que se aplican solos y viven en la URL (se pueden compartir, volver atrás o exportar con ellos). */
export function FilterBar({ filters, search, extra }: { filters: FilterDef[]; search?: string; extra?: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function push(next: Record<string, string | string[]>) {
    const u = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      u.delete(k);
      for (const x of Array.isArray(v) ? v : [v]) if (x) u.append(k, x);
    }
    u.delete("page");
    start(() => router.replace(`${path}?${u}`, { scroll: false }));
  }
  const any = filters.some((f) => sp.get(f.name)) || !!sp.get("q");

  return (
    <div className="card space-y-3" aria-busy={pending}>
      {search && (
        <input aria-label="Buscar" className="input" placeholder={search} value={q}
          onChange={(e) => { setQ(e.target.value); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => push({ q: e.target.value.trim() }), 250); }} />
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {filters.map((f) => f.multi === false
          ? <FilterSelect key={f.name} label={f.label} value={sp.get(f.name) ?? ""} onChange={(v) => push({ [f.name]: v })} options={f.options} all={f.all} />
          : <MultiFilter key={f.name} label={f.label} values={sp.getAll(f.name)} onChange={(v) => push({ [f.name]: v })} options={f.options} all={f.all} />)}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-secondary" disabled={!any} onClick={() => { setQ(""); const u = new URLSearchParams(); for (const k of ["period", "from", "to", "view", "tab"]) { const v = sp.get(k); if (v) u.set(k, v); } start(() => router.replace(`${path}${u.size ? `?${u}` : ""}`, { scroll: false })); }}>Limpiar filtros</button>
        {extra}
        {pending && <span className="text-xs text-slate-400">Actualizando…</span>}
      </div>
    </div>
  );
}
