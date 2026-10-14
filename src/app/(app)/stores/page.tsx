import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronRight, MapPin, Play, Store as StoreIcon } from "lucide-react";
import { loadAllStores, loadCompletedDates, loadSettings, withObligations } from "@/lib/server/load";
import { PageHeader, StateBadge, EmptyState } from "@/components/ui";
import { StoreFilters, type Facets } from "@/components/StoreFilters";
import { FREQ_LABEL } from "@/lib/types";
import { StoreRow } from "@/components/StoreRow";
import { supabaseServer } from "@/lib/supabase/server";
import { brandKey, logoUrl } from "@/lib/brands";

const PAGE = 50;

export default async function StoresPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  // Los filtros admiten varios valores (?banner=A&banner=B); el resto son valores sueltos.
  const many = (k: string) => { const v = raw[k]; return (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean); };
  const sp = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])) as Record<string, string | undefined>;
  const f = { state: many("state"), town: many("town"), banner: many("banner"), chain: many("chain"), type: many("type"), freq: many("freq") };
  const inF = (vals: string[], x: string | null | undefined) => !vals.length || vals.includes(x ?? "");
  const q = (sp.q ?? "").trim().toLowerCase();
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  const [settings, dates, all] = await Promise.all([loadSettings(), loadCompletedDates(), loadAllStores()]);
  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a!.localeCompare(b!, "es")) as string[];
  const facets: Facets = { towns: uniq(all.map((s) => s.town)), banners: uniq(all.map((s) => s.banner)), chains: uniq(all.map((s) => s.chain)), types: uniq(all.map((s) => s.store_type)) };

  // Con 300–2000 tiendas es más rápido y consistente filtrar en memoria (el estado se calcula, no se guarda).
  const filtered = withObligations(all, dates, settings).filter((s) =>
    (!q || `${s.name} ${s.town ?? ""} ${s.address ?? ""} ${s.source_id ?? ""}`.toLowerCase().includes(q)) &&
    inF(f.state, s.ob.state) && inF(f.town, s.town) && inF(f.banner, s.banner) &&
    inF(f.chain, s.chain) && inF(f.type, s.store_type) && inF(f.freq, s.frequency) &&
    (sp.audit !== "1" || s.audit) && (sp.geo !== "no" || s.lat == null));
  const sb = await supabaseServer();
  const { data: bl } = await sb.from("brand_logos").select("brand_key,storage_path");
  const logos = new Map((bl ?? []).map((l) => [l.brand_key, logoUrl(l.storage_path)]));
  // Orden de la tabla (clic en la cabecera)
  const sort = sp.sort ?? "prio";
  const dir = sp.dir === "desc" ? -1 : 1;
  const STATE_RANK = { atrasada: 0, proxima: 1, pendiente: 2, cumplida: 3, sin_obligacion: 4 } as const;
  const cmp: Record<string, (a: (typeof filtered)[number], b: (typeof filtered)[number]) => number> = {
    prio: (a, b) => b.score - a.score,
    name: (a, b) => a.name.localeCompare(b.name, "es"),
    banner: (a, b) => (a.banner ?? "").localeCompare(b.banner ?? "", "es"),
    town: (a, b) => (a.town ?? "").localeCompare(b.town ?? "", "es"),
    freq: (a, b) => a.frequency.localeCompare(b.frequency),
    state: (a, b) => STATE_RANK[a.ob.state] - STATE_RANK[b.ob.state],
    due: (a, b) => (a.ob.pending > 0 && a.ob.deadline ? a.ob.deadline : "9999").localeCompare(b.ob.pending > 0 && b.ob.deadline ? b.ob.deadline : "9999"),
  };
  filtered.sort((a, b) => (cmp[sort] ?? cmp.prio)(a, b) * (sort === "prio" ? 1 : dir));
  const sortHref = (k: string) => {
    const u = new URLSearchParams();
    for (const [kk, v] of Object.entries(raw)) if (v && !["page", "sort", "dir"].includes(kk)) for (const x of Array.isArray(v) ? v : [v]) u.append(kk, x);
    u.set("sort", k);
    if (sort === k && dir === 1) u.set("dir", "desc");
    return `/stores?${u}`;
  };
  const Th = ({ k, children, className }: { k: string; children: React.ReactNode; className?: string }) => (
    <th className={className} aria-sort={sort === k ? (dir === 1 ? "ascending" : "descending") : undefined}>
      <Link href={sortHref(k)} scroll={false} className="inline-flex items-center gap-1 hover:text-slate-900">
        {children}{sort === k && (dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </Link>
    </th>
  );
  const dm = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "—");
  const count = filtered.length;
  const rows = filtered.slice((page - 1) * PAGE, page * PAGE);
  const pages = Math.max(1, Math.ceil(count / PAGE));
  const qs = (p: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(raw)) if (v && k !== "page") for (const x of Array.isArray(v) ? v : [v]) u.append(k, x);
    u.set("page", String(p));
    return `/stores?${u}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Tiendas" count={count}>
        <Link href="/stores/new" className="btn">Nueva tienda</Link>
      </PageHeader>
      <StoreFilters facets={facets} />
      <ul className="space-y-2.5 md:hidden">
        {rows.map((s) => (
          <StoreRow key={s.id} s={{
            id: s.id, name: s.name, audit: s.audit, state: s.ob.state, lat: s.lat, lng: s.lng,
            logo: logos.get(brandKey(s.banner) ?? "") ?? null,
            sub: [s.town, FREQ_LABEL[s.frequency], s.ob.deadline && s.ob.pending > 0 ? `vence ${s.ob.deadline.slice(8, 10)}/${s.ob.deadline.slice(5, 7)}` : null].filter(Boolean).join(" · "),
          }} />
        ))}
        {rows.length === 0 && <li><EmptyState title="Sin resultados" text="Prueba a quitar algún filtro." /></li>}
      </ul>
      <div className="card hidden overflow-hidden !p-0 md:block">
        <div className="h-scroll max-h-[calc(100dvh-17rem)] overflow-y-auto">
          <table className="data-table">
            <thead>
              <tr>
                <Th k="name" className="pl-4">Tienda</Th>
                <Th k="banner">Enseña</Th>
                <Th k="town">Municipio</Th>
                <Th k="freq">Periodicidad</Th>
                <Th k="due">Vence</Th>
                <Th k="state">Estado</Th>
                <th className="w-px pr-4"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const logo = logos.get(brandKey(s.banner) ?? "");
                return (
                  <tr key={s.id}>
                    <td className="max-w-[22rem] pl-4">
                      <Link href={`/stores/${s.id}`} className="flex items-center gap-3">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-2 ${s.audit ? "ring-slate-900" : "ring-slate-200"}`}>
                          {logo ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={logo} alt="" loading="lazy" className="h-6 w-6 object-contain" /> : <StoreIcon size={14} className="text-slate-400" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-slate-900 hover:text-brand-600">{s.name}</span>
                          <span className="block truncate text-xs text-slate-500">{s.address ?? "Sin dirección"}{s.lat == null ? " · sin ubicación" : s.geocode_status === "partial" ? " · ubicación aprox." : ""}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap text-slate-600">{s.banner ?? "—"}</td>
                    <td className="whitespace-nowrap text-slate-600">{s.town ?? "—"}</td>
                    <td className="whitespace-nowrap text-slate-600">{FREQ_LABEL[s.frequency]}{s.audit && <span className="badge ml-2 bg-slate-900 text-slate-50">Audit</span>}</td>
                    <td className="whitespace-nowrap tabular-nums text-slate-600">{s.ob.pending > 0 ? dm(s.ob.deadline) : "—"}</td>
                    <td><StateBadge state={s.ob.state} /></td>
                    <td className="pr-4">
                      <div className="row-actions flex items-center justify-end gap-0.5">
                        <Link href={`/visits/new?store=${s.id}`} className="icon-btn" title="Iniciar visita" aria-label={`Iniciar visita en ${s.name}`}><Play size={15} /></Link>
                        {s.lat != null && s.lng != null && <a href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`} target="_blank" rel="noreferrer" className="icon-btn" title="Cómo llegar" aria-label={`Cómo llegar a ${s.name}`}><MapPin size={15} /></a>}
                        <Link href={`/stores/${s.id}`} className="icon-btn" title="Abrir ficha" aria-label={`Abrir ficha de ${s.name}`}><ChevronRight size={16} /></Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={7}><EmptyState title="Sin resultados" text="Prueba a quitar algún filtro." /></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex items-center justify-between text-sm">
        {page > 1 ? <Link className="btn-secondary" href={qs(page - 1)}>← Anterior</Link> : <span />}
        <span className="text-slate-500">Página {page} de {pages}</span>
        {page < pages ? <Link className="btn-secondary" href={qs(page + 1)}>Siguiente →</Link> : <span />}
      </div>
    </div>
  );
}
