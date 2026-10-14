"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { NotebookPen, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { madridDate } from "@/lib/domain/dates";
import { Field } from "./Field";
import { toast } from "./Toast";

/** Añade una nota fechada a la tienda sin abrir una visita. */
export function QuickNote({ storeId, current }: { storeId: string; current: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    const d = madridDate();
    const line = `[${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}] ${t}`;
    const { error } = await supabaseBrowser().from("stores").update({ notes: current ? `${line}\n${current}` : line }).eq("id", storeId);
    setBusy(false);
    if (error) return toast("No se pudo guardar la nota", "error");
    toast("Nota añadida");
    setText("");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}><NotebookPen size={16} /> Nota rápida</button>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 fade-in md:items-center" onClick={() => setOpen(false)}>
          <div className="sheet-up w-full max-w-lg space-y-3 rounded-t-[2rem] bg-white p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:rounded-[2rem]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><b>Nota rápida</b><button aria-label="Cerrar" className="p-2" onClick={() => setOpen(false)}><X size={18} /></button></div>
            <Field label="¿Qué quieres apuntar?" rows={4} value={text} onChange={setText} maxLength={1000} />
            <button className="btn w-full" onClick={save} disabled={busy || !text.trim()}>{busy ? "Guardando…" : "Guardar nota"}</button>
          </div>
        </div>
      )}
    </>
  );
}
