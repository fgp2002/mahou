"use client";
import { ScrollLock } from "@/lib/useScrollLock";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2, X } from "lucide-react";
import { trashPhoto } from "@/lib/photos";
import { MONTHS, dmy } from "@/lib/format";
import { toast } from "./Toast";

export interface StorePhoto { id: string; kind: "visita" | "lineal" | "elemento" | "incidencia"; url: string | null; thumb: string | null; taken_at: string; visit_id: string | null }
const KIND: Record<StorePhoto["kind"], string> = { visita: "Visitas", lineal: "Lineal", elemento: "Elementos", incidencia: "Incidencias" };

/** Todas las fotos de la tienda con filtro por tipo y por mes. Quitar una la manda a la papelera. */
export function StorePhotos({ photos }: { photos: StorePhoto[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<string>("");
  const [month, setMonth] = useState("");
  const [big, setBig] = useState<StorePhoto | null>(null);
  const months = useMemo(() => [...new Set(photos.map((p) => p.taken_at.slice(0, 7)))], [photos]);
  const kinds = useMemo(() => [...new Set(photos.map((p) => p.kind))], [photos]);
  const shown = photos.filter((p) => (!kind || p.kind === kind) && (!month || p.taken_at.startsWith(month)));
  if (!photos.length) return <p className="text-sm text-slate-500">Sin fotos todavía.</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select className="input !min-h-9 !w-auto" aria-label="Tipo de foto" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Todas ({photos.length})</option>
          {kinds.map((k) => <option key={k} value={k}>{KIND[k]} ({photos.filter((p) => p.kind === k).length})</option>)}
        </select>
        {months.length > 1 && (
          <select className="input !min-h-9 !w-auto" aria-label="Mes" value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">Todas las fechas</option>
            {months.map((m) => <option key={m} value={m}>{MONTHS[Number(m.slice(5, 7)) - 1]} {m.slice(0, 4)}</option>)}
          </select>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {shown.map((p) => (
          <button key={p.id} type="button" onClick={() => setBig(p)} className="tap text-left">
            <span className="block aspect-square overflow-hidden rounded-lg bg-slate-100">{(p.thumb ?? p.url) && /* eslint-disable-next-line @next/next/no-img-element */ <img src={(p.thumb ?? p.url)!} alt="" loading="lazy" className="h-full w-full object-cover" />}</span>
            <span className="mt-0.5 block truncate text-[11px] text-slate-500">{dmy(p.taken_at.slice(0, 10))} · {KIND[p.kind].toLowerCase()}</span>
          </button>
        ))}
      </div>
      {big && (
        <div className="fixed inset-0 z-[90] flex flex-col bg-black/95" role="dialog" aria-label="Foto">
          <ScrollLock />
          <div className="flex items-center gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-[#fff]">
            <span className="min-w-0 flex-1 truncate text-sm">{dmy(big.taken_at.slice(0, 10))} · {KIND[big.kind]}</span>
            {big.visit_id && <Link href={`/visits/${big.visit_id}`} className="rounded-full bg-[#fff]/15 px-3 py-1.5 text-xs">Visita</Link>}
            <button className="rounded-full bg-[#fff]/15 p-2" aria-label="Enviar a la papelera" onClick={async () => { if (!confirm("¿Enviar la foto a la papelera?")) return; const { error } = await trashPhoto(big.id); if (error) return toast(error.message, "error"); toast("Foto en la papelera"); setBig(null); router.refresh(); }}><Trash2 size={18} /></button>
            <button className="rounded-full bg-[#fff]/15 p-2" aria-label="Cerrar" onClick={() => setBig(null)}><X size={20} /></button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <div className="flex flex-1 items-center justify-center p-2" onClick={() => setBig(null)}>{(big.url ?? big.thumb) && <img src={(big.url ?? big.thumb)!} alt="" className="max-h-full max-w-full object-contain" />}</div>
        </div>
      )}
    </div>
  );
}
