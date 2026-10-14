"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { MapPin, Play, Store as StoreIcon, X } from "lucide-react";
import { StateBadge } from "./ui";
import type { DueState } from "@/lib/domain/periodicity";

export interface StoreRowData {
  id: string; name: string; sub: string; audit: boolean; logo: string | null; state: DueState; lat: number | null; lng: number | null;
}
const OPEN = 132;

/** Fila compacta con logo. Deslizar a la izquierda: acciones rápidas. Mantener pulsado: menú. */
export function StoreRow({ s }: { s: StoreRowData }) {
  const [x, setX] = useState(0);
  const [menu, setMenu] = useState(false);
  const start = useRef<{ x: number; y: number; base: number } | null>(null);
  const moved = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragging = useRef(false);
  const gmaps = s.lat != null && s.lng != null ? `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}&travelmode=driving` : null;

  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  function down(e: React.TouchEvent) {
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY, base: x };
    moved.current = false; dragging.current = false;
    timer.current = setTimeout(() => { if (!moved.current) { setMenu(true); navigator.vibrate?.(8); } }, 480);
  }
  function move(e: React.TouchEvent) {
    if (!start.current) return;
    const t = e.touches[0];
    const dx = t.clientX - start.current.x, dy = t.clientY - start.current.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) { moved.current = true; clear(); }
    if (!dragging.current && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) dragging.current = true;
    if (dragging.current) setX(Math.max(-OPEN, Math.min(0, start.current.base + dx)));
  }
  function up() {
    clear();
    if (dragging.current) setX(x < -OPEN / 2 ? -OPEN : 0);
    start.current = null;
  }

  return (
    <li className="relative overflow-hidden rounded-3xl">
      <div className="absolute inset-y-0 right-0 flex w-[132px] items-stretch" aria-hidden={x === 0}>
        <Link href={`/visits/new?store=${s.id}`} tabIndex={x === 0 ? -1 : 0} className="flex flex-1 flex-col items-center justify-center gap-1 bg-slate-900 text-[11px] font-medium text-[rgb(var(--on-accent))]"><Play size={18} />Visita</Link>
        {gmaps
          ? <a href={gmaps} target="_blank" rel="noreferrer" tabIndex={x === 0 ? -1 : 0} className="flex flex-1 flex-col items-center justify-center gap-1 bg-st-ok text-[11px] font-semibold text-[#fff]"><MapPin size={18} />Ir</a>
          : <span className="flex flex-1 flex-col items-center justify-center gap-1 bg-slate-300 text-[11px] text-slate-600"><MapPin size={18} />Sin mapa</span>}
      </div>
      <div style={{ transform: `translateX(${x}px)`, transition: dragging.current && start.current ? "none" : "transform 320ms var(--spring)" }}
        onTouchStart={down} onTouchMove={move} onTouchEnd={up} onTouchCancel={up}
        className="relative flex items-center gap-3 rounded-3xl border border-slate-200 bg-white p-2.5 pr-3 shadow-card">
        <Link href={`/stores/${s.id}`} onClick={(e) => { if (x !== 0 || moved.current) { e.preventDefault(); setX(0); } }}
          onContextMenu={(e) => e.preventDefault()} className="flex min-w-0 flex-1 items-center gap-3" style={{ WebkitTouchCallout: "none" }}>
          <span className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-2 ${s.audit ? "ring-slate-900" : "ring-slate-200"}`}>
            {s.logo ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={s.logo} alt="" loading="lazy" className="h-9 w-9 object-contain" /> : <StoreIcon size={20} className="text-slate-400" />}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{s.name}</span>
            <span className="block truncate text-xs text-slate-500">{s.sub}</span>
          </span>
        </Link>
        <StateBadge state={s.state} />
      </div>

      {menu && (
        <div className="fixed inset-0 z-[70] flex items-end bg-black/40 fade-in" onClick={() => setMenu(false)}>
          <div className="sheet-up w-full rounded-t-[2rem] bg-white p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between"><b className="truncate">{s.name}</b><button aria-label="Cerrar" className="p-2" onClick={() => setMenu(false)}><X size={18} /></button></div>
            <Link href={`/stores/${s.id}`} className="flex min-h-12 items-center rounded-2xl px-3 hover:bg-slate-100">Ver ficha</Link>
            <Link href={`/visits/new?store=${s.id}`} className="flex min-h-12 items-center rounded-2xl px-3 hover:bg-slate-100">Iniciar visita</Link>
            {gmaps && <a href={gmaps} target="_blank" rel="noreferrer" className="flex min-h-12 items-center rounded-2xl px-3 hover:bg-slate-100">Cómo llegar</a>}
          </div>
        </div>
      )}
    </li>
  );
}
