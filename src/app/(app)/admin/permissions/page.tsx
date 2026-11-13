import { redirect } from "next/navigation";
import clsx from "clsx";
import { Check, Minus } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe } from "@/lib/server/me";
import { ACTIONS, can, MODULES, ROLES } from "@/lib/enterprise/roles";

export const metadata = { title: "Roles y permisos · Mahou" };

const SCOPE: Record<string, string> = { organizacion: "Toda la organización", unidad: "Su unidad y lo que cuelga", cartera: "Sus tiendas asignadas", empresa: "Tiendas de su empresa", propio: "Lo suyo" };

export default async function PermissionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (!can(me.permissions, "usuarios.consultar")) return <p className="text-sm text-slate-500">Tu perfil no tiene acceso a esta sección.</p>;
  const sp = await searchParams;
  const sb = await supabaseServer();
  const [{ data: rp }, { data: roles }] = await Promise.all([sb.from("role_permissions").select("role,permission"), sb.from("roles").select("key,name,description,scope,external").order("sort_order")]);
  const role = ROLES.find((r) => r.key === sp.role)?.key ?? "reponedor";
  const set = new Set((rp ?? []).filter((r) => r.role === role).map((r) => r.permission));
  const info = (roles ?? []).find((r) => r.key === role);
  const has = (m: string, a: string) => set.has(`${m}.${a}`) || (["consultar", "crear", "editar", "eliminar", "asignar"].includes(a) && set.has(`${m}.administrar`));
  return (
    <div className="space-y-5">
      <PageHeader title="Roles y permisos" subtitle="Lo que puede hacer cada perfil. Las excepciones por persona se dan en Usuarios, con motivo y fecha de fin." />
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {ROLES.map((r) => (
          <a key={r.key} href={`/admin/permissions?role=${r.key}`} className={clsx("chip shrink-0", r.key === role && "!border-brand-600 !bg-brand-600 !text-[#fff]")}>{r.short}</a>
        ))}
      </div>
      <section className="card space-y-1">
        <h2 className="t-section">{info?.name}</h2>
        <p className="text-sm text-slate-600">{info?.description}</p>
        <p className="text-sm"><span className="text-slate-500">Ámbito:</span> <b>{SCOPE[info?.scope ?? ""]}</b>{info?.external ? " · usuario de empresa externa" : ""}</p>
      </section>
      <div className="card overflow-x-auto !p-0">
        <table className="data-table min-w-[48rem]">
          <thead><tr><th className="sticky left-0 bg-white pl-5">Módulo</th>{ACTIONS.map(([k, l]) => <th key={k} className="text-center">{l}</th>)}</tr></thead>
          <tbody>{MODULES.map(([m, l]) => (
            <tr key={m}><td className="sticky left-0 bg-white pl-5 font-semibold">{l}</td>
              {ACTIONS.map(([a]) => <td key={a} className="text-center">{has(m, a) ? <Check size={17} className="mx-auto text-st-ok" aria-label="Sí" strokeWidth={2.6} /> : <Minus size={15} className="mx-auto text-slate-300" aria-label="No" />}</td>)}
            </tr>))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">La seguridad la aplica la base de datos: aunque alguien manipule la app, no puede ver ni cambiar nada fuera de su perfil y su ámbito.</p>
    </div>
  );
}
