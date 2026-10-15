"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ChevronRight, Search } from "lucide-react";
import { MultiFilter } from "./MultiFilter";
import { EmptyState } from "./ui";
import { eur, dmy } from "@/lib/format";

export interface InstallRow {
  key: string; storeId: string; store: string; town: string | null; banner: string | null; brand: string | null;
  installed: boolean; amount: number | null; paid: number; payments: number; last: string | null;
}
const NO_BRAND = "Sin marca";
const opts = (xs: (string | null)[], fallback?: string): [string, string][] =>
  [...new Set(xs.map((x) => x ?? fallback ?? "").filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")).map((x) => [x, x]);

/** Detalle de un tipo de pago: dónde está instalado, de qué marca, y lo abonado, con filtros como en el mapa. */
export function PaymentTypeDetail({ name, rows }: { name: string; rows: InstallRow[] }) {
  const [q, setQ] = useState("");
  const [brand, setBrand] = useState<string[]>([]);
  const [banner, setBanner] = useState<string[]>([]);
  const [town, setTown] = useState<string[]>([]);
  const [store, setStore] = useState<string[]>([]);
  const [state, setState] = useState<string[]>(["activa"]);

  const brandOpts = useMemo(() => opts(rows.map((r) => r.brand), NO_BRAND), [rows]);
  const bannerOpts = useMemo(() => opts(rows.map((r) => r.banner)), [rows]);
  const townOpts = useMemo(() => opts(rows.map((r) => r.town)), [rows]);
  const storeOpts = useMemo(() => [...new Map(rows.map((r) => [r.storeId, `${r.store}${r.town ? " · " + r.town : ""}`])).entries()].sort((a, b) => a[1].localeCompare(b[1], "es")) as [string, string][], [rows]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) =>
      (!t || `${r.store} ${r.town ?? ""} ${r.banner ?? ""} ${r.brand ?? ""}`.toLowerCase().includes(t)) &&
      (!brand.length || brand.includes(r.brand ?? NO_BRAND)) && (!banner.length || banner.includes(r.banner ?? "")) &&
      (!town.length || town.includes(r.town ?? "")) && (!store.length || store.includes(r.storeId)) &&
      (!state.length || state.includes(r.installed ? "activa" : "inactiva")))
      .sort((a, b) => Number(b.installed) - Number(a.installed) || a.store.localeCompare(b.store, "es"));
  }, [rows, q, brand, banner, town, store, state]);

  const installed = shown.filter((r) => r.installed).length;
  const paid = shown.reduce((s, r) => s + r.paid, 0);
  const payments = shown.reduce((s, r) => s + r.payments, 0);
  const byBrand = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of shown) if (r.installed) m.set(r.brand ?? NO_BRAND, (m.get(r.brand ?? NO_BRAND) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [shown]);
  const dirty = q || brand.length || banner.length || town.length || store.length || state.join() !== "activa";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="card"><div className="text-xs text-slate-500">Instaladas</div><div className="mt-1 text-2xl font-bold">{installed}</div></div>
        <div className="card"><div className="text-xs text-slate-500">Total abonado</div><div className="mt-1 text-2xl font-bold">{eur(paid)}</div></div>
        <div className="card"><div className="text-xs text-slate-500">Pagos abonados</div><div className="mt-1 text-2xl font-bold">{payments}</div></div>
      </div>

      <div className="card space-y-3">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input !pl-10" placeholder={`Buscar en ${name.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <MultiFilter label="Marca" values={brand} onChange={setBrand} options={brandOpts} all="Todas" />
          <MultiFilter label="Enseña" values={banner} onChange={setBanner} options={bannerOpts} all="Todas" />
          <MultiFilter label="Municipio" values={town} onChange={setTown} options={townOpts} />
          <MultiFilter label="Tienda" values={store} onChange={setStore} options={storeOpts} all="Todas" />
          <MultiFilter label="Estado" values={state} onChange={setState} options={[["activa", "Instalada"], ["inactiva", "Ya no activa"]]} />
        </div>
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>{shown.length} resultado{shown.length === 1 ? "" : "s"}</span>
          {dirty && <button className="underline" onClick={() => { setQ(""); setBrand([]); setBanner([]); setTown([]); setStore([]); setState(["activa"]); }}>Limpiar filtros</button>}
        </div>
        {byBrand.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
            {byBrand.map(([b, n]) => (
              <button key={b} type="button" onClick={() => setBrand(brand.includes(b) ? brand.filter((x) => x !== b) : [...brand, b])}
                className={clsx("tap inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold", brand.includes(b) ? "border-brand-600 bg-brand-600 text-[rgb(var(--on-accent))]" : "border-slate-200 bg-brand-50 text-brand-700")}>
                {b} <span className="opacity-70">{n}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <section className="card overflow-hidden !p-0">
        {shown.length === 0 ? <EmptyState title="Sin resultados" text={rows.length ? "Prueba a quitar algún filtro." : `No hay ${name.toLowerCase()} registradas todavía.`} /> : (
          <ul className="divide-y divide-slate-100">
            {shown.map((it) => (
              <li key={it.key}>
                <Link href={`/stores/${it.storeId}`} className="row-link flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">{it.store}</span>
                      <span className={clsx("badge shrink-0", it.brand ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-500")}>{it.brand ?? NO_BRAND}</span>
                    </span>
                    <span className="block truncate text-xs text-slate-500">{[it.banner, it.town, it.amount != null ? `${eur(Number(it.amount))} por pago` : null, it.last ? `último abono ${dmy(it.last)}` : null].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-bold tabular-nums">{eur(it.paid)}</span>
                    <span className={clsx("badge mt-0.5", it.installed ? "bg-st-ok text-[#fff]" : "bg-slate-200 text-slate-600")}>{it.installed ? "Instalada" : "Ya no activa"}</span>
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-slate-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
