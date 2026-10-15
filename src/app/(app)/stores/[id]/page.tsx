import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Play, Store as StoreIcon } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import { loadPaymentTypes, loadSettings } from "@/lib/server/load";
import { computeObligation, effectiveFrequency } from "@/lib/domain/periodicity";
import { madridDate } from "@/lib/domain/dates";
import { googleMapsPlaceUrl } from "@/lib/domain/geo";
import { brandKey, logoUrl } from "@/lib/brands";
import { StateBadge, Collapsible, EmptyState } from "@/components/ui";
import { StoreForm } from "@/components/StoreForm";
import { Contacts } from "@/components/Contacts";
import { Payments } from "@/components/Payments";
import { QuickNote } from "@/components/QuickNote";
import { StoreLineal } from "@/components/StoreLineal";
import { FREQ_LABEL, VISIT_TYPES, type Store, type Visit } from "@/lib/types";
import { eur, dmy, MONTHS_SHORT } from "@/lib/format";


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
  const ob = computeObligation(effectiveFrequency(s.frequency, s.audit), madridDate(), done, { trackingStart: settings.tracking_start });
  const logoSrc = logo?.storage_path ? logoUrl(logo.storage_path) : null;
  const totalPaid = (records ?? []).reduce((a, r) => a + (r.status === "abonado" ? Number(r.amount) : 0), 0);

  // Análisis de la tienda: visitas por mes (6 meses), elementos instalados y fotos recientes (miniaturas).
  const months: { key: string; label: string; n: number }[] = [];
  {
    const [y, m] = madridDate().split("-").map(Number);
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(y, m - 1 - i, 1));
      const key = d.toISOString().slice(0, 7);
      months.push({ key, label: MONTHS_SHORT[d.getUTCMonth()], n: done.filter((x) => x.startsWith(key)).length });
    }
  }
  const mMax = Math.max(1, ...months.map((x) => x.n));
  const installed = (concepts ?? []).filter((c) => c.status === "activo").length;
  const { data: ph } = await sb.from("visit_photos").select("id,storage_path,thumb_path,visit_id,visits!inner(store_id)").eq("visits.store_id", id).order("created_at", { ascending: false }).limit(8);
  const phPaths = (ph ?? []).map((p) => p.thumb_path ?? p.storage_path);
  const { data: phSigned } = phPaths.length ? await sb.storage.from("visit-photos").createSignedUrls(phPaths, 3600) : { data: [] };
  const linealPath = (store as { lineal_path?: string | null }).lineal_path ?? null;
  const linealAt = (store as { lineal_updated_at?: string | null }).lineal_updated_at ?? null;
  const { data: linealSigned } = linealPath ? await sb.storage.from("visit-photos").createSignedUrl(linealPath, 3600) : { data: null };
  const recentPhotos = (ph ?? []).map((p, i) => ({ id: p.id, visit: p.visit_id, url: phSigned?.[i]?.signedUrl ?? null }));

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
              {s.audit && <span className="badge bg-slate-900 text-slate-50">Audit</span>}
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

      <Collapsible title="Lineal" hint={linealAt ? "con foto" : "sin foto"} open>
        <StoreLineal storeId={id} path={linealPath} url={linealSigned?.signedUrl ?? null} updatedAt={linealAt} />
      </Collapsible>

      <Collapsible title="Análisis" hint={`${done.length} visitas`} open>
        <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="label">Visitas por mes</div>
            <div className="flex h-28 items-end gap-2">
              {months.map((x) => (
                <div key={x.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-[11px] font-semibold tabular-nums text-slate-600">{x.n || ""}</span>
                  <div className="bar-grow w-full rounded-t-md bg-brand-600" style={{ height: `${Math.max(x.n ? 8 : 2, (x.n / mMax) * 100)}%`, opacity: x.n ? 1 : 0.2 }} />
                  <span className="text-[10px] text-slate-500">{x.label}</span>
                </div>
              ))}
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg bg-slate-50 p-3"><dt className="text-[11px] text-slate-500">Cumplimiento</dt><dd className="mt-1"><StateBadge state={ob.state} /></dd></div>
            <div className="rounded-lg bg-slate-50 p-3"><dt className="text-[11px] text-slate-500">Instalados</dt><dd className="text-lg font-bold">{installed}</dd></div>
            <div className="rounded-lg bg-slate-50 p-3"><dt className="text-[11px] text-slate-500">Abonado</dt><dd className="text-lg font-bold">{eur(totalPaid)}</dd></div>
            <div className="rounded-lg bg-slate-50 p-3"><dt className="text-[11px] text-slate-500">Última visita</dt><dd className="text-lg font-bold">{dmy(ob.lastVisit)}</dd></div>
          </dl>
        </div>
        {recentPhotos.length > 0 && (
          <div className="mt-4">
            <div className="label">Fotos recientes</div>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {recentPhotos.map((p) => (
                <Link key={p.id} href={`/visits/${p.visit}`} className="block aspect-square overflow-hidden rounded-lg bg-slate-100">
                  {p.url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.url} alt="Foto de visita" loading="lazy" decoding="async" className="h-full w-full object-cover" />}
                </Link>
              ))}
            </div>
          </div>
        )}
      </Collapsible>

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
                <Link href={`/visits/${v.id}`} className="row-link -mx-2 flex min-h-12 items-center justify-between gap-2 rounded-lg px-2">
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
