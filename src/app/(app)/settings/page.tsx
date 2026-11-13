import Link from "next/link";
import clsx from "clsx";
import { supabaseServer } from "@/lib/supabase/server";
import { ProductsManager, type Product } from "@/components/ProductsManager";
import { ThemeSwitch, AccountPanel } from "@/components/AppSettings";
import { BrandsManager } from "@/components/BrandsManager";
import { PageHeader } from "@/components/ui";
import { ImportPanel } from "@/components/ImportPanel";
import { GeocodePanel } from "@/components/GeocodePanel";
import { LogosManager, type BrandRow } from "@/components/LogosManager";
import { brandKey, logoUrl } from "@/lib/brands";
import { PaymentTypesManager } from "@/components/PaymentTypesManager";
import { loadCatalog } from "@/lib/server/economy";
import { SettingsForm, type SettingsValues } from "@/components/SettingsForm";
import { DEFAULT_DURATIONS } from "@/lib/types";
import { madridDate } from "@/lib/domain/dates";
import { ChecklistEditor } from "@/components/ChecklistEditor";
import { TrashBin, type TrashItem } from "@/components/TrashBin";
import { INCIDENT_TYPE_LABEL, type IncidentType } from "@/lib/incidents";
import { eur, dmy } from "@/lib/format";

const TABS = [["jornada", "Jornada"], ["catalogo", "Catálogo"], ["papelera", "Papelera"], ["app", "App y cuenta"]] as const;
const SUBS = [["ensenas", "Enseñas"], ["productos", "Productos"], ["pagos", "Conceptos"], ["marcas", "Marcas"], ["datos", "Datos"]] as const;
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
          {sub === "marcas" && <Marcas />}
          {sub === "datos" && <Datos />}
        </div>
      )}
      {tab === "papelera" && <Papelera />}
      {tab === "app" && <App />}
    </div>
  );
}

async function Jornada() {
  const sb = await supabaseServer();
  const { data: s } = await sb.from("user_settings").select("*").maybeSingle();
  const pp = (s?.planning_prefs ?? {}) as { audit_first?: boolean; max_stops_per_day?: number | null; holidays?: string[]; work_days?: number[]; default_visit_minutes?: number; lunch?: { enabled?: boolean; from?: string; to?: string; minutes?: number } };
  const initial: SettingsValues = {
    owner_id: s?.owner_id ?? "",
    work_start: (s?.work_start ?? "08:00").slice(0, 5), work_end: (s?.work_end ?? "18:00").slice(0, 5), route_start: (s?.route_start ?? "09:00").slice(0, 5),
    transport: s?.transport ?? "driving", tracking_start: s?.tracking_start ?? madridDate(),
    visit_durations: { ...DEFAULT_DURATIONS, ...(s?.visit_durations ?? {}) },
    holidays: (pp.holidays ?? []).join(", "), work_days: pp.work_days ?? [0, 1, 2, 3, 4], max_stops: pp.max_stops_per_day ? String(pp.max_stops_per_day) : "", audit_first: pp.audit_first ?? true,
    home_address: s?.home_address ?? "", home_located: s?.home_lat != null, default_minutes: String(pp.default_visit_minutes ?? 45),
    lunch_enabled: pp.lunch?.enabled ?? true, lunch_from: pp.lunch?.from ?? "13:30", lunch_to: pp.lunch?.to ?? "16:00", lunch_minutes: String(pp.lunch?.minutes ?? 60),
  };
  const checklist = Array.isArray(s?.checklist) ? (s!.checklist as string[]) : [];
  return (
    <div className="space-y-4">
      <SettingsForm initial={initial} />
      {s?.owner_id && <ChecklistEditor ownerId={s.owner_id} items={checklist} />}
    </div>
  );
}

async function Papelera() {
  const sb = await supabaseServer();
  const [{ data: ph }, { data: eq }, { data: pr }, { data: ag }, { data: inc }, { data: stores }] = await Promise.all([
    sb.from("visit_photos").select("id,kind,storage_path,thumb_path,taken_at,deleted_at,store_id").not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(200),
    sb.from("store_equipment").select("id,code,name,brand_name,deleted_at,store_id,payment_types(name)").not("deleted_at", "is", null).limit(200),
    sb.from("payment_records").select("id,concept_name,concept,amount,payment_date,deleted_at,store_id").not("deleted_at", "is", null).limit(200),
    sb.from("agreements").select("id,title,amount,start_date,deleted_at,store_id,payment_types(name)").not("deleted_at", "is", null).limit(200),
    sb.from("incidents").select("id,type,description,opened_on,deleted_at,store_id").not("deleted_at", "is", null).limit(200),
    sb.from("stores").select("id,name").limit(5000),
  ]);
  const sn = new Map((stores ?? []).map((x) => [x.id, x.name]));
  const thumbs = (ph ?? []).map((p) => p.thumb_path ?? p.storage_path);
  const { data: signed } = thumbs.length ? await sb.storage.from("visit-photos").createSignedUrls(thumbs, 3600) : { data: [] };
  const url = new Map((signed ?? []).map((x) => [x.path ?? "", x.signedUrl]));
  const tn = (x: unknown) => (x as { name: string } | null)?.name ?? "";
  const items: TrashItem[] = [
    ...(ph ?? []).map((p) => ({ table: "visit_photos" as const, id: p.id, title: `Foto ${p.kind === "lineal" ? "del lineal" : p.kind === "elemento" ? "de elemento" : p.kind === "incidencia" ? "de incidencia" : "de visita"}`, detail: `${sn.get(p.store_id) ?? ""} · ${dmy(p.taken_at.slice(0, 10))}`, deleted_at: p.deleted_at!, thumb: url.get(p.thumb_path ?? p.storage_path) ?? null, paths: [p.storage_path, p.thumb_path].filter(Boolean) as string[] })),
    ...(eq ?? []).map((e) => ({ table: "store_equipment" as const, id: e.id, title: `${e.name || tn(e.payment_types)}${e.brand_name ? ` · ${e.brand_name}` : ""} (${e.code})`, detail: sn.get(e.store_id) ?? "", deleted_at: e.deleted_at! })),
    ...(pr ?? []).map((p) => ({ table: "payment_records" as const, id: p.id, title: `${p.concept_name ?? p.concept} · ${eur(Number(p.amount))}`, detail: `${sn.get(p.store_id) ?? ""} · ${dmy(p.payment_date)}`, deleted_at: p.deleted_at! })),
    ...(ag ?? []).map((a) => ({ table: "agreements" as const, id: a.id, title: `${a.title || tn(a.payment_types)} · ${eur(Number(a.amount))}`, detail: `${sn.get(a.store_id) ?? ""} · desde ${dmy(a.start_date)}`, deleted_at: a.deleted_at! })),
    ...(inc ?? []).map((i) => ({ table: "incidents" as const, id: i.id, title: INCIDENT_TYPE_LABEL[i.type as IncidentType] ?? "Incidencia", detail: `${sn.get(i.store_id) ?? ""} · ${dmy(i.opened_on)}${i.description ? ` · ${i.description}` : ""}`, deleted_at: i.deleted_at! })),
  ];
  return <TrashBin items={items} />;
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
  const { types, categories } = await loadCatalog();
  const [{ data: uc }, { data: ur }] = await Promise.all([sb.from("store_equipment").select("type_id"), sb.from("payment_records").select("payment_type_id")]);
  const usage: Record<string, number> = {};
  for (const r of [...(uc ?? []).map((x) => ({ payment_type_id: x.type_id as string | null })), ...(ur ?? [])]) if (r.payment_type_id) usage[r.payment_type_id] = (usage[r.payment_type_id] ?? 0) + 1;
  return <PaymentTypesManager types={types} usage={usage} categories={categories} />;
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
          <h2 className="t-section mb-2">Últimas importaciones</h2>
          <ul className="space-y-1">{runs!.map((r) => <li key={r.id}>{r.created_at.slice(0, 16).replace("T", " ")} · {r.filename} · +{r.inserted} / ~{r.updated} / ={r.skipped}</li>)}</ul>
        </section>
      )}
      <section className="card space-y-2 text-sm">
        <h2 className="t-section">Exportar datos</h2>
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

async function Marcas() {
  const sb = await supabaseServer();
  const [{ data: brands }, { data: uc }, { data: ur }] = await Promise.all([
    sb.from("payment_brands").select("id,name,logo_path").order("name"),
    sb.from("store_equipment").select("brand_id").not("brand_id", "is", null).limit(5000),
    sb.from("payment_records").select("brand_id").not("brand_id", "is", null).limit(10000),
  ]);
  const uses = new Map<string, number>();
  for (const r of [...(uc ?? []), ...(ur ?? [])]) if (r.brand_id) uses.set(r.brand_id, (uses.get(r.brand_id) ?? 0) + 1);
  return <BrandsManager brands={(brands ?? []).map((b) => ({ id: b.id, name: b.name, logo_path: b.logo_path, uses: uses.get(b.id) ?? 0 }))} />;
}
