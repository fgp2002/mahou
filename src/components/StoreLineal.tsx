"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { Camera, Columns2, Images, Maximize2, Trash2, X } from "lucide-react";
import { uploadPhoto, trashPhoto } from "@/lib/photos";
import { MONTHS } from "@/lib/format";
import { toast } from "./Toast";

export interface LinealPhoto { id: string; url: string | null; thumb: string | null; taken_at: string; visit_id: string | null }

const when = (iso: string) => new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(iso));

/**
 * Lineal de la tienda con histórico completo: la foto actual, todas las anteriores con su fecha y
 * comparación antes/después. Ninguna foto se borra al subir otra; quitar una la manda a la papelera.
 */
export function StoreLineal({ storeId, photos, visitId }: { storeId: string; photos: LinealPhoto[]; visitId?: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [big, setBig] = useState<LinealPhoto | null>(null);
  const [month, setMonth] = useState("");
  const [cmp, setCmp] = useState<{ a: string; b: string } | null>(null);
  const sorted = useMemo(() => [...photos].sort((x, y) => y.taken_at.localeCompare(x.taken_at)), [photos]);
  const latest = sorted[0] ?? null;
  const months = [...new Set(sorted.map((p) => p.taken_at.slice(0, 7)))];
  const shown = month ? sorted.filter((p) => p.taken_at.startsWith(month)) : sorted;
  const byId = new Map(sorted.map((p) => [p.id, p]));

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("Elige una imagen", "error");
    setBusy(true);
    try {
      const { queued } = await uploadPhoto(file, { kind: "lineal", storeId, visitId: visitId ?? null });
      toast(queued ? "Foto del lineal guardada en el móvil: se subirá al volver la red" : "Foto del lineal añadida al histórico");
      router.refresh();
    } catch (e) { toast("No se pudo subir la foto: " + (e as Error).message, "error"); }
    setBusy(false);
  }

  async function remove(p: LinealPhoto) {
    if (!confirm("¿Enviar esta foto del lineal a la papelera? Podrás recuperarla desde Ajustes → Papelera.")) return;
    const { error } = await trashPhoto(p.id);
    if (error) return toast(error.message, "error");
    toast("Foto en la papelera");
    setBig(null);
    router.refresh();
  }

  const Img = ({ p, className }: { p: LinealPhoto; className?: string }) =>
    p.url || p.thumb ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={(p.url ?? p.thumb)!} alt={`Lineal, ${when(p.taken_at)}`} className={className} /> : <div className={clsx("bg-slate-100", className)} />;
  const a = cmp ? byId.get(cmp.a) : null, b = cmp ? byId.get(cmp.b) : null;

  return (
    <div className="space-y-3">
      {latest ? (
        <button type="button" onClick={() => setBig(latest)} className="tap relative block w-full overflow-hidden rounded-xl bg-slate-100" aria-label="Ver la foto actual del lineal en grande">
          <Img p={latest} className={clsx("max-h-80 w-full object-contain", busy && "opacity-60")} />
          <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">Actual · {when(latest.taken_at)}</span>
          <span className="absolute right-2 top-2 rounded-full bg-black/55 p-1.5 text-white"><Maximize2 size={14} /></span>
        </button>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">Todavía no hay fotos del lineal de esta tienda.</p>
      )}
      {busy && <p className="text-xs text-slate-500">Subiendo…</p>}
      <div className="grid grid-cols-2 gap-2">
        <label className={clsx("btn cursor-pointer", busy && "pointer-events-none opacity-60")}><Camera size={16} /> {latest ? "Nueva foto" : "Hacer foto"}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} /></label>
        <label className={clsx("btn-secondary cursor-pointer", busy && "pointer-events-none opacity-60")}><Images size={16} /> Galería
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} /></label>
      </div>

      {sorted.length > 1 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold">Histórico ({sorted.length})</span>
            <div className="flex gap-2">
              {months.length > 1 && (
                <select className="input !min-h-9 !w-auto" aria-label="Filtrar por mes" value={month} onChange={(e) => setMonth(e.target.value)}>
                  <option value="">Todas las fechas</option>
                  {months.map((m) => <option key={m} value={m}>{MONTHS[Number(m.slice(5, 7)) - 1]} {m.slice(0, 4)}</option>)}
                </select>
              )}
              <button className="btn-secondary !min-h-9" onClick={() => setCmp(cmp ? null : { a: sorted[1].id, b: sorted[0].id })}><Columns2 size={15} /> {cmp ? "Cerrar" : "Comparar"}</button>
            </div>
          </div>
          {cmp && a && b && (
            <div className="fade-in grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-2">
              {(["a", "b"] as const).map((k) => {
                const p = k === "a" ? a : b, other = k === "a" ? b : a;
                return (
                  <div key={k} className="space-y-1">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{p.taken_at <= other.taken_at ? "Antes" : "Después"}</div>
                    <button type="button" className="block w-full overflow-hidden rounded-lg bg-slate-100" onClick={() => setBig(p)}><Img p={p} className="aspect-[3/4] w-full object-cover" /></button>
                    <select className="input !min-h-9 text-xs" value={p.id} aria-label="Elegir foto para comparar" onChange={(e) => setCmp({ ...cmp, [k]: e.target.value })}>
                      {sorted.map((x) => <option key={x.id} value={x.id}>{when(x.taken_at)}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
          )}
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {shown.map((p) => (
              <button key={p.id} type="button" onClick={() => setBig(p)} className={clsx("tap w-24 shrink-0 text-left", p.id === latest?.id && "opacity-100")}>
                <span className="block aspect-square overflow-hidden rounded-lg bg-slate-100">{(p.thumb ?? p.url) && /* eslint-disable-next-line @next/next/no-img-element */ <img src={(p.thumb ?? p.url)!} alt="" loading="lazy" className="h-full w-full object-cover" />}</span>
                <span className="mt-0.5 block truncate text-[11px] text-slate-500">{when(p.taken_at)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {big && (
        <div className="fixed inset-0 z-[90] flex flex-col bg-black/95" role="dialog" aria-label="Foto del lineal">
          <div className="flex items-center gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
            <span className="min-w-0 flex-1 truncate text-sm">{when(big.taken_at)}{big.id === latest?.id ? " · actual" : ""}</span>
            {big.visit_id && <Link href={`/visits/${big.visit_id}`} className="rounded-full bg-white/15 px-3 py-1.5 text-xs">Visita</Link>}
            <button className="rounded-full bg-white/15 p-2" aria-label="Enviar a la papelera" onClick={() => remove(big)}><Trash2 size={18} /></button>
            <button className="rounded-full bg-white/15 p-2" aria-label="Cerrar" onClick={() => setBig(null)}><X size={20} /></button>
          </div>
          <div className="flex flex-1 items-center justify-center p-2" onClick={() => setBig(null)}><Img p={big} className="max-h-full max-w-full object-contain" /></div>
        </div>
      )}
    </div>
  );
}
