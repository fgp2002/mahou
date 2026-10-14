"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { madridDate } from "@/lib/domain/dates";

/** Un toque: inicia (o retoma) la visita de una tienda y abre la pantalla de visita. */
export function StartVisitButton({ storeId, plannedVisitId, routeStopId, minutes, label = "Iniciar" }: { storeId: string; plannedVisitId?: string | null; routeStopId?: string | null; minutes?: number; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setErr(null);
    const sb = supabaseBrowser();
    const { data: open } = await sb.from("visits").select("id").eq("status", "in_progress").limit(1);
    if (open?.length) {
      setBusy(false);
      router.push(`/visits/${open[0].id}`);
      return;
    }
    const started = { status: "in_progress", started_at: new Date().toISOString(), visit_date: madridDate() };
    const res = plannedVisitId
      ? await sb.from("visits").update(started).eq("id", plannedVisitId).select("id").single()
      : await sb.from("visits").insert({ ...started, store_id: storeId, route_stop_id: routeStopId ?? null, visit_type: "ordinaria", planned_minutes: minutes ?? 60 }).select("id").single();
    setBusy(false);
    if (res.error) return setErr(res.error.message);
    router.push(`/visits/${res.data.id}`);
  }

  return (
    <span className="inline-flex flex-col items-end">
      <button className="btn" onClick={go} disabled={busy}>{busy ? "…" : label}</button>
      {err && <span className="mt-1 text-xs text-red-600">{err}</span>}
    </span>
  );
}
