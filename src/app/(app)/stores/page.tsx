import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { loadCompletedDates, loadSettings, withObligations } from "@/lib/server/load";
import { PageHeader, StateBadge } from "@/components/ui";
import { StoreFilters } from "@/components/StoreFilters";
import { FREQ_LABEL, type Store } from "@/lib/types";

const PAGE = 50;

export default async function StoresPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").replace(/[,()%*\\]/g, " ").trim();
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const sb = await supabaseServer();

  let query = sb.from("stores").select("*", { count: "exact" }).eq("active", true);
  if (q) query = query.or(`name.ilike.%${q}%,town.ilike.%${q}%,address.ilike.%${q}%,source_id.ilike.%${q}%`);
  if (sp.town) query = query.eq("town", sp.town);
  if (sp.banner) query = query.eq("banner", sp.banner);
  if (sp.freq) query = query.eq("frequency", sp.freq);
  if (sp.audit === "1") query = query.eq("audit", true);
  if (sp.geo === "no") query = query.is("lat", null);
  const { data, count } = await query.order("name").range((page - 1) * PAGE, page * PAGE - 1);

  const [settings, dates, { data: facets }] = await Promise.all([
    loadSettings(),
    loadCompletedDates(),
    sb.from("stores").select("town,banner").eq("active", true).limit(2000),
  ]);
  const rows = withObligations((data ?? []) as Store[], dates, settings);
  const towns = [...new Set((facets ?? []).map((f) => f.town).filter(Boolean))].sort() as string[];
  const banners = [...new Set((facets ?? []).map((f) => f.banner).filter(Boolean))].sort() as string[];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const qs = (p: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "page") u.set(k, v);
    u.set("page", String(p));
    return `/stores?${u}`;
  };

  return (
    <div className="space-y-4">
      <PageHeader title={`Tiendas (${count ?? 0})`}>
        <Link href="/stores/new" className="btn">Nueva tienda</Link>
      </PageHeader>
      <StoreFilters towns={towns} banners={banners} />
      <ul className="space-y-2 md:hidden">
        {rows.map((s) => (
          <li key={s.id}>
            <Link href={`/stores/${s.id}`} className="card flex items-center justify-between gap-3 !p-3">
              <span className="min-w-0">
                <span className="block truncate font-medium">{s.audit && <span className="badge mr-1 bg-slate-900 text-white">Audit</span>}{s.name}</span>
                <span className="block truncate text-xs text-slate-500">{s.address}, {s.town} · {FREQ_LABEL[s.frequency]}</span>
              </span>
              <StateBadge state={s.ob.state} />
            </Link>
          </li>
        ))}
        {rows.length === 0 && <li className="card text-center text-sm text-slate-500">Sin resultados.</li>}
      </ul>
      <div className="card hidden overflow-x-auto p-0 md:block">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr><th className="p-3">Tienda</th><th>Municipio</th><th>Periodicidad</th><th>Estado</th><th>Ubic.</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="p-3">
                  <Link href={`/stores/${s.id}`} className="font-medium hover:underline">{s.name}</Link>
                  {s.audit && <span className="badge ml-2 bg-slate-900 text-white">Audit</span>}
                  <div className="text-xs text-slate-400">{s.address}</div>
                </td>
                <td>{s.town}</td>
                <td>{FREQ_LABEL[s.frequency]}</td>
                <td><StateBadge state={s.ob.state} /></td>
                <td>{s.lat != null ? (s.geocode_status === "partial" ? "⚠ revisar" : "✓") : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-500">Sin resultados.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm">
        {page > 1 ? <Link className="btn-secondary" href={qs(page - 1)}>← Anterior</Link> : <span />}
        <span className="text-slate-500">Página {page} de {pages}</span>
        {page < pages ? <Link className="btn-secondary" href={qs(page + 1)}>Siguiente →</Link> : <span />}
      </div>
    </div>
  );
}
