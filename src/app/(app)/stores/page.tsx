import Link from "next/link";
import { loadAllStores, loadCompletedDates, loadSettings, withObligations } from "@/lib/server/load";
import { PageHeader, StateBadge } from "@/components/ui";
import { StoreFilters, type Facets } from "@/components/StoreFilters";
import { FREQ_LABEL } from "@/lib/types";

const PAGE = 50;

export default async function StoresPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  const [settings, dates, all] = await Promise.all([loadSettings(), loadCompletedDates(), loadAllStores()]);
  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a!.localeCompare(b!, "es")) as string[];
  const facets: Facets = { towns: uniq(all.map((s) => s.town)), banners: uniq(all.map((s) => s.banner)), chains: uniq(all.map((s) => s.chain)), types: uniq(all.map((s) => s.store_type)) };

  // Con 300–2000 tiendas es más rápido y consistente filtrar en memoria (el estado se calcula, no se guarda).
  const filtered = withObligations(all, dates, settings).filter((s) =>
    (!q || `${s.name} ${s.town ?? ""} ${s.address ?? ""} ${s.source_id ?? ""}`.toLowerCase().includes(q)) &&
    (!sp.state || s.ob.state === sp.state) && (!sp.town || s.town === sp.town) && (!sp.banner || s.banner === sp.banner) &&
    (!sp.chain || s.chain === sp.chain) && (!sp.type || s.store_type === sp.type) && (!sp.freq || s.frequency === sp.freq) &&
    (sp.audit !== "1" || s.audit) && (sp.geo !== "no" || s.lat == null));
  const count = filtered.length;
  const rows = filtered.slice((page - 1) * PAGE, page * PAGE);
  const pages = Math.max(1, Math.ceil(count / PAGE));
  const qs = (p: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "page") u.set(k, v);
    u.set("page", String(p));
    return `/stores?${u}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader title={`Tiendas (${count ?? 0})`}>
        <Link href="/stores/new" className="btn">Nueva tienda</Link>
      </PageHeader>
      <StoreFilters facets={facets} />
      <ul className="space-y-3 md:hidden">
        {rows.map((s) => (
          <li key={s.id}>
            <Link href={`/stores/${s.id}`} className="card tap flex items-center justify-between gap-3 !p-3">
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
      <div className="card hidden h-scroll p-0 md:block">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr><th className="p-3">Tienda</th><th>Municipio</th><th>Periodicidad</th><th>Estado</th><th>Ubic.</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((s) => (
              <tr key={s.id} className="row-link">
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
