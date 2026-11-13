import { PageHeader } from "@/components/ui";
import { FilterBar } from "@/components/FilterBar";
import { AgreementsList } from "@/components/AgreementsList";
import { loadAgreements, loadCatalog, loadStoresLite } from "@/lib/server/economy";
import { madridDate } from "@/lib/domain/dates";
import { eur } from "@/lib/format";
import { AGREEMENT_LABEL, daysToEnd, monthlyEquivalent, type AgreementStatus } from "@/lib/economy";

export const metadata = { title: "Acuerdos · Mahou" };

export default async function AgreementsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const many = (k: string) => { const v = raw[k]; return (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean); };
  const one = (k: string) => { const v = raw[k]; return (Array.isArray(v) ? v[0] : v) ?? ""; };
  const today = madridDate();
  const [{ types, categories }, stores, all] = await Promise.all([loadCatalog(), loadStoresLite(), loadAgreements()]);
  const storeById = new Map(stores.map((s) => [s.id, s]));
  const typeById = new Map(types.map((t) => [t.id, t]));
  const f = { status: many("status"), category: many("category"), banner: many("banner"), venc: one("venc"), q: one("q").toLowerCase() };
  const rows = all.filter((a) => {
    const s = storeById.get(a.store_id);
    const d = daysToEnd(a.end_date, today);
    return (!f.status.length || f.status.includes(a.status)) && (!f.category.length || f.category.includes(typeById.get(a.type_id)?.category_id ?? "")) &&
      (!f.banner.length || f.banner.includes(s?.banner ?? "")) && (!f.venc || (d != null && d >= 0 && d <= Number(f.venc))) &&
      (!f.q || `${a.title ?? ""} ${typeById.get(a.type_id)?.name ?? ""} ${s?.name ?? ""} ${s?.town ?? ""}`.toLowerCase().includes(f.q));
  }).sort((a, b) => (a.end_date ?? "9999").localeCompare(b.end_date ?? "9999"));
  const live = all.filter((a) => a.status === "en_ejecucion" || a.status === "aprobado");
  const monthly = live.reduce((s, a) => s + monthlyEquivalent({ ...a, amount: Number(a.amount) }), 0);
  const soon = live.filter((a) => { const d = daysToEnd(a.end_date, today); return d != null && d >= 0 && d <= 60; }).length;
  const banners = [...new Set(stores.map((s) => s.banner).filter(Boolean))].sort() as string[];

  return (
    <div className="space-y-5">
      <PageHeader title="Acuerdos comerciales" count={rows.length} />
      <section className="grid grid-cols-3 gap-2.5">
        <div className="card !p-3"><div className="text-xs text-slate-500">Vigentes</div><div className="text-2xl font-bold tabular-nums">{live.length}</div></div>
        <div className="card !p-3"><div className="text-xs text-slate-500">Mensual equivalente</div><div className="text-xl font-bold tabular-nums md:text-2xl">{eur(monthly)}</div></div>
        <a href="/agreements?venc=60" className="card tap !p-3"><div className="text-xs text-slate-500">Vencen en 60 días</div><div className="text-2xl font-bold tabular-nums">{soon}</div></a>
      </section>
      <FilterBar search="Buscar tienda, concepto o título…" filters={[
        { name: "status", label: "Estado", options: (Object.keys(AGREEMENT_LABEL) as AgreementStatus[]).map((s) => [s, AGREEMENT_LABEL[s]]) },
        { name: "category", label: "Tipo de inversión", options: categories.map((c) => [c.id, c.name]), all: "Todos" },
        { name: "banner", label: "Enseña", options: banners.map((b) => [b, b]), all: "Todas" },
        { name: "venc", label: "Vencimiento", options: [["30", "En 30 días"], ["60", "En 60 días"], ["90", "En 90 días"]], multi: false, all: "Cualquiera" },
      ]} />
      <AgreementsList rows={rows} stores={Object.fromEntries(rows.map((a) => [a.store_id, storeById.get(a.store_id) ?? null]))} types={types} categories={categories} today={today} />
    </div>
  );
}
