import Link from "next/link";
import clsx from "clsx";
import { supabaseServer } from "@/lib/supabase/server";
import { ProductsManager, type Product } from "@/components/ProductsManager";
import { ThemeSwitch, AccountPanel } from "@/components/AppSettings";
import { PageHeader } from "@/components/ui";
import { ImportPanel } from "@/components/ImportPanel";
import { GeocodePanel } from "@/components/GeocodePanel";
import { LogosManager, type BrandRow } from "@/components/LogosManager";
import { brandKey, logoUrl } from "@/lib/brands";
import { PaymentTypesManager } from "@/components/PaymentTypesManager";
import { loadPaymentTypes } from "@/lib/server/load";
import { SettingsForm, type SettingsValues } from "@/components/SettingsForm";
import { DEFAULT_DURATIONS } from "@/lib/types";
import { madridDate } from "@/lib/domain/dates";

const TABS = [["jornada", "Jornada"], ["catalogo", "Catálogo"], ["app", "App y cuenta"]] as const;
const SUBS = [["ensenas", "Enseñas"], ["productos", "Productos"], ["pagos", "Tipos de pago"], ["datos", "Datos"]] as const;
type Tab = (typeof TABS)[number][0];
type Sub = (typeof SUBS)[number][0];

function Segmented<T extends string>({ items, active, href, small }: { items: readonly (readonly [T, string])[]; active: T; href: (k: T) => string; small?: boolean }) {
  return (
    <nav className={clsx("h-scroll flex gap-1 rounded-full bg-slate-100 p-1", small ? "text-xs" : "text-sm")} aria-label="Secciones">
      {items.map(([k, l]) => (
        <Link key={k} href={href(k)} scroll={false} aria-current={k === active ? "page" : undefined}
          className={clsx("flex-1 whitespace-nowrap rounded-full px-3 text-center font-semibold transition", small ? "py-1.5" : "py-2", k === active ? "bg-white text-slate-900 shadow-card" : "text-slate-500")}>{l}</Link>
      ))}
    </nav>
  );
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; sub?: string }> }) {
  const sp = await searchParams;
  const tab: Tab = (TABS.find(([k]) => k === sp.tab)?.[0]) ?? "jornada";
  const sub: Sub = (SUBS.find(([k]) => k === sp.sub)?.[0]) ?? "ensenas";
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Ajustes" />
      <Segmented items={TABS} active={tab} href={(k) => `/settings?tab=${k}`} />
      {tab === "jornada" && <Jornada />}
      {tab === "catalogo" && (
        <div className="space-y-4">
          <Segmented small items={SUBS} active={sub} href={(k) => `/settings?tab=catalogo&sub=${k}`} />
          {sub === "ensenas" && <Ensenas />}
          {sub === "productos" && <Productos />}
          {sub === "pagos" && <Pagos />}
          {sub === "datos" && <Datos />}
        </div>
      )}
      {tab === "app" && <App />}
    </div>
  );
}

async function Jornada() {
  const sb = await supabaseServer();
  const { data: s } = await sb.from("user_settings").select("*").maybeSingle();
  const pp = (s?.planning_prefs ?? {}) as { audit_first?: boolean; max_stops_per_day?: number | null; holidays?: string[]; work_days?: number[] };
  const initial: SettingsValues = {
    owner_id: s?.owner_id ?? "",
    work_start: (s?.work_start ?? "08:00").slice(0, 5), work_end: (s?.work_end ?? "18:00").slice(0, 5), route_start: (s?.route_start ?? "09:00").slice(0, 5),
    transport: s?.transport ?? "driving", tracking_start: s?.tracking_start ?? madridDate(),
    visit_durations: { ...DEFAULT_DURATIONS, ...(s?.visit_durations ?? {}) },
    holidays: (pp.holidays ?? []).join(", "), work_days: pp.work_days ?? [0, 1, 2, 3, 4], max_stops: pp.max_stops_per_day ? String(pp.max_stops_per_day) : "", audit_first: pp.audit_first ?? true,
  };
  return <SettingsForm initial={initial} />;
}

async function Ensenas() {
  const sb = await supabaseServer();
  const [{ data: bs }, { data: bl }] = await Promise.all([sb.from("stores").select("banner").eq("active", true).limit(5000), sb.from("brand_logos").select("brand_key,storage_path,source")]);
  const logoMap = new Map((bl ?? []).map((l) => [l.brand_key, l]));
  const counts = new Map<string, number>();
  for (const r of bs ?? []) { const k = brandKey(r.banner); if (k) counts.set(k, (counts.get(k) ?? 0) + 1); }
  const brands: BrandRow[] = [...counts].sort((a, b) => b[1] - a[1]).map(([key, stores]) => {
    const l = logoMap.get(key);
    return { key, stores, path: l?.storage_path ?? null, url: l ? logoUrl(l.storage_path) : null, source: l?.source ?? null };
  });
  return <LogosManager brands={brands} />;
}

async function Productos() {
  const sb = await supabaseServer();
  const { data } = await sb.from("products").select("id,reference,name,brand,container,capacity_ml,pack_units,notes,active").order("active", { ascending: false }).order("name");
  return <ProductsManager products={(data ?? []) as Product[]} />;
}

async function Pagos() {
  const sb = await supabaseServer();
  const types = await loadPaymentTypes();
  const [{ data: uc }, { data: ur }] = await Promise.all([sb.from("payment_concepts").select("payment_type_id"), sb.from("payment_records").select("payment_type_id")]);
  const usage: Record<string, number> = {};
  for (const r of [...(uc ?? []), ...(ur ?? [])]) if (r.payment_type_id) usage[r.payment_type_id] = (usage[r.payment_type_id] ?? 0) + 1;
  return <PaymentTypesManager types={types} usage={usage} />;
}

async function Datos() {
  const sb = await supabaseServer();
  const [pend, fail, { data: runs }] = await Promise.all([
    sb.from("stores").select("id", { count: "exact", head: true }).eq("geocode_status", "pending").is("lat", null),
    sb.from("stores").select("id", { count: "exact", head: true }).eq("geocode_status", "failed"),
    sb.from("import_runs").select("*").order("created_at", { ascending: false }).limit(5),
  ]);
  return (
    <div className="space-y-4">
      <GeocodePanel pending={pend.count ?? 0} failed={fail.count ?? 0} />
      <ImportPanel />
      {(runs ?? []).length > 0 && (
        <section className="card text-sm">
          <h2 className="mb-2 font-semibold">Últimas importaciones</h2>
          <ul className="space-y-1">{runs!.map((r) => <li key={r.id}>{r.created_at.slice(0, 16).replace("T", " ")} · {r.filename} · +{r.inserted} / ~{r.updated} / ={r.skipped}</li>)}</ul>
        </section>
      )}
      <section className="card space-y-2 text-sm">
        <h2 className="font-semibold">Exportar datos</h2>
        <a className="btn-secondary" href="/api/export">Descargar tiendas (CSV)</a>
      </section>
    </div>
  );
}

async function App() {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  return (
    <div className="space-y-4">
      <ThemeSwitch />
      <AccountPanel email={data.user?.email ?? ""} />
    </div>
  );
}
