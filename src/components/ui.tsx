import clsx from "clsx";
import { STATE_LABEL, type DueState } from "@/lib/domain/periodicity";

export const STATE_STYLE: Record<DueState, string> = {
  sin_obligacion: "bg-slate-100 text-slate-600",
  cumplida: "bg-green-100 text-green-700",
  pendiente: "bg-amber-100 text-amber-800",
  proxima: "bg-orange-100 text-orange-800",
  atrasada: "bg-red-100 text-red-700",
};

export function StateBadge({ state }: { state: DueState }) {
  return <span className={clsx("badge", STATE_STYLE[state])}>{STATE_LABEL[state]}</span>;
}

export function Kpi({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: "red" | "green" | "amber" }) {
  return (
    <div className="card">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={clsx("mt-1 text-2xl font-semibold", tone === "red" && "text-red-600", tone === "green" && "text-green-600", tone === "amber" && "text-amber-600")}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/** Anillo de progreso tipo Apple: arco animado y número al centro. */
export function Ring({ value, total, label, color = "rgb(var(--slate-900))", display }: { value: number; total: number; label: string; color?: string; display?: string }) {
  const r = 34;
  const len = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(1, value / total) : 0;
  return (
    <div className="flex flex-col items-center gap-1.5 text-center" role="img" aria-label={`${label}: ${display ?? value}`}>
      <div className="relative h-24 w-24">
        <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
          <circle cx="40" cy="40" r={r} fill="none" stroke="rgb(var(--slate-200))" strokeWidth="9" />
          <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
            className="ring-arc" strokeDasharray={len} strokeDashoffset={len * (1 - pct)} style={{ ["--ring-len" as string]: len }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-xl font-bold">{display ?? value}</div>
      </div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

/** Pantalla vacía amable: dibujo sencillo, mensaje y una acción clara. */
export function EmptyState({ title, text, children }: { title: string; text?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <svg viewBox="0 0 120 100" className="h-24 w-28 text-slate-300" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M18 44 28 20h64l10 24" /><path d="M22 44v42h76V44" /><path d="M14 44h92" />
        <path d="M48 86V62h24v24" /><path d="M48 32h0M72 32h0" strokeWidth="5" />
        <path d="M52 52q8 6 16 0" stroke="rgb(var(--slate-500))" />
      </svg>
      <div className="text-base font-semibold">{title}</div>
      {text && <p className="max-w-xs text-sm text-slate-500">{text}</p>}
      {children}
    </div>
  );
}

/** Sección plegable con aspecto de tarjeta. */
export function Collapsible({ title, hint, open, children }: { title: string; hint?: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="card group !p-0">
      <summary className="flex min-h-14 cursor-pointer select-none items-center gap-3 rounded-3xl px-4 md:px-5">
        <span className="font-semibold">{title}</span>
        {hint && <span className="truncate text-xs text-slate-500">{hint}</span>}
        <svg viewBox="0 0 24 24" className="ml-auto h-5 w-5 shrink-0 text-slate-400 transition-transform duration-300 group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
      </summary>
      <div className="fold-body border-t border-slate-100 p-4 md:p-5">{children}</div>
    </details>
  );
}
