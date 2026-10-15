"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Camera, Search } from "lucide-react";
import { VISIT_TYPES } from "@/lib/types";
import { MultiFilter } from "./MultiFilter";
import { EmptyState } from "./ui";

export interface VisitRow {
  id: string; date: string; status: string; type: string; minutes: number | null; manual: boolean; note: string | null;
  storeId: string; store: string; town: string | null; banner: string | null; photos: number;
}

const ST: Record<string, string> = { planned: "Planificada", in_progress: "En curso", completed: "Completada", cancelled: "Cancelada" };
const ST_STYLE: Record<string, string> = {
  completed: "bg-st-ok text-[#fff]", in_progress: "bg-brand-600 text-[rgb(var(--on-accent))]", cancelled: "bg-st-none text-[#fff]", planned: "bg-slate-200 text-slate-700",
};
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const uniq = (xs: (string | null)[]): [string, string][] => [...new Set(xs.filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "es")).map((x) => [x, x]);

/** Historial de visitas de todas las tiendas, agrupado por mes, con búsqueda y filtros. */
export function VisitsHistory({ rows }: { rows: VisitRow[] }) {
  const [q, setQ] = useState("");
  const [stores, setStores] = useState<string[]>([]);
  const [banners, setBanners] = useState<string[]>([]);
  const [status, setStatus] = useState<string[]>(["completed", "in_progress"]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const storeOpts = useMemo(() => [...new Map(rows.map((r) => [r.storeId, `${r.store}${r.town ? " · " + r.town : ""}`])).entries()].sort((a, b) => a[1].localeCompare(b[1], "es")) as [string, string][], [rows]);
  const bannerOpts = useMemo(() => uniq(rows.map((r) => r.banner)), [rows]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) =>
      (!t || `${r.store} ${r.town ?? ""} ${r.banner ?? ""} ${r.note ?? ""}`.toLowerCase().includes(t)) &&
      (!stores.length || stores.includes(r.storeId)) && (!banners.length || banners.includes(r.banner ?? "")) &&
      (!status.length || status.includes(r.status)) && (!from || r.date >= from) && (!to || r.date <= to));
  }, [rows, q, stores, banners, status, from, to]);
  const groups = useMemo(() => {
    const m = new Map<string, VisitRow[]>();
    for (const r of shown) m.set(r.date.slice(0, 7), [...(m.get(r.date.slice(0, 7)) ?? []), r]);
    return [...m];
  }, [shown]);
  const dirty = q || stores.length || banners.length || from || to || status.join() !== "completed,in_progress";

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input !pl-10" placeholder="Buscar tienda, municipio, enseña o nota" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar en el historial" />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <MultiFilter label="Tienda" values={stores} onChange={setStores} options={storeOpts} all="Todas" />
          <MultiFilter label="Enseña" values={banners} onChange={setBanners} options={bannerOpts} all="Todas" />
          <MultiFilter label="Estado" values={status} onChange={setStatus} options={Object.entries(ST)} />
          <div className="min-w-0"><label className="label" htmlFor="vh-from">Desde</label><input id="vh-from" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="min-w-0"><label className="label" htmlFor="vh-to">Hasta</label><input id="vh-to" type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>{shown.length} visitas</span>
          {dirty && <button className="underline" onClick={() => { setQ(""); setStores([]); setBanners([]); setStatus(["completed", "in_progress"]); setFrom(""); setTo(""); }}>Limpiar filtros</button>}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="card"><EmptyState title="No hay visitas" text={rows.length ? "Ninguna visita coincide con los filtros." : "Empieza tu primera visita y quedará registrada aquí."}><Link href="/visits/new" className="btn">Iniciar visita</Link></EmptyState></div>
      ) : groups.map(([ym, items]) => (
        <section key={ym} className="card overflow-hidden !p-0">
          <h2 className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span>{MONTHS[Number(ym.slice(5, 7)) - 1]} {ym.slice(0, 4)}</span><span>{items.length}</span>
          </h2>
          <ul className="divide-y divide-slate-100">
            {items.map((v) => (
              <li key={v.id}>
                <Link href={`/visits/${v.id}`} className="row-link flex items-start gap-3 px-4 py-3">
                  <span className="w-12 shrink-0 text-center">
                    <span className="block text-lg font-bold leading-none">{v.date.slice(8, 10)}</span>
                    <span className="block text-[11px] text-slate-500">{MONTHS[Number(v.date.slice(5, 7)) - 1].slice(0, 3)}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{v.store}</span>
                    <span className="block truncate text-xs text-slate-500">{[v.banner, v.town, VISIT_TYPES[v.type], v.minutes != null ? `${v.minutes} min` : null, v.manual ? "manual" : null].filter(Boolean).join(" · ")}</span>
                    {v.note && <span className="mt-0.5 block truncate text-xs text-slate-600">{v.note}</span>}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className={clsx("badge font-bold", ST_STYLE[v.status])}>{ST[v.status]}</span>
                    {v.photos > 0 && <span className="flex items-center gap-1 text-[11px] text-slate-500"><Camera size={12} />{v.photos}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-center text-xs text-slate-400">Se muestran las últimas 1.000 visitas.</p>
    </div>
  );
}
