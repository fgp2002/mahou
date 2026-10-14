import { supabaseServer } from "@/lib/supabase/server";
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

export default async function SettingsPage() {
  const sb = await supabaseServer();
  const [{ data: s }, pend, fail, { data: runs }] = await Promise.all([
    sb.from("user_settings").select("*").maybeSingle(),
    sb.from("stores").select("id", { count: "exact", head: true }).eq("geocode_status", "pending").is("lat", null),
    sb.from("stores").select("id", { count: "exact", head: true }).eq("geocode_status", "failed"),
    sb.from("import_runs").select("*").order("created_at", { ascending: false }).limit(5),
  ]);
  const types = await loadPaymentTypes();
  const [{ data: uc }, { data: ur }] = await Promise.all([sb.from("payment_concepts").select("payment_type_id"), sb.from("payment_records").select("payment_type_id")]);
  const usage: Record<string, number> = {};
  for (const r of [...(uc ?? []), ...(ur ?? [])]) if (r.payment_type_id) usage[r.payment_type_id] = (usage[r.payment_type_id] ?? 0) + 1;
  const [{ data: bs }, { data: bl }] = await Promise.all([sb.from("stores").select("banner").eq("active", true), sb.from("brand_logos").select("brand_key,storage_path,source")]);
  const logoMap = new Map((bl ?? []).map((l) => [l.brand_key, l]));
  const counts = new Map<string, number>();
  for (const r of bs ?? []) { const k = brandKey(r.banner); if (k) counts.set(k, (counts.get(k) ?? 0) + 1); }
  const brands: BrandRow[] = [...counts].sort((a, b) => b[1] - a[1]).map(([key, stores]) => {
    const l = logoMap.get(key);
    return { key, stores, path: l?.storage_path ?? null, url: l ? logoUrl(l.storage_path) : null, source: l?.source ?? null };
  });
  const pp = (s?.planning_prefs ?? {}) as { audit_first?: boolean; max_stops_per_day?: number | null; holidays?: string[]; work_days?: number[] };
  const initial: SettingsValues = {
    owner_id: s?.owner_id ?? "",
    work_start: (s?.work_start ?? "08:00").slice(0, 5), work_end: (s?.work_end ?? "18:00").slice(0, 5), route_start: (s?.route_start ?? "09:00").slice(0, 5),
    transport: s?.transport ?? "driving", tracking_start: s?.tracking_start ?? madridDate(),
    visit_durations: { ...DEFAULT_DURATIONS, ...(s?.visit_durations ?? {}) },
    holidays: (pp.holidays ?? []).join(", "), work_days: pp.work_days ?? [0, 1, 2, 3, 4], max_stops: pp.max_stops_per_day ? String(pp.max_stops_per_day) : "", audit_first: pp.audit_first ?? true,
  };
  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title="Ajustes" />
      <SettingsForm initial={initial} />
      <PaymentTypesManager types={types} usage={usage} />
      <LogosManager brands={brands} />
      <GeocodePanel pending={pend.count ?? 0} failed={fail.count ?? 0} />
      <ImportPanel />
      {(runs ?? []).length > 0 && (
        <section className="card text-sm">
          <h2 className="mb-2 font-medium">Últimas importaciones</h2>
          <ul>{runs!.map((r) => <li key={r.id}>{r.created_at.slice(0, 16).replace("T", " ")} · {r.filename} · +{r.inserted} / ~{r.updated} / ={r.skipped}</li>)}</ul>
        </section>
      )}
      <section className="card text-sm">
        <h2 className="mb-2 font-medium">Exportar datos</h2>
        <a className="btn-secondary" href="/api/export">Descargar tiendas (CSV)</a>
      </section>
    </div>
  );
}
