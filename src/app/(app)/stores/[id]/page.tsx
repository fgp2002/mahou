import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { loadSettings } from "@/lib/server/load";
import { computeObligation } from "@/lib/domain/periodicity";
import { madridDate } from "@/lib/domain/dates";
import { googleMapsPlaceUrl } from "@/lib/domain/geo";
import { PageHeader, StateBadge } from "@/components/ui";
import { StoreForm } from "@/components/StoreForm";
import { Contacts } from "@/components/Contacts";
import { Payments } from "@/components/Payments";
import { VISIT_TYPES, type Store, type Visit } from "@/lib/types";

export default async function StorePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();
  const { data: store } = await sb.from("stores").select("*").eq("id", id).maybeSingle();
  if (!store) notFound();
  const [settings, { data: visits }, { data: contacts }, { data: concepts }, { data: records }] = await Promise.all([
    loadSettings(),
    sb.from("visits").select("*").eq("store_id", id).order("visit_date", { ascending: false }).limit(50),
    sb.from("store_contacts").select("*").eq("store_id", id).order("created_at"),
    sb.from("payment_concepts").select("*").eq("store_id", id).order("created_at"),
    sb.from("payment_records").select("*").eq("store_id", id).order("payment_date", { ascending: false }).limit(50),
  ]);
  const s = store as Store;
  const done = ((visits ?? []) as Visit[]).filter((v) => v.status === "completed").map((v) => v.visit_date);
  const ob = computeObligation(s.frequency, madridDate(), done, { trackingStart: settings.tracking_start });

  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader title={s.name}>
        <Link href={`/visits/new?store=${s.id}`} className="btn">Registrar visita</Link>
        {s.lat != null && s.lng != null && (
          <a className="btn-secondary" target="_blank" rel="noreferrer" href={googleMapsPlaceUrl({ lat: s.lat, lng: s.lng })}>Cómo llegar</a>
        )}
      </PageHeader>
      <div className="card flex flex-wrap items-center gap-3 text-sm">
        <StateBadge state={ob.state} />
        <span>Última visita: {ob.lastVisit ?? "ninguna"}</span>
        {ob.deadline && ob.pending > 0 && <span>Vence: {ob.deadline}</span>}
        <span className="text-slate-400">{s.source_id ? `ID origen ${s.source_id}` : "creada manualmente"}</span>
        {s.geocode_status === "partial" && <span className="badge bg-amber-100 text-amber-800">Ubicación aproximada: revisa lat/lng</span>}
        {s.lat == null && <span className="badge bg-slate-100 text-slate-600">Sin ubicación</span>}
      </div>
      <StoreForm store={s} />
      <Contacts storeId={s.id} contacts={contacts ?? []} />
      <Payments storeId={s.id} concepts={concepts ?? []} records={records ?? []} />
      <section className="card">
        <h2 className="mb-2 font-medium">Historial de visitas</h2>
        {(visits ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no hay visitas.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {(visits as Visit[]).map((v) => (
              <li key={v.id} className="flex justify-between py-2">
                <Link href={`/visits/${v.id}`} className="hover:underline">{v.visit_date} · {VISIT_TYPES[v.visit_type]}</Link>
                <span className="text-slate-500">{v.status === "completed" ? `${v.duration_minutes ?? "?"} min` : v.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
