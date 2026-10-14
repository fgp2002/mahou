"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function GenerateRoute({ defaultDate, routeStart, embedded = false }: { defaultDate: string; routeStart: string; embedded?: boolean }) {
  const router = useRouter();
  const [date, setDate] = useState(defaultDate);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/routes/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg(j.error ?? "Error");
    if (j.status === "exists") setMsg("Ya existe una ruta para ese día; ábrela para editarla o regenerarla.");
    router.push(`/routes/${date}`);
    router.refresh();
  }
  return (
    <div className={embedded ? "flex flex-wrap items-end gap-3" : "card flex flex-wrap items-end gap-3"}>
      <div className="min-w-0 flex-1 basis-40"><label className="label">Generar ruta para el día</label><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      <button className="btn" onClick={go} disabled={busy}>{busy ? "Calculando…" : "Generar ruta"}</button>
      <p className="w-full text-xs text-slate-500">Sale a las {routeStart}. La ruta del día siguiente también se genera sola a partir de las 18:00 (Madrid).</p>
      {msg && <p className="w-full text-sm text-amber-700">{msg}</p>}
    </div>
  );
}
