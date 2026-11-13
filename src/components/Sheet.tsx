"use client";
import { useEffect } from "react";
import { X } from "lucide-react";

/** Hoja inferior en el móvil y panel centrado en escritorio. Se cierra con la X, tocando fuera o con Escape. */
export function Sheet({ title, subtitle, onClose, children, footer }: { title: React.ReactNode; subtitle?: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center md:items-center md:p-6" onClick={onClose}>
      <div className="fade-in absolute inset-0 bg-black/45" />
      <div role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined} onClick={(e) => e.stopPropagation()}
        className="sheet-up relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[1.5rem] bg-white shadow-pop md:max-w-2xl md:rounded-2xl">
        <div className="flex items-start gap-3 border-b border-slate-100 px-4 pb-3 pt-4 md:px-5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-bold leading-tight">{title}</div>
            {subtitle && <div className="mt-0.5 text-sm text-slate-500">{subtitle}</div>}
          </div>
          <button aria-label="Cerrar" onClick={onClose} className="tap -mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 md:px-5">{children}</div>
        {footer && <div className="border-t border-slate-100 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-5">{footer}</div>}
      </div>
    </div>
  );
}

/** Pestañas tipo «segmented control», cómodas con el pulgar. */
export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="flex gap-1 rounded-xl bg-slate-100 p-1" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={`tap flex min-h-10 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-lg px-1.5 text-[13px] font-semibold ${value === o.value ? "bg-white text-slate-900 shadow-card" : "text-slate-500"}`}>
          {o.label}{o.count != null && <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${value === o.value ? "bg-slate-900 text-slate-50" : "bg-slate-200 text-slate-600"}`}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
