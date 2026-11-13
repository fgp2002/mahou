import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { PortfoliosAdmin } from "@/components/enterprise/PortfoliosAdmin";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe } from "@/lib/server/me";
import { loadOrg } from "@/lib/server/scope";
import { can } from "@/lib/enterprise/roles";
import { madridDate } from "@/lib/domain/dates";

export const metadata = { title: "Carteras · Mahou" };

export default async function PortfoliosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (!can(me.permissions, "carteras.consultar")) return <p className="text-sm text-slate-500">Tu perfil no tiene acceso a las carteras.</p>;
  const sp = await searchParams;
  const sb = await supabaseServer();
  const today = madridDate();
  const org = await loadOrg();
  const stores: { id: string; name: string; town: string | null; chain: string | null; banner: string | null; unit_id: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from("stores").select("id,name,town,chain,banner,unit_id").eq("active", true).order("name").range(from, from + 999);
    stores.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const assigns: { id: string; store_id: string; user_id: string | null; company_id: string | null; function: string; valid_from: string; valid_to: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from("store_assignments").select("id,store_id,user_id,company_id,function,valid_from,valid_to").or(`valid_to.is.null,valid_to.gte.${today}`).range(from, from + 999);
    assigns.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return (
    <div className="space-y-5">
      <PageHeader title="Carteras" subtitle="Qué tiendas atiende cada GPV, reponedor o empresa de servicio. Reasignar guarda el histórico." />
      <PortfoliosAdmin
        canAssign={can(me.permissions, "carteras.asignar")} selected={sp.who ?? null}
        people={org.members.filter((m) => m.status === "activo" && ["gpv", "reponedor", "reponedor_conveniencia", "jefe_gpv", "supervisor_conveniencia"].includes(m.role)).map((m) => ({ id: m.user_id, name: m.full_name, role: m.role }))}
        companies={org.orgs.filter((o) => o.kind === "externa" && o.active).map((o) => ({ id: o.id, name: o.name }))}
        stores={stores} assigns={assigns.filter((a) => a.valid_from <= today)} />
    </div>
  );
}
