"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { dmy } from "@/lib/format";
import { toast } from "./Toast";

export interface TrashItem { table: "visit_photos" | "store_equipment" | "payment_records" | "agreements" | "incidents"; id: string; title: string; detail: string; deleted_at: string; thumb?: string | null; paths?: string[] }
const GROUP: Record<TrashItem["table"], string> = { visit_photos: "Fotos", store_equipment: "Elementos del inventario", payment_records: "Pagos", agreements: "Acuerdos", incidents: "Incidencias" };

/** Papelera: lo enviado aquí se puede recuperar. «Eliminar» lo borra para siempre. */
export function TrashBin({ items }: { items: TrashItem[] }) {
  const router = useRouter();
  const sb = supabaseBrowser();
  const [busy, setBusy] = useState<string | null>(null);

  async function restore(it: TrashItem) {
    setBusy(it.id);
    const { error } = await sb.from(it.table).update({ deleted_at: null }).eq("id", it.id);
    setBusy(null);
    if (error) return toast(error.message, "error");
    toast("Recuperado");
    router.refresh();
  }
  async function purge(it: TrashItem) {
    if (!confirm(`¿Eliminar «${it.title}» para siempre? No se podrá recuperar.`)) return;
    setBusy(it.id);
    if (it.paths?.length) await sb.storage.from("visit-photos").remove(it.paths);
    const { error } = await sb.from(it.table).delete().eq("id", it.id);
    setBusy(null);
    if (error) return toast(error.message, "error");
    toast("Eliminado definitivamente");
    router.refresh();
  }

  if (!items.length) return <section className="card text-sm text-slate-500">La papelera está vacía.</section>;
  const groups = (Object.keys(GROUP) as TrashItem["table"][]).map((t) => [t, items.filter((i) => i.table === t)] as const).filter(([, xs]) => xs.length);
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">Lo que envías a la papelera deja de verse en la app pero no se borra. Recupéralo cuando quieras o elimínalo para siempre.</p>
      {groups.map(([t, xs]) => (
        <section key={t} className="card space-y-2">
          <h2 className="font-semibold">{GROUP[t]} ({xs.length})</h2>
          <ul className="divide-y divide-slate-100">
            {xs.map((it) => (
              <li key={it.id} className="flex items-center gap-3 py-2.5 text-sm">
                {it.thumb !== undefined && <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100">{it.thumb && /* eslint-disable-next-line @next/next/no-img-element */ <img src={it.thumb} alt="" className="h-full w-full object-cover" />}</span>}
                <span className="min-w-0 flex-1"><b className="block truncate">{it.title}</b><span className="block truncate text-xs text-slate-500">{it.detail} · en la papelera desde {dmy(it.deleted_at.slice(0, 10))}</span></span>
                <button className="btn-secondary !min-h-9 !px-3" disabled={busy === it.id} onClick={() => restore(it)} aria-label={`Recuperar ${it.title}`}><RotateCcw size={15} /><span className="hidden sm:inline">Recuperar</span></button>
                <button className="icon-btn !text-red-600" disabled={busy === it.id} onClick={() => purge(it)} aria-label={`Eliminar ${it.title} para siempre`}><Trash2 size={16} /></button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
