import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { KpiRow, PeopleTable, UnitTable } from "@/components/enterprise/ScopeViews";
import { getMe } from "@/lib/server/me";
import { loadScope, unitPath } from "@/lib/server/scope";
import { can, unitKindName } from "@/lib/enterprise/roles";

export const metadata = { title: "Panel de dirección · Mahou" };

export default async function DirectionPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (!can(me.permissions, "informes.exportar") && !can(me.permissions, "panel.exportar")) return <p className="text-sm text-slate-500">Tu perfil no tiene acceso al panel de dirección.</p>;
  const sp = await searchParams;
  const unit = sp.unit && /^[0-9a-f-]{36}$/.test(sp.unit) ? sp.unit : null;
  const s = await loadScope(unit);
  const cur = unit ? s.units.find((u) => u.id === unit) : null;
  // Migas: de la raíz a la unidad elegida.
  const crumbs: { id: string | null; name: string }[] = [{ id: null, name: "Todo mi ámbito" }];
  for (let u = cur; u; u = s.units.find((x) => x.id === u!.parent_id)) crumbs.splice(1, 0, { id: u.id, name: u.name });
  const people = [...s.byPerson].filter((p) => p.portfolio > 0).sort((a, b) => (a.compliance.required ? a.compliance.done / a.compliance.required : 1) - (b.compliance.required ? b.compliance.done / b.compliance.required : 1));
  return (
    <div className="space-y-5">
      <PageHeader title="Panel de dirección" subtitle={cur ? `${unitKindName(cur.kind)} · ${unitPath(s.units, cur.id)}` : "Estado de la ejecución en tu ámbito, este mes"} />
      <nav aria-label="Ámbito" className="flex flex-wrap items-center gap-1.5 text-sm">
        {crumbs.map((c, i) => (
          <span key={c.id ?? "root"} className="inline-flex items-center gap-1.5">
            {i > 0 && <span className="text-slate-400">›</span>}
            {i === crumbs.length - 1 ? <b>{c.name}</b> : <Link className="link" href={c.id ? `/direction?unit=${c.id}` : "/direction"}>{c.name}</Link>}
          </span>
        ))}
      </nav>
      <KpiRow b={s.total} />
      <section className="card space-y-3">
        <h2 className="t-section">Por {s.byUnit[0] ? unitKindName(s.units.find((u) => u.id === s.byUnit[0].key)?.kind ?? "zona").toLowerCase() : "unidad"}</h2>
        <UnitTable rows={s.byUnit} hrefFor={(b) => (b.key !== "none" && s.units.some((u) => u.parent_id === b.key) ? `/direction?unit=${b.key}` : null)} />
      </section>
      <section className="space-y-3">
        <h2 className="t-section">Personas con cartera <span className="text-sm font-normal text-slate-500">· de menor a mayor cumplimiento</span></h2>
        <PeopleTable rows={people} unitName={(id) => unitPath(s.units, id).split(" › ").at(-1) ?? ""} />
      </section>
    </div>
  );
}
