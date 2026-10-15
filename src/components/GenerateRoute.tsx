"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Check, ChevronDown, Store } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { currentPosition } from "@/lib/geoClient";
import { madridDate } from "@/lib/domain/dates";

type Banner = { name: string; stores: number };

export function GenerateRoute({ defaultDate, routeStart, embedded = false }: { defaultDate: string; routeStart: string; embedded?: boolean }) {
  const router = useRouter();
  const [date, setDate] = useState(defaultDate);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [banners, setBanners] = useState<Banner[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState("");

  async function loadBanners() {
    setOpen(!open);
    if (banners) return;
    const { data } = await supabaseBrowser().from("stores").select("banner").eq("active", true).limit(5000);
    const m = new Map<string, number>();
    for (const r of data ?? []) {
      const b = (r.banner ?? "").replace(/\s+/g, " ").trim();
      if (b) m.set(b, (m.get(b) ?? 0) + 1);
    }
    setBanners([...m].map(([name, stores]) => ({ name, stores })).sort((a, b) => b.stores - a.stores));
  }

  async function go() {
    setBusy(true);
    setMsg(null);
    // Si la ruta es para hoy, sale desde donde estás ahora.
    const start = date === madridDate() ? await currentPosition() : null;
    const r = await fetch("/api/routes/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, ...(picked.length ? { banners: picked } : {}), ...(start ? { start } : {}) }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg(j.error ?? "Error");
    if (j.status === "exists") setMsg("Ya existe una ruta para ese día; ábrela para editarla o regenerarla.");
    router.push(`/routes/${date}`);
    router.refresh();
  }

  const shown = (banners ?? []).filter((b) => !q.trim() || b.name.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (n: string) => setPicked(picked.includes(n) ? picked.filter((x) => x !== n) : [...picked, n]);

  return (
    <div className={embedded ? "space-y-3" : "card space-y-3"}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-40"><label className="label">Generar ruta para el día</label><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <button type="button" onClick={loadBanners} aria-expanded={open} className="btn-secondary">
          <Store size={16} /> {picked.length ? `${picked.length} enseña${picked.length > 1 ? "s" : ""}` : "Todas las enseñas"}
          <ChevronDown size={15} className={clsx("transition-transform", open && "rotate-180")} />
        </button>
        <button className="btn" onClick={go} disabled={busy}>{busy ? "Calculando…" : "Generar ruta"}</button>
      </div>

      {open && (
        <div className="fade-in space-y-2 rounded-lg border border-slate-200 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">Basar la ruta solo en estas enseñas</span>
            {picked.length > 0 && <button type="button" className="text-xs text-brand-600 underline" onClick={() => setPicked([])}>Quitar selección</button>}
          </div>
          <input className="input" placeholder="Buscar enseña…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar enseña" />
          {!banners ? <p className="text-sm text-slate-500">Cargando enseñas…</p> : (
            <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
              {shown.map((b) => {
                const on = picked.includes(b.name);
                return (
                  <button key={b.name} type="button" onClick={() => toggle(b.name)} aria-pressed={on}
                    className={clsx("tap inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs", on ? "border-brand-600 bg-brand-600 text-[rgb(var(--on-accent))]" : "border-slate-300 text-slate-700")}>
                    {on && <Check size={13} />}{b.name} <span className={on ? "opacity-80" : "text-slate-400"}>{b.stores}</span>
                  </button>
                );
              })}
            </div>
          )}
          <p className="text-xs text-slate-500">{picked.length ? "Solo entrarán tiendas pendientes de las enseñas elegidas." : "Sin selección se usan todas las enseñas."}</p>
        </div>
      )}

      <p className="text-xs text-slate-500">Sale de casa a las {routeStart} (si es para hoy, desde tu ubicación actual). La ruta del día siguiente también se genera sola a partir de las 18:00 (Madrid).</p>
      {msg && <p className="text-sm text-amber-700">{msg}</p>}
    </div>
  );
}
