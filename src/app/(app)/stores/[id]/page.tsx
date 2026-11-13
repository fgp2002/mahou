import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { MapPin, Phone, Play, Store as StoreIcon } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import { loadSettings } from "@/lib/server/load";
import { computeObligation, effectiveFrequency } from "@/lib/domain/periodicity";
import { madridDate } from "@/lib/domain/dates";
import { googleMapsPlaceUrl } from "@/lib/domain/geo";
import { brandKey, logoUrl } from "@/lib/brands";
import { StateBadge, EmptyState } from "@/components/ui";
import { StoreForm } from "@/components/StoreForm";
import { Contacts } from "@/components/Contacts";
import { QuickNote } from "@/components/QuickNote";
import { StoreLineal, type LinealPhoto } from "@/components/StoreLineal";
import { StorePhotos, type StorePhoto } from "@/components/StorePhotos";
import { EquipmentPanel } from "@/components/EquipmentPanel";
import { StoreEconomy } from "@/components/StoreEconomy";
import { IncidentList } from "@/components/IncidentList";
import { Timeline } from "@/components/Timeline";
import { StoreHours, type StoreHoursValues } from "@/components/StoreHours";
import { loadStoreEquipment } from "@/lib/server/equipment";
import { loadAgreements, loadCatalog } from "@/lib/server/economy";
import { loadStoreTimeline } from "@/lib/server/timeline";
import { isPresent } from "@/lib/equipment";
import { INCIDENT_COLS, isOpen, type Incident } from "@/lib/incidents";
import { daysToEnd, totals } from "@/lib/economy";
import { PAYMENT_COLS, type PaymentRow } from "@/lib/payments";
import { FREQ_LABEL, VISIT_TYPES, type Store, type Visit } from "@/lib/types";
import { eur, dmy, MONTHS_SHORT } from "@/lib/format";

const TABS = [
  ["resumen", "Resumen"], ["visitas", "Visitas"], ["inventario", "Inventario"], ["pagos", "Pagos y acuerdos"],
  ["fotos", "Fotos"], ["contactos", "Contactos"], ["incidencias", "Incidencias"], ["historico", "Histórico"],
] as const;
type Tab = (typeof TABS)[number][0];
type FullStore = Store & StoreHoursValues & { updated_at?: string };

async function signed(paths: string[]) {
  if (!paths.length) return new Map<string, string>();
  const sb = await supabaseServer();
  const { data } = await sb.storage.from("visit-photos").createSignedUrls(paths, 3600);
  return new Map((data ?? []).map((x) => [x.path ?? "", x.signedUrl]));
}

export default async function StorePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = (TABS.find(([k]) => k === sp.tab)?.[0]) ?? "resumen";
  const sb = await supabaseServer();
  const { data: store } = await sb.from("stores").select("*").eq("id", id).maybeSingle();
  if (!store) notFound();
  const s = store as FullStore;
  const today = madridDate();
  const key = brandKey(s.banner);

  const [settings, { types, categories }, equipment, { data: visits }, { data: contacts }, { data: logo }, { data: incRows }, agreements] = await Promise.all([
    loadSettings(),
    loadCatalog(),
    loadStoreEquipment(id),
    sb.from("visits").select("*").eq("store_id", id).order("visit_date", { ascending: false }).limit(100),
    sb.from("store_contacts").select("*").eq("store_id", id).order("created_at"),
    key ? sb.from("brand_logos").select("storage_path").eq("brand_key", key).maybeSingle() : Promise.resolve({ data: null }),
    sb.from("incidents").select(INCIDENT_COLS).eq("store_id", id).is("deleted_at", null).order("opened_on", { ascending: false }),
    loadAgreements(id),
  ]);
  const vs = (visits ?? []) as Visit[];
  const incidents = (incRows ?? []) as Incident[];
  const done = vs.filter((v) => v.status === "completed").map((v) => v.visit_date);
  const ob = computeObligation(effectiveFrequency(s.frequency, s.audit), today, done, { trackingStart: settings.tracking_start });
  const logoSrc = logo?.storage_path ? logoUrl(logo.storage_path) : null;
  const installed = equipment.filter((e) => isPresent(e.status)).reduce((n, e) => n + e.quantity, 0);
  const openInc = incidents.filter((i) => isOpen(i.status));
  const nextPlanned = [...vs].filter((v) => v.status === "planned" && v.visit_date >= today).sort((a, b) => a.visit_date.localeCompare(b.visit_date))[0];
  const manager = (contacts ?? []).find((c) => c.role === "Encargado" && c.phone) ?? (contacts ?? []).find((c) => c.phone);
  // Próximo vencimiento relevante: la visita obligatoria o el fin de un acuerdo vigente, lo que llegue antes.
  const dues: { date: string; label: string }[] = [];
  if (ob.pending > 0 && ob.deadline) dues.push({ date: ob.deadline, label: "Vence la visita" });
  for (const a of agreements) if ((a.status === "en_ejecucion" || a.status === "aprobado") && a.end_date && (daysToEnd(a.end_date, today) ?? -1) >= 0) dues.push({ date: a.end_date, label: "Fin de acuerdo" });
  const nextDue = dues.sort((a, b) => a.date.localeCompare(b.date))[0];

  const tabHref = (k: Tab) => `/stores/${id}?tab=${k}`;
  const counts: Partial<Record<Tab, number>> = { visitas: done.length, inventario: installed, incidencias: openInc.length, contactos: (contacts ?? []).length };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <section className="card overflow-hidden !p-0">
        <div className="flex items-center gap-4 p-4 md:p-6">
          <span className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-[3px] md:h-20 md:w-20 ${s.audit ? "ring-slate-900" : "ring-slate-200"}`}>
            {logoSrc ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={logoSrc} alt="" className="h-11 w-11 object-contain md:h-14 md:w-14" /> : <StoreIcon size={28} className="text-slate-400" />}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold leading-tight tracking-tight md:text-3xl">{s.name}</h1>
            <p className="truncate text-sm text-slate-500">{[s.chain && s.chain !== s.banner ? `${s.banner ?? ""} · ${s.chain}` : s.banner, s.town].filter(Boolean).join(" · ")}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StateBadge state={ob.state} />
              {s.audit && <span className="badge bg-slate-900 text-slate-50">Audit</span>}
              <span className="badge bg-slate-100 text-slate-600">{FREQ_LABEL[s.frequency]}</span>
              {openInc.length > 0 && <Link href={tabHref("incidencias")} scroll={false} className="badge bg-st-late font-semibold text-[#fff]">{openInc.length} incidencia{openInc.length === 1 ? "" : "s"}</Link>}
              {s.lat == null && <span className="badge bg-slate-100 text-slate-600">Sin ubicación</span>}
            </div>
          </div>
        </div>
        <dl className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100 text-center">
          <div className="p-3"><dt className="text-[11px] text-slate-500">Última visita</dt><dd className="font-semibold">{dmy(ob.lastVisit)}</dd></div>
          <div className="p-3"><dt className="text-[11px] text-slate-500">Próxima visita</dt><dd className="font-semibold">{nextPlanned ? dmy(nextPlanned.visit_date) : "—"}</dd></div>
          <div className="p-3"><dt className="text-[11px] text-slate-500">{nextDue?.label ?? "Vencimiento"}</dt><dd className={clsx("font-semibold", nextDue && nextDue.date <= today && "text-[rgb(var(--st-late))]")}>{nextDue ? dmy(nextDue.date) : "—"}</dd></div>
        </dl>
        <div className="grid grid-cols-3 gap-2 border-t border-slate-100 p-3 md:flex md:p-4">
          <Link href={`/visits/new?store=${s.id}`} className="btn md:flex-none"><Play size={16} /> Visita</Link>
          {s.lat != null && s.lng != null ? <a className="btn-secondary" target="_blank" rel="noreferrer" href={googleMapsPlaceUrl({ lat: s.lat, lng: s.lng })}><MapPin size={16} /> Navegar</a> : <span className="btn-secondary pointer-events-none opacity-40"><MapPin size={16} /> Navegar</span>}
          {manager?.phone ? <a className="btn-secondary" href={`tel:${manager.phone.replace(/\s/g, "")}`} title={`Llamar a ${manager.full_name ?? manager.role ?? "contacto"}`}><Phone size={16} /> Llamar</a> : <Link className="btn-secondary" href={tabHref("contactos")} scroll={false}><Phone size={16} /> Llamar</Link>}
        </div>
      </section>

      <nav className="h-scroll -mx-4 flex gap-1.5 px-4 pb-1 md:mx-0 md:px-0" aria-label="Secciones de la tienda">
        {TABS.map(([k, l]) => (
          <Link key={k} href={tabHref(k)} scroll={false} aria-current={tab === k ? "page" : undefined}
            className={clsx("tap flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm", tab === k ? "border-slate-900 bg-slate-900 font-semibold text-slate-50" : "border-slate-200 bg-white text-slate-600")}>
            {l}{counts[k] ? <span className={clsx("rounded-full px-1.5 text-[11px] tabular-nums", tab === k ? "bg-white/20" : k === "incidencias" ? "bg-st-late text-[#fff]" : "bg-slate-100")}>{counts[k]}</span> : null}
          </Link>
        ))}
      </nav>

      {tab === "resumen" && <Resumen store={s} visits={vs} done={done} ob={ob} installed={installed} openInc={openInc} today={today} />}
      {tab === "visitas" && (
        <section className="card">
          {vs.length === 0 ? <EmptyState title="Sin visitas todavía" text="Cuando visites esta tienda, aparecerá aquí." /> : (
            <ul className="-my-2 divide-y divide-slate-100 text-sm">
              {vs.map((v) => (
                <li key={v.id}><Link href={`/visits/${v.id}`} className="row-link -mx-2 flex min-h-12 items-center justify-between gap-2 rounded-lg px-2">
                  <span>{dmy(v.visit_date)} · {VISIT_TYPES[v.visit_type]}</span>
                  <span className="text-slate-500">{v.status === "completed" ? `${v.duration_minutes ?? "?"} min` : v.status === "in_progress" ? "En curso" : v.status === "planned" ? "Planificada" : "Cancelada"}</span>
                </Link></li>
              ))}
            </ul>
          )}
        </section>
      )}
      {tab === "inventario" && <section className="card"><EquipmentPanel storeId={s.id} items={equipment} types={types} initialOpen={sp.eq} /></section>}
      {tab === "pagos" && <Pagos store={s} types={types} categories={categories} equipment={equipment} agreements={agreements} initialPay={sp.pay} initialAg={sp.ag} />}
      {tab === "fotos" && <Fotos storeId={s.id} />}
      {tab === "contactos" && <section className="card"><Contacts storeId={s.id} contacts={contacts ?? []} /></section>}
      {tab === "incidencias" && <section className="card"><IncidentList incidents={incidents} storeId={s.id} equipment={equipment} types={types} initialOpen={sp.inc} /></section>}
      {tab === "historico" && <Historico storeId={s.id} />}
    </div>
  );
}

async function Resumen({ store: s, visits, done, ob, installed, openInc, today }: {
  store: FullStore; visits: Visit[]; done: string[]; ob: ReturnType<typeof computeObligation>; installed: number; openInc: Incident[]; today: string;
}) {
  const sb = await supabaseServer();
  const [{ data: pays }, { data: lin }, recent] = await Promise.all([
    sb.from("payment_records").select("amount,status,settlement,payment_date,quantity,unit").eq("store_id", s.id).is("deleted_at", null).gte("payment_date", `${today.slice(0, 4)}-01-01`),
    sb.from("visit_photos").select("id,storage_path,thumb_path,taken_at").eq("store_id", s.id).eq("kind", "lineal").is("deleted_at", null).order("taken_at", { ascending: false }).limit(1),
    loadStoreTimeline(s.id, 6),
  ]);
  const t = totals((pays ?? []).map((p) => ({ ...p, amount: Number(p.amount) })) as Parameters<typeof totals>[0]);
  const months: { key: string; label: string; n: number }[] = [];
  const [y, m] = today.split("-").map(Number);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const key = d.toISOString().slice(0, 7);
    months.push({ key, label: MONTHS_SHORT[d.getUTCMonth()], n: done.filter((x) => x.startsWith(key)).length });
  }
  const mMax = Math.max(1, ...months.map((x) => x.n));
  const l = lin?.[0];
  const urls = await signed(l ? [l.thumb_path ?? l.storage_path] : []);
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="card !p-3 text-center"><div className="text-[11px] text-slate-500">Cumplimiento</div><div className="mt-1"><StateBadge state={ob.state} /></div></div>
        <Link href={`/stores/${s.id}?tab=inventario`} scroll={false} className="card tap !p-3 text-center"><div className="text-[11px] text-slate-500">Elementos instalados</div><div className="text-xl font-bold">{installed}</div></Link>
        <Link href={`/stores/${s.id}?tab=pagos`} scroll={false} className="card tap !p-3 text-center"><div className="text-[11px] text-slate-500">Invertido este año</div><div className="text-xl font-bold tabular-nums">{eur(t.executed)}</div></Link>
        <Link href={`/stores/${s.id}?tab=incidencias`} scroll={false} className="card tap !p-3 text-center"><div className="text-[11px] text-slate-500">Incidencias abiertas</div><div className={clsx("text-xl font-bold", openInc.length > 0 && "text-[rgb(var(--st-late))]")}>{openInc.length}</div></Link>
      </section>
      {s.notes && <section className="card"><h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Notas</h2><p className="whitespace-pre-line text-sm">{s.notes}</p></section>}
      <div className="grid gap-4 md:grid-cols-2">
        <section className="card">
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
          <p className="mt-2 text-xs text-slate-500">{visits.filter((v) => v.status === "completed").length} visitas registradas · {FREQ_LABEL[s.frequency]}{s.audit ? " · Audit" : ""}</p>
        </section>
        <Link href={`/stores/${s.id}?tab=fotos`} scroll={false} className="card tap block">
          <div className="label">Lineal</div>
          {l ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={urls.get(l.thumb_path ?? l.storage_path) ?? ""} alt="Último lineal" className="h-28 w-full rounded-lg object-cover" /> : <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-slate-300 text-sm text-slate-500">Sin foto del lineal</div>}
          {l && <p className="mt-2 text-xs text-slate-500">Actualizado el {dmy(l.taken_at.slice(0, 10))}</p>}
        </Link>
      </div>
      <section className="card">
        <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Últimas actuaciones</h2><Link href={`/stores/${s.id}?tab=historico`} scroll={false} className="text-sm font-semibold text-brand-600">Ver todo</Link></div>
        <Timeline items={recent} />
      </section>
      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Datos de la tienda</h2><QuickNote storeId={s.id} current={s.notes} /></div>
        <StoreHours store={s} />
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-slate-600">Editar datos{s.source_id ? ` (ID ${s.source_id})` : ""}</summary>
          <div className="mt-3"><StoreForm key={s.notes ?? ""} store={s} /></div>
        </details>
      </section>
    </div>
  );
}

async function Pagos({ store, types, categories, equipment, agreements, initialPay, initialAg }: {
  store: Store; types: Awaited<ReturnType<typeof loadCatalog>>["types"]; categories: Awaited<ReturnType<typeof loadCatalog>>["categories"];
  equipment: Awaited<ReturnType<typeof loadStoreEquipment>>; agreements: Awaited<ReturnType<typeof loadAgreements>>; initialPay?: string; initialAg?: string;
}) {
  const sb = await supabaseServer();
  const { data } = await sb.from("payment_records").select(PAYMENT_COLS).eq("store_id", store.id).is("deleted_at", null).order("payment_date", { ascending: false }).limit(300);
  return (
    <section className="card">
      <StoreEconomy store={{ id: store.id, name: store.name, town: store.town }} payments={(data ?? []) as PaymentRow[]} agreements={agreements} types={types} categories={categories} equipment={equipment} initialPay={initialPay} initialAg={initialAg} />
    </section>
  );
}

async function Fotos({ storeId }: { storeId: string }) {
  const sb = await supabaseServer();
  const { data } = await sb.from("visit_photos").select("id,kind,storage_path,thumb_path,taken_at,visit_id").eq("store_id", storeId).is("deleted_at", null).order("taken_at", { ascending: false }).limit(400);
  const rows = (data ?? []) as { id: string; kind: StorePhoto["kind"]; storage_path: string; thumb_path: string | null; taken_at: string; visit_id: string | null }[];
  const lineal = rows.filter((r) => r.kind === "lineal");
  const urls = await signed([...new Set([...lineal.map((r) => r.storage_path), ...rows.map((r) => r.thumb_path ?? r.storage_path)])]);
  const L: LinealPhoto[] = lineal.map((r) => ({ id: r.id, url: urls.get(r.storage_path) ?? null, thumb: r.thumb_path ? urls.get(r.thumb_path) ?? null : null, taken_at: r.taken_at, visit_id: r.visit_id }));
  const all: StorePhoto[] = rows.map((r) => ({ id: r.id, kind: r.kind, url: null, thumb: urls.get(r.thumb_path ?? r.storage_path) ?? null, taken_at: r.taken_at, visit_id: r.visit_id }));
  return (
    <div className="space-y-4">
      <section className="card space-y-3"><h2 className="font-semibold">Lineal</h2><StoreLineal storeId={storeId} photos={L} /></section>
      <section className="card space-y-3"><h2 className="font-semibold">Todas las fotos</h2><StorePhotos photos={all} /></section>
    </div>
  );
}

async function Historico({ storeId }: { storeId: string }) {
  const items = await loadStoreTimeline(storeId);
  return <section className="card"><Timeline items={items} /></section>;
}
