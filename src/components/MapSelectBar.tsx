"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { ChevronUp, X } from "lucide-react";
import { madridDate } from "@/lib/domain/dates";
import { toast } from "./Toast";

/** Barra del modo selección: tiendas elegidas tocando pines → ruta más eficiente con ellas. */
export function MapSelectBar({ picked, onRemove, onClear, onClose }: {
  picked: { id: string; name: string }[]; onRemove: (id: string) => void; onClear: () => void; onClose: () => void;
}) {
  const router = useRouter();
  const [date, setDate] = useState(madridDate());
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState(false);
  const [exists, setExists] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function generate(replace = false) {
    if (!picked.length) return;
    setBusy(true); setMsg(null);
    const r = await fetch("/api/routes/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, stores: picked.map((p) => p.id), ...(replace ? { replace: true } : {}) }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg(j.error ?? "No se pudo generar la ruta.");
    if (j.status === "exists") {
      if (replace) return setMsg("La ruta de ese día está aceptada o editada: ábrela para cambiarla.");
      setExists(true);
      return setMsg("Ya hay una ruta ese día.");
    }
    toast(`Ruta generada: ${j.stops ?? picked.length} paradas`);
    router.push(`/routes/${date}`);
  }

  return (
    <div className="sheet-up absolute inset-x-2 bottom-2 z-[600] rounded-xl bg-white p-3 shadow-pop md:left-auto md:right-3 md:w-96" data-no-ptr>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setList(!list)} disabled={!picked.length} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-brand-600 px-2 text-sm font-bold text-[rgb(var(--on-accent))]">{picked.length}</span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{picked.length ? `tienda${picked.length > 1 ? "s" : ""} seleccionada${picked.length > 1 ? "s" : ""}` : "Toca los pines para elegir tiendas"}</span>
            <span className="block text-xs text-slate-500">{picked.length >= 24 ? "Máximo 24 por ruta" : "Se completa con las pendientes más cercanas"}</span>
          </span>
          {picked.length > 0 && <ChevronUp size={16} className={clsx("ml-auto shrink-0 text-slate-400 transition-transform", !list && "rotate-180")} />}
        </button>
        <button type="button" aria-label="Salir del modo selección" onClick={onClose} className="icon-btn"><X size={18} /></button>
      </div>

      {list && picked.length > 0 && (
        <ul className="fade-in mt-2 max-h-40 space-y-1 overflow-y-auto border-t border-slate-100 pt-2 text-sm">
          {picked.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">{p.name}</span>
              <button type="button" aria-label={`Quitar ${p.name}`} onClick={() => onRemove(p.id)} className="icon-btn !h-7 !w-7"><X size={14} /></button>
            </li>
          ))}
          <li><button type="button" className="text-xs text-brand-600 underline" onClick={onClear}>Quitar todas</button></li>
        </ul>
      )}

      <div className="mt-3 flex items-end gap-2">
        <div className="min-w-0 flex-1"><label className="label" htmlFor="sel-date">Día</label><input id="sel-date" type="date" className="input" value={date} onChange={(e) => { setDate(e.target.value); setExists(false); setMsg(null); }} /></div>
        <button className="btn" disabled={busy || !picked.length} onClick={() => generate(false)}>{busy ? "Calculando…" : "Generar ruta"}</button>
      </div>
      {msg && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-amber-700">
          <span>{msg}</span>
          {exists && <button className="btn-secondary" disabled={busy} onClick={() => generate(true)}>Sustituirla</button>}
        </div>
      )}
    </div>
  );
}
