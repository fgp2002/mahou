import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { KpiRow, PeopleTable } from "@/components/enterprise/ScopeViews";
import { getMe } from "@/lib/server/me";
import { loadScope, unitPath } from "@/lib/server/scope";
import { can } from "@/lib/enterprise/roles";

export const metadata = { title: "Mi equipo · Mahou" };

export default async function TeamPage() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (!can(me.permissions, "usuarios.consultar")) return <p className="text-sm text-slate-500">Tu perfil no tiene acceso a esta sección.</p>;
  const s = await loadScope();
  const people = s.byPerson.filter((p) => p.member.user_id !== me.userId).sort((a, b) => b.atrasadas - a.atrasadas || b.tasksOverdue - a.tasksOverdue || a.member.full_name.localeCompare(b.member.full_name));
  const active = people.filter((p) => p.visitsToday > 0).length;
  return (
    <div className="space-y-5">
      <PageHeader title="Mi equipo" count={people.length} subtitle={`${active} de ${people.length} personas con visitas hoy${me.unitName ? ` · ${me.unitName}` : me.orgKind === "externa" && me.orgName ? ` · ${me.orgName}` : ""}`} />
      <KpiRow b={s.total} />
      <section className="space-y-3">
        <h2 className="t-section">Personas</h2>
        <PeopleTable rows={people} unitName={(id) => unitPath(s.units, id).split(" › ").at(-1) ?? ""} />
      </section>
    </div>
  );
}
