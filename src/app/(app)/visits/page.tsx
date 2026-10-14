import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { VISIT_TYPES } from "@/lib/types";

const ST: Record<string, string> = { planned: "Planificada", in_progress: "En curso", completed: "Completada", cancelled: "Cancelada" };

export default async function VisitsPage() {
  const sb = await supabaseServer();
  const { data } = await sb
    .from("visits").select("id,visit_date,status,visit_type,duration_minutes,is_manual,stores(name,town)")
    .order("visit_date", { ascending: false }).order("created_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as unknown as { id: string; visit_date: string; status: string; visit_type: string; duration_minutes: number | null; is_manual: boolean; stores: { name: string; town: string | null } | null }[];
  const open = rows.find((r) => r.status === "in_progress");
  return (
    <div className="space-y-4">
      <PageHeader title="Visitas">
        <Link href="/visits/new" className="btn">Nueva visita</Link>
      </PageHeader>
      {open && (
        <Link href={`/visits/${open.id}`} className="card block border-brand-300 bg-brand-50 text-sm">
          Visita en curso: <b>{open.stores?.name}</b> — pulsa para continuar.
        </Link>
      )}
      <div className="card p-0">
        <ul className="divide-y divide-slate-100 text-sm">
          {rows.map((v) => (
            <li key={v.id}>
              <Link href={`/visits/${v.id}`} className="flex items-center justify-between gap-2 p-3 hover:bg-slate-50">
                <span className="min-w-0 truncate">
                  <b>{v.stores?.name}</b> <span className="text-slate-400">· {v.stores?.town}</span>
                  <div className="text-xs text-slate-500">{v.visit_date} · {VISIT_TYPES[v.visit_type]}{v.is_manual ? " · manual" : ""}</div>
                </span>
                <span className="shrink-0 text-slate-500">{v.status === "completed" ? `${v.duration_minutes ?? "?"} min` : ST[v.status]}</span>
              </Link>
            </li>
          ))}
          {rows.length === 0 && <li className="p-6 text-center text-slate-500">Aún no has registrado visitas.</li>}
        </ul>
      </div>
    </div>
  );
}
