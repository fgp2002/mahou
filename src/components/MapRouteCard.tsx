"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { ChevronDown, Route, X } from "lucide-react";
import { MultiFilter } from "./MultiFilter";
import { madridDate } from "@/lib/domain/dates";
import { toast } from "./Toast";

/** Tarjeta del mapa: elige varias enseñas (también filtran el mapa) y genera la ruta solo con ellas. */
export function MapRouteCard({ banners, allBanners, onChange }: { banners: string[]; allBanners: string[]; onChange: (v: string[]) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(madridDate());
  const [busy, setBusy] = useState(false);
  const [exists, setExists] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function generate(replace = false) {
    if (!banners.length) return setMsg("Elige al menos una enseña.");
    setBusy(true); setMsg(null);
    const r = await fetch("/api/routes/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, banners, ...(replace ? { replace: true } : {}) }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg(j.error ?? "No se pudo generar la ruta.");
    if (j.status === "exists") {
      if (replace) return setMsg("La ruta de ese día está aceptada o editada: ábrela para regenerarla.");
      setExists(true);
      return setMsg("Ya hay una ruta ese día. ¿La sustituyes por una con estas enseñas?");
    }
    toast(`Ruta generada: ${j.stops ?? 0} paradas`);
    router.push(`/routes/${date}`);
  }

  return (
    <section className="card !p-0" data-no-ptr>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-12 w-full items-center gap-3 px-4 text-left">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Route size={17} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Ruta por enseñas</span>
          <span className="block truncate text-xs text-slate-500">{banners.length ? banners.join(" · ") : "Elige una o varias enseñas y genera la ruta con ellas"}</span>
        </span>
        {banners.length > 0 && <span className="badge bg-brand-600 text-[rgb(var(--on-accent))]">{banners.length}</span>}
        <ChevronDown size={16} className={clsx("shrink-0 text-slate-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="fade-in space-y-3 border-t border-slate-100 p-4">
          {banners.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {banners.map((b) => (
                <span key={b} className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-1 pl-3 pr-1 text-xs font-semibold text-brand-700">
                  {b}
                  <button type="button" aria-label={`Quitar ${b}`} onClick={() => onChange(banners.filter((x) => x !== b))} className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-brand-100"><X size={12} /></button>
                </span>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto_auto]">
            <MultiFilter label="Enseñas para la ruta" values={banners} onChange={(v) => { onChange(v); setExists(false); setMsg(null); }} options={allBanners.map((b) => [b, b])} all="Ninguna elegida" />
            <div><label className="label" htmlFor="mr-date">Día</label><input id="mr-date" type="date" className="input" value={date} onChange={(e) => { setDate(e.target.value); setExists(false); setMsg(null); }} /></div>
            <button className="btn" disabled={busy || !banners.length} onClick={() => generate(false)}>{busy ? "Calculando…" : "Generar ruta"}</button>
          </div>
          <p className="text-xs text-slate-500">Las enseñas elegidas también filtran el mapa, para que veas qué tiendas entran.</p>
          {msg && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-amber-700">
              <span>{msg}</span>
              {exists && <button className="btn-secondary" disabled={busy} onClick={() => generate(true)}>Sustituir ruta</button>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
