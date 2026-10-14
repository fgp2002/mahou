"use client";
import { useEffect, useId, useMemo, useState } from "react";
import clsx from "clsx";
import { Check, ChevronDown, Search, X } from "lucide-react";

/**
 * Filtro de selección múltiple. El nombre queda fijo arriba; el botón resume la selección
 * («Todos», el nombre si es uno, o «N seleccionados»). Se abre como hoja (móvil) o ventana (iPad/ordenador).
 */
export function MultiFilter({ label, values, onChange, options, all = "Todos" }: {
  label: string; values: string[]; onChange: (v: string[]) => void; options: [string, string][]; all?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<string[]>(values);
  // Al abrir se parte de la selección actual (solo al abrir, para no pisar lo que se marca).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) { setDraft(values); setQ(""); } }, [open]);

  const labelOf = new Map(options);
  const summary = values.length === 0 ? all : values.length === 1 ? labelOf.get(values[0]) ?? values[0] : `${values.length} seleccionados`;
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return options.filter(([, l]) => !t || l.toLowerCase().includes(t));
  }, [options, q]);
  const toggle = (v: string) => setDraft(draft.includes(v) ? draft.filter((x) => x !== v) : [...draft, v]);
  const apply = (v: string[]) => { onChange(v); setOpen(false); };

  return (
    <div className="min-w-0">
      <label className="label" htmlFor={id}>{label}</label>
      <button id={id} type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"
        className={clsx("input flex items-center justify-between gap-2 text-left", values.length && "border-brand-600 ring-1 ring-brand-600/30")}>
        <span className={clsx("truncate", values.length ? "font-semibold text-slate-900" : "text-slate-700")}>{summary}</span>
        <ChevronDown size={16} className="shrink-0 text-slate-400" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 fade-in md:items-center md:p-6" onClick={() => setOpen(false)} data-no-ptr>
          <div role="dialog" aria-label={label} onClick={(e) => e.stopPropagation()}
            className="sheet-up flex max-h-[80dvh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-pop md:rounded-2xl">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <b>{label}</b>
              <button type="button" aria-label="Cerrar" className="p-1.5 text-slate-500" onClick={() => setOpen(false)}><X size={18} /></button>
            </div>
            {options.length > 8 && (
              <div className="relative px-4 pt-3">
                <Search size={15} className="pointer-events-none absolute left-7 top-1/2 mt-1.5 -translate-y-1/2 text-slate-400" />
                <input className="input !pl-9" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Buscar en ${label}`} />
              </div>
            )}
            <ul className="min-h-0 flex-1 overflow-y-auto px-2 py-2" role="listbox" aria-multiselectable="true">
              <li>
                <button type="button" onClick={() => setDraft([])} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left text-sm hover:bg-slate-100">
                  <span className={clsx("flex h-5 w-5 items-center justify-center rounded-md border", draft.length === 0 ? "border-brand-600 bg-brand-600 text-[rgb(var(--on-accent))]" : "border-slate-300")}>{draft.length === 0 && <Check size={13} strokeWidth={3} />}</span>
                  <span className="font-semibold">{all}</span>
                </button>
              </li>
              {shown.map(([v, l]) => {
                const on = draft.includes(v);
                return (
                  <li key={v}>
                    <button type="button" role="option" aria-selected={on} onClick={() => toggle(v)} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left text-sm hover:bg-slate-100">
                      <span className={clsx("flex h-5 w-5 shrink-0 items-center justify-center rounded-md border", on ? "border-brand-600 bg-brand-600 text-[rgb(var(--on-accent))]" : "border-slate-300")}>{on && <Check size={13} strokeWidth={3} />}</span>
                      <span className="min-w-0 truncate">{l}</span>
                    </button>
                  </li>
                );
              })}
              {shown.length === 0 && <li className="p-3 text-sm text-slate-500">Sin coincidencias.</li>}
            </ul>
            <div className="flex gap-2 border-t border-slate-100 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <button type="button" className="btn-secondary" onClick={() => apply([])}>Limpiar</button>
              <button type="button" className="btn flex-1" onClick={() => apply(draft)}>Aplicar{draft.length ? ` (${draft.length})` : ""}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
