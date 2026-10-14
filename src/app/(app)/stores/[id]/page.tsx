import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Play, Store as StoreIcon } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import { loadPaymentTypes, loadSettings } from "@/lib/server/load";
import { computeObligation } from "@/lib/domain/periodicity";
import { madridDate } from "@/lib/domain/dates";
import { googleMapsPlaceUrl } from "@/lib/domain/geo";
import { brandKey, logoUrl } from "@/lib/brands";
import { StateBadge, Collapsible, EmptyState } from "@/components/ui";
import { StoreForm } from "@/components/StoreForm";
import { Contacts } from "@/components/Contacts";
import { Payments } from "@/components/Payments";
import { QuickNote } from "@/components/QuickNote";
import { FREQ_LABEL, VISIT_TYPES, type Store, type Visit } from "@/lib/types";

const dmy = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—");

export default async function StorePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();
  const { data: store } = await sb.from("stores").select("*").eq("id", id).maybeSingle();
  if (!store) notFound();
  const s = store as Store;
  const key = brandKey(s.banner);
  const [settings, types, { data: visits }, { data: contacts }, { data: concepts }, { data: records }, { data: logo }] = await Promise.all([
    loadSettings(),
    loadPaymentTypes(),
    sb.from("visits").select("*").eq("store_id", id).order("visit_date", { ascending: false }).limit(50),
    sb.from("store_contacts").select("*").eq("store_id", id).order("created_at"),
    sb.from("payment_concepts").select("*").eq("store_id", id).order("created_at"),
    sb.from("payment_records").select("*").eq("store_id", id).order("payment_date", { ascending: false }).limit(50),
    key ? sb.from("brand_logos").select("storage_path").eq("brand_key", key).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const vs = (visits ?? []) as Visit[];
  const done = vs.filter((v) => v.status === "completed").map((v) => v.visit_date);
  const ob = computeObligation(s.frequency, madridDate(), done, { trackingStart: settings.tracking_start });
  const logoSrc = logo?.storage_path ? logoUrl(logo.storage_path) : null;
  const totalPaid = (records ?? []).reduce((a, r) => a + (r.status === "abonado" ? Number(r.amount) : 0), 0);
  const eur = (n: number) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <section className="card overflow-hidden !p-0">
        <div className="flex items-center gap-4 p-4 md:p-6">
          <span className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-[3px] md:h-20 md:w-20 ${s.audit ? "ring-slate-900" : "ring-slate-200"}`}>
            {logoSrc ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={logoSrc} alt="" className="h-11 w-11 object-contain md:h-14 md:w-14" /> : <StoreIcon size={28} className="text-slate-400" />}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold leading-tight tracking-tight md:text-3xl">{s.name}</h1>
            <p className="truncate text-sm text-slate-500">{[s.banner, s.town].filter(Boolean).join(" · ")}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StateBadge state={ob.state} />
              {s.audit && <span className="badge bg-slate-900 text-[rgb(var(--on-accent))]">Audit</span>}
              <span className="badge bg-slate-100 text-slate-600">{FREQ_LABEL[s.frequency]}</span>
              {s.geocode_status === "partial" && <span className="badge bg-amber-100 text-amber-800">Ubicación aproximada</span>}
              {s.lat == null && <span className="badge bg-slate-100 text-slate-600">Sin ubicación</span>}
            </div>
          </div>
        </div>
        <dl className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100 text-center">
          <div className="p-3"><dt className="text-[11px] text-slate-500">Última visita</dt><dd className="font-semibold">{dmy(ob.lastVisit)}</dd></div>
          <div className="p-3"><dt className="text-[11px] text-slate-500">Vence</dt><dd className="font-semibold">{ob.pending > 0 ? dmy(ob.deadline) : "—"}</dd></div>
          <div className="p-3"><dt className="text-[11px] text-slate-500">Abonado</dt><dd className="font-semibold">{eur(totalPaid)}</dd></div>
        </dl>
        <div className="flex flex-wrap gap-2 border-t border-slate-100 p-3 md:p-4">
          <Link href={`/visits/new?store=${s.id}`} className="btn flex-1 sm:flex-none"><Play size={16} /> Iniciar visita</Link>
          <QuickNote storeId={s.id} current={s.notes} />
          {s.lat != null && s.lng != null && (
            <a className="btn-secondary" target="_blank" rel="noreferrer" href={googleMapsPlaceUrl({ lat: s.lat, lng: s.lng })}><MapPin size={16} /> Cómo llegar</a>
          )}
        </div>
      </section>

      {s.notes && (
        <section className="card">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Notas</h2>
          <p className="whitespace-pre-line text-sm">{s.notes}</p>
        </section>
      )}

      <Collapsible title="Contactos" hint={`${(contacts ?? []).length}`} open>
        <Contacts storeId={s.id} contacts={contacts ?? []} />
      </Collapsible>

      <Collapsible title="Historial de visitas" hint={`${vs.length}`} open>
        {vs.length === 0 ? (
          <EmptyState title="Sin visitas todavía" text="Cuando visites esta tienda, aparecerá aquí." />
        ) : (
          <ul className="-my-2 divide-y divide-slate-100 text-sm">
            {vs.map((v) => (
              <li key={v.id}>
                <Link href={`/visits/${v.id}`} className="row-link -mx-2 flex min-h-12 items-center justify-between gap-2 rounded-2xl px-2">
                  <span>{dmy(v.visit_date)} · {VISIT_TYPES[v.visit_type]}</span>
                  <span className="text-slate-500">{v.status === "completed" ? `${v.duration_minutes ?? "?"} min` : v.status === "in_progress" ? "En curso" : v.status === "planned" ? "Planificada" : "Cancelada"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Collapsible>

      <Collapsible title="Pagos y conceptos" hint={`${(concepts ?? []).length} conceptos`}>
        <Payments storeId={s.id} concepts={concepts ?? []} records={records ?? []} types={types} />
      </Collapsible>

      <Collapsible title="Datos de la tienda" hint={s.source_id ? `ID ${s.source_id}` : "creada a mano"}>
        <StoreForm key={s.notes ?? ""} store={s} />
      </Collapsible>
    </div>
  );
}
