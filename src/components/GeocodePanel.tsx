"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function GeocodePanel({ pending, failed }: { pending: number; failed: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [remaining, setRemaining] = useState(pending);

  async function run(retryFailed: boolean) {
    setBusy(true);
    setLog([]);
    let guard = 0;
    let tot = { ok: 0, partial: 0, failed: 0 };
    while (guard++ < 60) {
      const r = await fetch("/api/geocode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ retryFailed }) });
      const j = await r.json();
      if (!r.ok) { setLog((l) => [...l, "Error: " + (j.error ?? r.status)]); break; }
      tot = { ok: tot.ok + j.ok, partial: tot.partial + j.partial, failed: tot.failed + j.failed };
      setRemaining(j.remaining);
      setLog([`Exactas: ${tot.ok} · Aproximadas (revisar): ${tot.partial} · Fallidas: ${tot.failed} · Pendientes: ${j.remaining}`, ...(j.errors ?? [])]);
      if (j.ok + j.partial + j.failed === 0 || (!retryFailed && j.remaining === 0)) break;
      if (retryFailed && j.ok + j.partial === 0) break;
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <section className="card space-y-3">
      <h2 className="font-medium">Ubicación de las tiendas</h2>
      <p className="text-sm text-slate-500">Pendientes de geocodificar: <b>{remaining}</b> · Fallidas: <b>{failed}</b>. Se usa Google Geocoding. Las ubicaciones aproximadas se marcan para que las revises.</p>
      <div className="flex gap-2">
        <button className="btn" disabled={busy || remaining === 0} onClick={() => run(false)}>{busy ? "Geocodificando…" : "Geocodificar pendientes"}</button>
        {failed > 0 && <button className="btn-secondary" disabled={busy} onClick={() => run(true)}>Reintentar fallidas</button>}
      </div>
      {log.map((l, i) => <p key={i} className="text-sm text-slate-600">{l}</p>)}
    </section>
  );
}
