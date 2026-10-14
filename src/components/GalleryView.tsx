"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Images, X } from "lucide-react";
import { FilterSelect } from "./FilterSelect";

export interface GalleryPhoto { id: string; url: string | null; date: string; visitId: string; storeId: string; store: string; town: string; banner: string; tagIds: string[] }
interface Tag { id: string; kind: "product" | "promo"; name: string }

const uniq = (a: string[]) => [...new Set(a.filter(Boolean))].sort((x, y) => x.localeCompare(y, "es"));

export function GalleryView({ photos, tags }: { photos: GalleryPhoto[]; tags: Tag[] }) {
  const [f, setF] = useState({ store: "", banner: "", product: "", promo: "", from: "", to: "" });
  const [open, setOpen] = useState<GalleryPhoto | null>(null);
  const tagById = new Map(tags.map((t) => [t.id, t]));
  const stores = useMemo(() => [...new Map(photos.filter((p) => p.storeId).map((p) => [p.storeId, `${p.store}${p.town ? " · " + p.town : ""}`])).entries()].sort((a, b) => a[1].localeCompare(b[1], "es")), [photos]);
  const banners = useMemo(() => uniq(photos.map((p) => p.banner)), [photos]);
  const shown = photos.filter((p) =>
    (!f.store || p.storeId === f.store) && (!f.banner || p.banner === f.banner) &&
    (!f.product || p.tagIds.includes(f.product)) && (!f.promo || p.tagIds.includes(f.promo)) &&
    (!f.from || p.date >= f.from) && (!f.to || p.date <= f.to));
  const dirty = Object.values(f).some(Boolean);

  if (photos.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-3 py-12 text-center">
        <Images size={40} className="text-slate-400" />
        <div className="font-medium">Aún no hay fotos</div>
        <p className="max-w-sm text-sm text-slate-500">Haz fotos durante una visita y etiquétalas con marca/modelo y promoción. Aquí podrás buscarlas todas juntas.</p>
        <Link href="/visits/new" className="btn">Iniciar visita</Link>
      </div>
    );
  }

  return (
    <>
      <div className="card grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <FilterSelect label="Tienda" value={f.store} onChange={(v) => setF({ ...f, store: v })} options={stores} all="Todas" />
        <FilterSelect label="Enseña" value={f.banner} onChange={(v) => setF({ ...f, banner: v })} options={banners.map((b) => [b, b])} all="Todas" />
        <FilterSelect label="Marca y modelo" value={f.product} onChange={(v) => setF({ ...f, product: v })} options={tags.filter((t) => t.kind === "product").map((t) => [t.id, t.name])} all="Todos" />
        <FilterSelect label="Promoción" value={f.promo} onChange={(v) => setF({ ...f, promo: v })} options={tags.filter((t) => t.kind === "promo").map((t) => [t.id, t.name])} all="Todas" />
        <div className="min-w-0"><label className="label" htmlFor="g-from">Desde</label><input id="g-from" type="date" className="input" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></div>
        <div className="min-w-0"><label className="label" htmlFor="g-to">Hasta</label><input id="g-to" type="date" className="input" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></div>
        <div className="col-span-2 flex items-center justify-between text-sm text-slate-500 md:col-span-3 xl:col-span-6">
          <span>{shown.length} de {photos.length} fotos</span>
          {dirty && <button className="underline" onClick={() => setF({ store: "", banner: "", product: "", promo: "", from: "", to: "" })}>Limpiar filtros</button>}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="card py-10 text-center text-sm text-slate-500">Ninguna foto coincide con estos filtros.</div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {shown.map((p) => (
            <button key={p.id} onClick={() => setOpen(p)} className="tap group relative aspect-square overflow-hidden rounded-2xl bg-slate-100 text-left">
              {p.url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.url} alt={`${p.store}, ${p.date}`} loading="lazy" decoding="async" className="h-full w-full object-cover" />}
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-[11px] leading-tight text-white">
                <b className="block truncate">{p.store}</b>
                <span className="block truncate opacity-90">{p.tagIds.map((id) => tagById.get(id)?.name).filter(Boolean).join(" · ") || p.date}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black/90 p-4 pt-[max(1rem,env(safe-area-inset-top))]" role="dialog" aria-label="Foto" onClick={() => setOpen(null)}>
          <button aria-label="Cerrar" className="self-end rounded-full bg-white/15 p-2 text-white" onClick={() => setOpen(null)}><X size={22} /></button>
          <div className="flex min-h-0 flex-1 items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {open.url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={open.url} alt={open.store} className="max-h-full max-w-full rounded-xl object-contain" />}
          </div>
          <div className="space-y-2 pt-3 text-center text-sm text-white" onClick={(e) => e.stopPropagation()}>
            <div><b>{open.store}</b> {open.town && `· ${open.town}`} · {open.date}</div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {open.tagIds.map((id) => tagById.get(id)).filter(Boolean).map((t) => <span key={t!.id} className="rounded-full bg-white/20 px-3 py-1 text-xs">{t!.name}</span>)}
            </div>
            <Link href={`/visits/${open.visitId}`} className="inline-block underline">Ver visita</Link>
          </div>
        </div>
      )}
    </>
  );
}
