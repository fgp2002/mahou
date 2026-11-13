"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, Search, X } from "lucide-react";
import { MahouEmblem } from "./MahouLogo";
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
    <div ref={box} className={clsx("no-print sticky top-0 z-40 -mx-4 bg-[rgb(var(--bar))] px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:-mx-6 md:px-6 lg:bg-slate-50/90 lg:pb-2 lg:backdrop-blur-xl xl:-mx-10 xl:px-10", scrolled && "shadow-[0_6px_20px_-12px_rgb(var(--shadow-rgb)/0.5)] lg:shadow-none")}>
      <div className="page relative flex items-center gap-2.5">
        <Link href="/" aria-label={title ? `Mahou · ${title}. Ir a inicio` : "Mahou · Inicio"} className="flex h-11 w-9 shrink-0 items-center justify-center lg:hidden"><MahouEmblem size={30} tone="white" /></Link>
        <div className="relative min-w-0 flex-1">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setSearchOpen(true); }} onFocus={() => setSearchOpen(true)}
            placeholder="Buscar tiendas, contactos, pagos…" aria-label="Buscar" enterKeyHint="search" className="input !rounded-full border-transparent !pl-10 !pr-10 shadow-[inset_0_1px_2px_rgb(var(--shadow-rgb)/0.06)] lg:border-slate-300" />
          {q && <button aria-label="Borrar búsqueda" onClick={() => { setQ(""); setHits([]); }} className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-slate-500"><X size={16} /></button>}
          {searchOpen && q.trim().length >= 2 && (
            <div className="sheet-in absolute inset-x-0 top-full mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-pop">
              {hits.length === 0 ? <div className="p-4 text-sm text-slate-500">{loading ? "Buscando…" : "Sin resultados."}</div> : (
                <ul className="max-h-[70vh] overflow-y-auto text-sm">
                  {hits.map((h, k) => (
                    <li key={h.group + h.id}>
                      {(k === 0 || hits[k - 1].group !== h.group) && <div className="sticky top-0 bg-slate-100 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">{h.group}</div>}
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
            className="tap relative flex h-11 w-11 items-center justify-center rounded-full border border-[#fff]/25 bg-[#fff]/15 text-[#fff] lg:border-slate-200 lg:bg-white lg:text-slate-900">
            <Bell size={19} />
            {unread > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#fff] px-1 text-[11px] font-bold text-[#B8151B] ring-2 ring-[rgb(var(--bar))] lg:bg-brand-600 lg:text-[rgb(var(--on-accent))] lg:ring-slate-50">{unread > 99 ? "99+" : unread}</span>}
          </button>
          {bell && (
            <div className="sheet-in absolute right-0 top-full mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-4 shadow-pop">
              <div className="t-section mb-2">Alertas</div>
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
