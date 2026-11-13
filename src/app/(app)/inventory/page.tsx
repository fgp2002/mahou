import Link from "next/link";
import { Download, MapPin } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui";
import { FilterBar } from "@/components/FilterBar";
import { StatusBadge } from "@/components/EquipmentPanel";
import { loadInventory, parseInventoryFilters } from "@/lib/server/inventory";
import { equipmentTitle, STATUS_LABEL, STATUS_ORDER } from "@/lib/equipment";
import { dmy } from "@/lib/format";

export const metadata = { title: "Inventario · Mahou" };
const PAGE = 60;

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const f = parseInventoryFilters(raw);
  const { rows, total, facets, byType, byStatus, stores } = await loadInventory(f);
  const page = Math.max(1, Number(Array.isArray(raw.page) ? raw.page[0] : raw.page) || 1);
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const qs = (extra: Record<string, string>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(raw)) if (v && k !== "page") for (const x of Array.isArray(v) ? v : [v]) u.append(k, x);
    for (const [k, v] of Object.entries(extra)) { u.delete(k); if (v) u.set(k, v); }
    return u.toString();
  };
  const types = [...byType].sort((a, b) => b[1].units - a[1].units);

  return (
    <div className="space-y-5">
      <PageHeader title="Inventario" count={rows.length}>
        <a className="btn-secondary" href={`/api/inventory/export?${qs({})}`}><Download size={16} /> CSV</a>
      </PageHeader>

      {total === 0 ? (
        <div className="card"><EmptyState title="Aún no hay elementos" text="Da de alta neveras, cabeceras y demás elementos desde la ficha de cada tienda o durante una visita." /></div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {types.map(([id, t]) => (
              <Link key={id} href={`/inventory?${qs({ type: id })}`} className="card tap !p-3">
                <div className="truncate text-xs text-slate-500">{t.name}</div>
                <div className="text-2xl font-bold tabular-nums">{t.units}</div>
                {t.review > 0 && <div className="text-[11px] font-semibold text-[rgb(var(--st-soon))]">{t.review} por revisar</div>}
              </Link>
            ))}
          </section>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_ORDER.filter((s) => byStatus.get(s)).map((s) => (
              <Link key={s} href={`/inventory?${qs({ status: s })}`} className="tap inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs">
                {STATUS_LABEL[s]} <b className="tabular-nums">{byStatus.get(s)}</b>
              </Link>
            ))}
            <span className="self-center text-xs text-slate-500">en {stores} tienda{stores === 1 ? "" : "s"}</span>
          </div>

          <FilterBar search="Buscar código, tienda, municipio, ubicación…" filters={[
            { name: "type", label: "Tipo", options: facets.types },
            { name: "status", label: "Estado", options: STATUS_ORDER.map((s) => [s, STATUS_LABEL[s]]) },
            { name: "brand", label: "Marca", options: facets.brands.map((b) => [b, b]), all: "Todas" },
            { name: "banner", label: "Enseña", options: facets.banners.map((b) => [b, b]), all: "Todas" },
            { name: "chain", label: "Cadena", options: facets.chains.map((b) => [b, b]), all: "Todas" },
          ]} />

          {rows.length === 0 ? <div className="card"><EmptyState title="Sin resultados" text="Prueba a quitar algún filtro." /></div> : (
            <>
              <ul className="space-y-2 md:hidden">
                {shown.map((e) => (
                  <li key={e.id}>
                    <Link href={`/stores/${e.store_id}?tab=inventario`} className="card tap block !p-3">
                      <div className="flex items-center justify-between gap-2"><b className="truncate">{equipmentTitle(e, e.typeName)}{e.quantity > 1 ? ` ×${e.quantity}` : ""}</b><StatusBadge status={e.status} /></div>
                      <div className="mt-1 truncate text-xs text-slate-500">{e.code} · {e.store.name}{e.store.town ? ` · ${e.store.town}` : ""}</div>
                      {e.location && <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500"><MapPin size={11} />{e.location}</div>}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="card hidden overflow-hidden !p-0 md:block">
                <div className="h-scroll">
                  <table className="data-table">
                    <thead><tr><th className="pl-4">Código</th><th>Elemento</th><th>Tienda</th><th>Ubicación</th><th>Instalación</th><th>Estado</th></tr></thead>
                    <tbody>
                      {shown.map((e) => (
                        <tr key={e.id}>
                          <td className="whitespace-nowrap pl-4 tabular-nums text-slate-500">{e.code}</td>
                          <td className="font-semibold">{equipmentTitle(e, e.typeName)}{e.quantity > 1 ? ` ×${e.quantity}` : ""}</td>
                          <td><Link className="hover:text-brand-600" href={`/stores/${e.store_id}?tab=inventario`}>{e.store.name}</Link><div className="text-xs text-slate-500">{[e.store.banner, e.store.town].filter(Boolean).join(" · ")}</div></td>
                          <td className="text-slate-600">{e.location ?? "—"}</td>
                          <td className="whitespace-nowrap tabular-nums text-slate-600">{e.status === "retirado" ? `retirado ${dmy(e.removed_on)}` : `${dmy(e.installed_on)}${e.installed_on_estimated ? " ≈" : ""}`}</td>
                          <td><StatusBadge status={e.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {pages > 1 && (
                <div className="flex items-center justify-between text-sm">
                  {page > 1 ? <Link className="btn-secondary" href={`/inventory?${qs({ page: String(page - 1) })}`}>← Anterior</Link> : <span />}
                  <span className="text-slate-500">Página {page} de {pages}</span>
                  {page < pages ? <Link className="btn-secondary" href={`/inventory?${qs({ page: String(page + 1) })}`}>Siguiente →</Link> : <span />}
                </div>
              )}
              <p className="text-xs text-slate-500">≈ fecha de instalación aproximada (la del alta en la app). Las cifras de arriba cuentan unidades presentes en tienda, sin retirados ni pendientes de instalar.</p>
            </>
          )}
        </>
      )}
    </div>
  );
}
