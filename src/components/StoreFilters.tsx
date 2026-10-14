"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FREQ_LABEL } from "@/lib/types";

/** Filtros que se aplican solos (sin botón) y mantienen la URL, para poder volver atrás o compartir. */
export function StoreFilters({ towns, banners }: { towns: string[]; banners: string[] }) {
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

  const sel = (name: string, label: string, opts: [string, string][]) => (
    <select aria-label={label} className="input" value={sp.get(name) ?? ""} onChange={(e) => push({ [name]: e.target.value })}>
      <option value="">{label}</option>
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
  return (
    <div className="card grid grid-cols-2 gap-2 md:grid-cols-6" aria-busy={pending}>
      <input aria-label="Buscar" className="input col-span-2" placeholder="Buscar nombre, municipio, dirección, ID" value={q}
        onChange={(e) => { setQ(e.target.value); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => push({ q: e.target.value.trim() }), 250); }} />
      {sel("town", "Municipio", towns.map((t) => [t, t]))}
      {sel("banner", "Enseña", banners.map((t) => [t, t]))}
      {sel("freq", "Periodicidad", Object.entries(FREQ_LABEL))}
      {sel("audit", "Audit", [["1", "Solo Audit"]])}
      {sel("geo", "Ubicación", [["no", "Sin ubicación"]])}
      <button className="btn-secondary" onClick={() => { setQ(""); start(() => router.replace(path, { scroll: false })); }}>Limpiar</button>
      {pending && <span className="col-span-2 text-xs text-slate-400">Actualizando…</span>}
    </div>
  );
}
