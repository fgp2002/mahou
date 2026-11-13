"use client";
import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { madridDate } from "@/lib/domain/dates";
import { addMonths, monthOf } from "@/lib/economy";

/** Selector de periodo: este mes, mes anterior, este año, año anterior o fechas a medida. Vive en la URL. */
export function PeriodPicker({ allowCustom = true }: { allowCustom?: boolean }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const today = madridDate();
  const thisMonth = today.slice(0, 7);
  const prevMonth = addMonths(monthOf(today), -1).slice(0, 7);
  const year = today.slice(0, 4);
  const cur = sp.get("from") ? "custom" : sp.get("period") ?? thisMonth;
  const [custom, setCustom] = useState({ from: sp.get("from") ?? monthOf(today), to: sp.get("to") ?? today, open: !!sp.get("from") });

  function go(period: string | null, from?: string, to?: string) {
    const u = new URLSearchParams(sp.toString());
    u.delete("period"); u.delete("from"); u.delete("to"); u.delete("page");
    if (period) u.set("period", period);
    if (from && to) { u.set("from", from); u.set("to", to); }
    start(() => router.replace(`${path}?${u}`, { scroll: false }));
  }
  const chip = (label: string, period: string) => (
    <button key={period} type="button" onClick={() => { setCustom({ ...custom, open: false }); go(period); }}
      className={clsx("tap min-h-10 whitespace-nowrap rounded-full border px-3.5 text-sm", cur === period ? "border-brand-600 bg-brand-600 font-semibold text-[rgb(var(--on-accent))]" : "border-slate-300 bg-white text-slate-700")}>{label}</button>
  );
  const other = /^\d{4}-\d{2}$/.test(cur) && cur !== thisMonth && cur !== prevMonth;

  return (
    <div className="space-y-2" aria-busy={pending}>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {chip("Este mes", thisMonth)}
        {chip("Mes anterior", prevMonth)}
        {chip("Este año", year)}
        {chip("Año anterior", String(Number(year) - 1))}
        <input type="month" aria-label="Elegir mes" value={other ? cur : ""} onChange={(e) => e.target.value && go(e.target.value)}
          className={clsx("input !min-h-10 !w-auto !rounded-full", other && "!border-slate-900 font-semibold")} />
        {allowCustom && <button type="button" onClick={() => setCustom({ ...custom, open: !custom.open })} className={clsx("tap min-h-10 whitespace-nowrap rounded-full border px-3.5 text-sm", cur === "custom" ? "border-brand-600 bg-brand-600 font-semibold text-[rgb(var(--on-accent))]" : "border-slate-300 bg-white text-slate-700")}>Fechas…</button>}
      </div>
      {custom.open && (
        <div className="fade-in flex flex-wrap items-end gap-2">
          <div><label className="label">Desde</label><input type="date" className="input" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></div>
          <div><label className="label">Hasta</label><input type="date" className="input" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></div>
          <button className="btn" disabled={!custom.from || !custom.to || custom.from > custom.to} onClick={() => go(null, custom.from, custom.to)}>Aplicar</button>
        </div>
      )}
    </div>
  );
}
