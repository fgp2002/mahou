import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { StructureAdmin } from "@/components/enterprise/StructureAdmin";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe } from "@/lib/server/me";
import { loadOrg } from "@/lib/server/scope";
import { can } from "@/lib/enterprise/roles";

export const metadata = { title: "Organización · Mahou" };

export default async function StructurePage() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (!can(me.permissions, "estructura.consultar")) return <p className="text-sm text-slate-500">Tu perfil no tiene acceso a la estructura.</p>;
  const sb = await supabaseServer();
  const org = await loadOrg();
  const stores: { id: string; unit_id: string | null; town: string | null; chain: string | null; banner: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from("stores").select("id,unit_id,town,chain,banner").eq("active", true).range(from, from + 999);
    stores.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const { data: svc } = await sb.from("store_assignments").select("company_id,store_id,valid_from,valid_to").not("company_id", "is", null);
  const today = new Date().toISOString().slice(0, 10);
  const companyStores: Record<string, number> = {};
  for (const a of svc ?? []) if (a.valid_from <= today && (!a.valid_to || a.valid_to >= today)) companyStores[a.company_id!] = (companyStores[a.company_id!] ?? 0) + 1;
  const peopleIn: Record<string, number> = {};
  for (const m of org.members) if (m.status === "activo") { const k = m.unit_id ?? m.organization_id; peopleIn[k] = (peopleIn[k] ?? 0) + 1; }
  return (
    <div className="space-y-5">
      <PageHeader title="Organización" subtitle={`${org.orgs.find((o) => o.kind === "propietaria")?.name ?? "Tu organización"} · estructura territorial y empresas de servicio`} />
      <StructureAdmin
        perms={me.permissions} units={org.units} people={peopleIn} companyStores={companyStores}
        companies={org.orgs.filter((o) => o.kind === "externa")}
        stores={stores} />
    </div>
  );
}
