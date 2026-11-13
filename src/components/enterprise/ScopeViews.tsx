import Link from "next/link";
import clsx from "clsx";
import type { Bucket } from "@/lib/server/scope";
import { roleShort } from "@/lib/enterprise/roles";
import { dmy } from "@/lib/format";

const pctOf = (b: Bucket) => (b.compliance.required ? Math.round((b.compliance.done / b.compliance.required) * 100) : null);
const tone = (p: number | null) => (p == null ? "bg-slate-300" : p >= 85 ? "bg-st-ok" : p >= 60 ? "bg-st-soon" : "bg-st-late");

export function ComplianceBar({ b }: { b: Bucket }) {
  const p = pctOf(b);
  return (
    <span className="flex min-w-[7rem] items-center gap-2">
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200"><span className={clsx("block h-full rounded-full", tone(p))} style={{ width: `${p ?? 0}%` }} /></span>
      <span className="w-10 text-right text-xs font-bold tabular-nums">{p == null ? "—" : `${p}%`}</span>
    </span>
  );
}

export function KpiRow({ b, showTasks = true }: { b: Bucket; showTasks?: boolean }) {
  const p = pctOf(b);
  const items: { label: string; value: string | number; hint?: string; tone?: string }[] = [
    { label: "Tiendas", value: b.stores },
    { label: "Cumplimiento del mes", value: p == null ? "—" : `${p}%`, hint: `${b.compliance.done} de ${b.compliance.required} visitas`, tone: p == null ? "" : p >= 85 ? "text-st-ok" : p >= 60 ? "text-st-soon" : "text-st-late" },
    { label: "Atrasadas", value: b.atrasadas, tone: b.atrasadas ? "text-st-late" : "" },
    { label: "Visitas hoy", value: b.visitsToday },
    { label: "Incidencias abiertas", value: b.incidents, hint: b.incidentsHigh ? `${b.incidentsHigh} de prioridad alta` : undefined, tone: b.incidents ? "text-st-late" : "" },
    { label: "Elementos con problema", value: b.equipmentIssues, tone: b.equipmentIssues ? "text-st-soon" : "" },
    ...(showTasks ? [{ label: "Tareas abiertas", value: b.tasksOpen, hint: b.tasksOverdue ? `${b.tasksOverdue} fuera de plazo` : b.tasksToValidate ? `${b.tasksToValidate} por validar` : undefined, tone: b.tasksOverdue ? "text-st-late" : "" }] : []),
  ];
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-7">
      {items.map((k) => (
        <div key={k.label} className="card flex min-h-[6rem] flex-col justify-between gap-1 !p-3.5">
          <span className="text-xs font-semibold leading-tight text-slate-500">{k.label}</span>
          <span className={clsx("text-[1.6rem] font-extrabold leading-none tracking-[-0.03em] tabular-nums", k.tone)}>{k.value}</span>
          {k.hint ? <span className="truncate text-[11px] text-slate-500">{k.hint}</span> : <span />}
        </div>
      ))}
    </div>
  );
}

export function UnitTable({ rows, hrefFor }: { rows: Bucket[]; hrefFor?: (b: Bucket) => string | null }) {
  if (!rows.length) return <p className="text-sm text-slate-500">Sin datos en este ámbito.</p>;
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="data-table">
          <thead><tr><th>Unidad</th><th className="text-right">Tiendas</th><th>Cumplimiento</th><th className="text-right">Atrasadas</th><th className="text-right">Incidencias</th><th className="text-right">Elementos</th><th className="text-right">Tareas</th><th className="text-right">Visitas hoy</th></tr></thead>
          <tbody>{rows.map((b) => { const h = hrefFor?.(b); return (
            <tr key={b.key}>
              <td className="font-semibold">{h ? <Link className="link" href={h}>{b.name}</Link> : b.name}</td>
              <td className="text-right tabular-nums">{b.stores}</td><td><ComplianceBar b={b} /></td>
              <td className={clsx("text-right tabular-nums", b.atrasadas && "font-semibold text-st-late")}>{b.atrasadas}</td>
              <td className="text-right tabular-nums">{b.incidents}</td><td className="text-right tabular-nums">{b.equipmentIssues}</td>
              <td className="text-right tabular-nums">{b.tasksOpen}{b.tasksOverdue ? <span className="text-st-late"> ({b.tasksOverdue})</span> : null}</td>
              <td className="text-right tabular-nums">{b.visitsToday}</td>
            </tr>); })}</tbody>
        </table>
      </div>
      <ul className="space-y-2 md:hidden">{rows.map((b) => { const h = hrefFor?.(b); const inner = (
        <>
          <span className="flex items-center justify-between gap-2"><b className="truncate">{b.name}</b><span className="text-xs text-slate-500">{b.stores} tiendas</span></span>
          <ComplianceBar b={b} />
          <span className="flex flex-wrap gap-x-3 text-xs text-slate-500"><span>{b.atrasadas} atrasadas</span><span>{b.incidents} incidencias</span><span>{b.tasksOpen} tareas</span><span>{b.visitsToday} visitas hoy</span></span>
        </>); return <li key={b.key}>{h ? <Link href={h} className="panel tap flex flex-col gap-2">{inner}</Link> : <div className="panel flex flex-col gap-2">{inner}</div>}</li>; })}</ul>
    </>
  );
}

export function PeopleTable({ rows, unitName }: { rows: (Bucket & { member: { user_id: string; full_name: string; role: string; unit_id: string | null; position: string | null }; portfolio: number; lastVisit: string | null })[]; unitName: (id: string | null) => string }) {
  if (!rows.length) return <p className="text-sm text-slate-500">No hay personas en este ámbito.</p>;
  return (
    <ul className="grid gap-2.5 md:grid-cols-2 2xl:grid-cols-3">
      {rows.map((p) => (
        <li key={p.key} className="card flex flex-col gap-2.5 !p-4">
          <span className="flex items-start justify-between gap-2">
            <span className="min-w-0"><b className="block truncate">{p.member.full_name}</b><span className="block truncate text-xs text-slate-500">{roleShort(p.member.role)}{p.member.unit_id ? ` · ${unitName(p.member.unit_id)}` : ""}</span></span>
            <span className={clsx("badge", p.visitsToday ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500")}>{p.visitsToday ? `${p.visitsToday} visitas hoy` : "Sin visitas hoy"}</span>
          </span>
          {p.portfolio > 0 ? <ComplianceBar b={p} /> : <span className="text-xs text-slate-500">Sin cartera asignada</span>}
          <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>{p.portfolio} tiendas</span>
            {p.atrasadas > 0 && <span className="font-semibold text-st-late">{p.atrasadas} {p.atrasadas === 1 ? "atrasada" : "atrasadas"}</span>}
            <span>{p.tasksOpen} tareas{p.tasksOverdue ? ` · ${p.tasksOverdue} fuera de plazo` : ""}</span>
            <span>Última visita: {p.lastVisit ? dmy(p.lastVisit) : "—"}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
