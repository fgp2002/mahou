import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/ui";
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
    <div className="space-y-6">
      <PageHeader title="Visitas" count={rows.length}>
        <Link href="/visits/new" className="btn">Nueva visita</Link>
      </PageHeader>
      {open && (
        <Link href={`/visits/${open.id}`} className="card block border-slate-300 bg-slate-100 text-sm">
          Visita en curso: <b>{open.stores?.name}</b> — pulsa para continuar.
        </Link>
      )}
      <div className="card p-0 md:hidden">
        <ul className="divide-y divide-slate-100 text-sm">
          {rows.map((v) => (
            <li key={v.id}>
              <Link href={`/visits/${v.id}`} className="flex items-center justify-between gap-2 p-3 row-link">
                <span className="min-w-0 truncate">
                  <b>{v.stores?.name}</b> <span className="text-slate-400">· {v.stores?.town}</span>
                  <div className="text-xs text-slate-500">{v.visit_date} · {VISIT_TYPES[v.visit_type]}{v.is_manual ? " · manual" : ""}</div>
                </span>
                <span className="shrink-0 text-slate-500">{v.status === "completed" ? `${v.duration_minutes ?? "?"} min` : ST[v.status]}</span>
              </Link>
            </li>
          ))}
          {rows.length === 0 && <li><EmptyState title="Aún no hay visitas" text="Empieza tu primera visita y quedará registrada aquí."><Link href="/visits/new" className="btn">Iniciar visita</Link></EmptyState></li>}
        </ul>
      </div>
      <div className="card hidden overflow-hidden !p-0 md:block">
        <div className="h-scroll max-h-[calc(100dvh-14rem)] overflow-y-auto">
          <table className="data-table">
            <thead><tr><th className="pl-4">Fecha</th><th>Tienda</th><th>Municipio</th><th>Tipo</th><th>Duración</th><th className="pr-4">Estado</th></tr></thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id}>
                  <td className="whitespace-nowrap pl-4 tabular-nums text-slate-600">{v.visit_date.slice(8, 10)}/{v.visit_date.slice(5, 7)}/{v.visit_date.slice(0, 4)}</td>
                  <td className="max-w-[20rem]"><Link href={`/visits/${v.id}`} className="block truncate font-semibold hover:text-brand-600">{v.stores?.name}</Link></td>
                  <td className="whitespace-nowrap text-slate-600">{v.stores?.town ?? "—"}</td>
                  <td className="whitespace-nowrap text-slate-600">{VISIT_TYPES[v.visit_type]}{v.is_manual ? " · manual" : ""}</td>
                  <td className="whitespace-nowrap tabular-nums text-slate-600">{v.duration_minutes != null ? `${v.duration_minutes} min` : "—"}</td>
                  <td className="pr-4"><span className={`badge font-bold ${v.status === "completed" ? "bg-st-ok text-[#fff]" : v.status === "in_progress" ? "bg-brand-600 text-[rgb(var(--on-accent))]" : v.status === "cancelled" ? "bg-st-none text-[#fff]" : "bg-slate-200 text-slate-700"}`}>{ST[v.status]}</span></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6}><EmptyState title="Aún no hay visitas" text="Empieza tu primera visita y quedará registrada aquí."><Link href="/visits/new" className="btn">Iniciar visita</Link></EmptyState></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
