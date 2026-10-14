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
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
