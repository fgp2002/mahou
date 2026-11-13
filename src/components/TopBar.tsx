"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, Search, X } from "lucide-react";
import clsx from "clsx";

export interface AlertItem { id: string; message: string; severity: string }
interface Hit { group: string; id: string; title: string; sub: string; href: string }

const TITLES: [string, string][] = [["/map", "Mapa"], ["/stores", "Tiendas"], ["/inventory", "Inventario"], ["/visits", "Visitas"], ["/gallery", "Galería"], ["/incidents", "Incidencias"], ["/economy", "Economía"], ["/agreements", "Acuerdos"], ["/routes", "Rutas"], ["/reports", "Informes"], ["/settings", "Ajustes"]];

/** Barra superior fija: título que aparece al bajar, búsqueda global y campana de alertas. */
export function TopBar({ unread, alerts }: { unread: number; alerts: AlertItem[] }) {
  const path = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [bell, setBell] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const title = path === "/" ? "Hoy" : TITLES.find(([p]) => path.startsWith(p))?.[1] ?? "";

  useEffect(() => {
    const root = document.querySelector(".scroll-root");
    if (!root) return;
    const on = () => setScrolled(root.scrollTop > 36);
    on();
    root.addEventListener("scroll", on, { passive: true });
    return () => root.removeEventListener("scroll", on);
  }, [path]);

  useEffect(() => { setSearchOpen(false); setBell(false); setQ(""); }, [path]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const j = r.ok ? await r.json() : { hits: [] };
        if (!cancelled) setHits(j.hits ?? []);
      } catch { if (!cancelled) setHits([]); }
      if (!cancelled) setLoading(false);
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  useEffect(() => {
    const out = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) { setSearchOpen(false); setBell(false); } };
    document.addEventListener("mousedown", out);
    return () => document.removeEventListener("mousedown", out);
  }, []);

  return (
    <div ref={box} className="no-print sticky top-0 z-40 -mx-4 bg-slate-50/85 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl md:-mx-6 md:px-6 xl:-mx-8 xl:px-8">
      <div className="page relative flex items-center gap-2">
        <div className={clsx("min-w-0 shrink-0 text-base font-semibold transition-all duration-200 md:hidden", scrolled && title ? "w-auto opacity-100" : "w-0 overflow-hidden opacity-0")}>{title}</div>
        <div className="relative min-w-0 flex-1">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setSearchOpen(true); }} onFocus={() => setSearchOpen(true)}
            placeholder="Buscar tiendas, contactos, pagos, elementos…" aria-label="Buscar" className="input !rounded-full !pl-10 !pr-9" />
          {q && <button aria-label="Borrar búsqueda" onClick={() => { setQ(""); setHits([]); }} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400"><X size={16} /></button>}
          {searchOpen && q.trim().length >= 2 && (
            <div className="sheet-in absolute inset-x-0 top-full mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
              {hits.length === 0 ? <div className="p-4 text-sm text-slate-500">{loading ? "Buscando…" : "Sin resultados."}</div> : (
                <ul className="max-h-[70vh] overflow-y-auto text-sm">
                  {hits.map((h, k) => (
                    <li key={h.group + h.id}>
                      {(k === 0 || hits[k - 1].group !== h.group) && <div className="sticky top-0 bg-slate-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{h.group}</div>}
                      <Link href={h.href} className="row-link flex min-h-12 flex-col justify-center border-t border-slate-100 px-4 py-2"><b className="truncate">{h.title}</b>{h.sub && <span className="truncate text-xs text-slate-500">{h.sub}</span>}</Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <div className="relative shrink-0">
          <button aria-label={`Alertas${unread ? `, ${unread} sin leer` : ""}`} aria-expanded={bell} onClick={() => { setBell(!bell); setSearchOpen(false); }}
            className="tap relative flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white">
            <Bell size={19} />
            {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-semibold text-white">{unread > 99 ? "99+" : unread}</span>}
          </button>
          {bell && (
            <div className="sheet-in absolute right-0 top-full mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-4 shadow-card">
              <div className="mb-2 font-semibold">Alertas</div>
              {alerts.length === 0 ? <p className="text-sm text-slate-500">Todo en orden, sin alertas.</p> : (
                <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
                  {alerts.map((a) => <li key={a.id} className={a.severity === "error" ? "text-red-600" : a.severity === "warning" ? "text-amber-700" : "text-slate-600"}>{a.message}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
