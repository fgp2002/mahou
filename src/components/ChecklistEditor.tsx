"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { toast } from "./Toast";

/** Lista de comprobaciones que aparece (opcional) al cerrar cada visita. */
export function ChecklistEditor({ ownerId, items }: { ownerId: string; items: string[] }) {
  const router = useRouter();
  const [list, setList] = useState(items);
  const [txt, setTxt] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(list) !== JSON.stringify(items);
  const move = (i: number, d: number) => { const l = [...list]; [l[i], l[i + d]] = [l[i + d], l[i]]; setList(l); };
  async function save() {
    setBusy(true);
    const { error } = await supabaseBrowser().from("user_settings").update({ checklist: list }).eq("owner_id", ownerId);
    setBusy(false);
    if (error) return toast(error.message, "error");
    toast("Checklist guardado");
    router.refresh();
  }
  return (
    <section className="card space-y-3">
      <div><h2 className="font-semibold">Checklist de visita</h2><p className="text-sm text-slate-500">Casillas que aparecen al cerrar la visita. Ninguna es obligatoria.</p></div>
      <ul className="space-y-1.5">
        {list.map((c, i) => (
          <li key={c} className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1.5 text-sm">
            <span className="min-w-0 flex-1 truncate">{c}</span>
            <button className="icon-btn" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={15} /></button>
            <button className="icon-btn" aria-label="Bajar" disabled={i === list.length - 1} onClick={() => move(i, 1)}><ArrowDown size={15} /></button>
            <button className="icon-btn !text-red-600" aria-label={`Quitar ${c}`} onClick={() => setList(list.filter((x) => x !== c))}><X size={15} /></button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input className="input" placeholder="Nueva comprobación" value={txt} maxLength={60} onChange={(e) => setTxt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && txt.trim() && !list.includes(txt.trim())) { setList([...list, txt.trim()]); setTxt(""); } }} />
        <button className="btn-secondary" disabled={!txt.trim() || list.includes(txt.trim())} onClick={() => { setList([...list, txt.trim()]); setTxt(""); }}><Plus size={16} /></button>
      </div>
      <button className="btn" disabled={!dirty || busy} onClick={save}>Guardar checklist</button>
    </section>
  );
}
