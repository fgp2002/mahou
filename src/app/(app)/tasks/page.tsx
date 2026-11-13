import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { TaskBoard } from "@/components/enterprise/TaskBoard";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe } from "@/lib/server/me";
import { loadOrg, OPEN_TASK, TASK_COLS, type Task } from "@/lib/server/scope";
import { loadStoresLite } from "@/lib/server/economy";
import { can } from "@/lib/enterprise/roles";
import { madridDate } from "@/lib/domain/dates";

export const metadata = { title: "Tareas · Mahou" };

const TABS = [["mias", "Mis tareas"], ["validar", "Por validar"], ["equipo", "Del equipo"], ["cerradas", "Cerradas"]] as const;

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (!can(me.permissions, "tareas.consultar")) return <p className="text-sm text-slate-500">Tu perfil no tiene acceso a las tareas.</p>;
  const sp = await searchParams;
  const sb = await supabaseServer();
  const [{ data }, org, stores] = await Promise.all([
    sb.from("tasks").select(TASK_COLS).is("deleted_at", null).order("created_at", { ascending: false }).limit(1000),
    loadOrg(), loadStoresLite(),
  ]);
  const all = (data ?? []) as Task[];
  const canValidate = can(me.permissions, "tareas.validar");
  const canAssign = can(me.permissions, "tareas.asignar");
  const tabs = TABS.filter(([k]) => (k === "validar" ? canValidate : k === "equipo" ? canAssign || me.isOwner : true));
  const tab = tabs.find(([k]) => k === sp.tab)?.[0] ?? (tabs.some(([k]) => k === "mias") && all.some((t) => t.assignee_id === me.userId && OPEN_TASK.includes(t.status)) ? "mias" : canAssign ? "equipo" : "mias");
  const mine = (t: Task) => t.assignee_id === me.userId || (!!me.orgId && t.company_id === me.orgId && !t.assignee_id);
  const rows = all.filter((t) =>
    tab === "mias" ? mine(t) && OPEN_TASK.includes(t.status)
    : tab === "validar" ? t.status === "pendiente_validacion"
    : tab === "equipo" ? OPEN_TASK.includes(t.status)
    : !OPEN_TASK.includes(t.status));
  const today = madridDate();
  const counts: Record<string, number> = {
    mias: all.filter((t) => mine(t) && OPEN_TASK.includes(t.status)).length,
    validar: all.filter((t) => t.status === "pendiente_validacion").length,
    equipo: all.filter((t) => OPEN_TASK.includes(t.status)).length,
    cerradas: all.filter((t) => !OPEN_TASK.includes(t.status)).length,
  };
  const overdue = all.filter((t) => OPEN_TASK.includes(t.status) && t.due_date && t.due_date < today).length;
  const people = org.members.filter((m) => m.status === "activo").map((m) => ({ id: m.user_id, name: m.full_name, role: m.role, org: m.organization_id }));
  const companies = org.orgs.filter((o) => o.kind === "externa" && o.active).map((o) => ({ id: o.id, name: o.name }));
  return (
    <div className="space-y-5">
      <PageHeader title="Tareas" count={counts.equipo || counts.mias} subtitle={overdue ? `${overdue} fuera de plazo` : "Trabajo asignado a personas o empresas en cada tienda"} />
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist">
        {tabs.map(([k, label]) => (
          <Link key={k} href={`/tasks?tab=${k}`} role="tab" aria-selected={tab === k}
            className={`chip shrink-0 ${tab === k ? "!border-brand-600 !bg-brand-600 !text-[#fff]" : ""}`}>
            {label} <span className="tabular-nums opacity-80">{counts[k]}</span>
          </Link>
        ))}
      </div>
      <TaskBoard tasks={rows} tab={tab} me={{ id: me.userId, orgId: me.orgId, perms: me.permissions, isOwner: me.isOwner }}
        stores={Object.fromEntries(stores.map((s) => [s.id, { name: s.name, town: s.town }]))} people={people} companies={companies} today={today} />
    </div>
  );
}
