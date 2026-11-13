import { PageHeader, EmptyState } from "@/components/ui";
import { FilterBar } from "@/components/FilterBar";
import { IncidentList } from "@/components/IncidentList";
import { supabaseServer } from "@/lib/supabase/server";
import { loadStoresLite } from "@/lib/server/economy";
import { INCIDENT_COLS, INCIDENT_STATUS_LABEL, INCIDENT_TYPE_LABEL, isOpen, PRIORITY_LABEL, type Incident, type IncidentStatus, type IncidentType, type Priority } from "@/lib/incidents";

export const metadata = { title: "Incidencias · Mahou" };

export default async function IncidentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const many = (k: string) => { const v = raw[k]; return (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean); };
  const q = String(Array.isArray(raw.q) ? raw.q[0] : raw.q ?? "").toLowerCase();
  const sb = await supabaseServer();
  const [{ data }, stores] = await Promise.all([sb.from("incidents").select(INCIDENT_COLS).is("deleted_at", null).order("opened_on", { ascending: false }).limit(1000), loadStoresLite()]);
  const storeById = new Map(stores.map((s) => [s.id, s]));
  const all = (data ?? []) as Incident[];
  const f = { status: many("status"), type: many("type"), priority: many("priority"), banner: many("banner") };
  const rows = all.filter((i) => {
    const s = storeById.get(i.store_id);
    return (!f.status.length ? isOpen(i.status) || !!q : f.status.includes(i.status)) && (!f.type.length || f.type.includes(i.type)) && (!f.priority.length || f.priority.includes(i.priority)) &&
      (!f.banner.length || f.banner.includes(s?.banner ?? "")) && (!q || `${s?.name ?? ""} ${s?.town ?? ""} ${i.description ?? ""} ${INCIDENT_TYPE_LABEL[i.type]}`.toLowerCase().includes(q));
  });
  const open = all.filter((i) => isOpen(i.status));
  const banners = [...new Set(stores.map((s) => s.banner).filter(Boolean))].sort() as string[];
  return (
    <div className="space-y-5">
      <PageHeader title="Incidencias" count={open.length} />
      <FilterBar search="Buscar tienda o descripción…" filters={[
        { name: "status", label: "Estado", options: (Object.keys(INCIDENT_STATUS_LABEL) as IncidentStatus[]).map((s) => [s, INCIDENT_STATUS_LABEL[s]]), all: "Abiertas y en seguimiento" },
        { name: "type", label: "Tipo", options: (Object.keys(INCIDENT_TYPE_LABEL) as IncidentType[]).map((s) => [s, INCIDENT_TYPE_LABEL[s]]) },
        { name: "priority", label: "Prioridad", options: (Object.keys(PRIORITY_LABEL) as Priority[]).map((s) => [s, PRIORITY_LABEL[s]]), all: "Todas" },
        { name: "banner", label: "Enseña", options: banners.map((b) => [b, b]), all: "Todas" },
      ]} />
      {rows.length === 0 ? <div className="card"><EmptyState title="Sin incidencias" text="Las incidencias se registran desde la visita o la ficha de cada tienda." /></div> : (
        <IncidentList incidents={rows} storeNames={Object.fromEntries(stores.map((s) => [s.id, s.name]))} allowNew={false} />
      )}
    </div>
  );
}
