"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Mail, MessageCircle, Pencil, Phone, Plus, Trash2 } from "lucide-react";

const ROLES = ["Encargado", "Segundo encargado", "Reponedor", "Personal del centro"];
const OTHER = "__otro__";

export interface Contact { id: string; full_name: string | null; role: string | null; phone: string | null; email: string | null; notes: string | null }

export function Contacts({ storeId, contacts }: { storeId: string; contacts: Contact[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Partial<Contact> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [otherMode, setOtherMode] = useState(false);

  async function save() {
    if (!editing) return;
    const p = {
      full_name: editing.full_name?.trim() || null,
      role: editing.role?.trim() || null,
      phone: editing.phone?.trim() || null,
      email: editing.email?.trim() || null,
      notes: editing.notes?.trim() || null,
    };
    const sb = supabaseBrowser();
    const { error } = editing.id
      ? await sb.from("store_contacts").update(p).eq("id", editing.id)
      : await sb.from("store_contacts").insert({ ...p, store_id: storeId });
    if (error) return setErr(error.message);
    setEditing(null);
    setOtherMode(false);
    setErr(null);
    router.refresh();
  }

  async function remove(c: Contact) {
    if (!confirm(`¿Eliminar el contacto ${c.full_name ?? c.role ?? ""}?`)) return;
    const { error } = await supabaseBrowser().from("store_contacts").delete().eq("id", c.id);
    if (error) return setErr(error.message);
    router.refresh();
  }

  const roleValue = (r: string | null | undefined) => (r && ROLES.includes(r) ? r : r ? OTHER : "");
  const wa = (phone: string) => {
    const d = phone.replace(/\D/g, "");
    return `https://wa.me/${d.length === 9 ? "34" + d : d}`;
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-end">
        <button className="btn-secondary" onClick={() => setEditing({ role: "Encargado" })}><Plus size={15} /> Añadir contacto</button>
      </div>
      {contacts.length === 0 && !editing && <p className="text-sm text-slate-500">Sin contactos. Todos los campos son opcionales.</p>}
      <ul className="divide-y divide-slate-100">
        {contacts.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 font-bold uppercase text-slate-600">{(c.full_name ?? c.role ?? "?").slice(0, 1)}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{c.full_name || "(sin nombre)"}</div>
              <div className="truncate text-xs text-slate-500">{[c.role, c.phone, c.email].filter(Boolean).join(" · ")}</div>
              {c.notes && <div className="truncate text-xs text-slate-400">{c.notes}</div>}
            </div>
            <div className="flex items-center gap-0.5">
              {c.phone && <a className="icon-btn" href={`tel:${c.phone.replace(/\s/g, "")}`} aria-label={`Llamar a ${c.full_name ?? "contacto"}`} title="Llamar"><Phone size={16} /></a>}
              {c.phone && <a className="icon-btn" href={wa(c.phone)} target="_blank" rel="noreferrer" aria-label="WhatsApp" title="WhatsApp"><MessageCircle size={16} /></a>}
              {c.email && <a className="icon-btn" href={`mailto:${c.email}`} aria-label="Email" title="Email"><Mail size={16} /></a>}
              <button className="icon-btn" onClick={() => setEditing(c)} aria-label="Editar" title="Editar"><Pencil size={15} /></button>
              <button className="icon-btn !text-red-600" onClick={() => remove(c)} aria-label="Borrar" title="Borrar"><Trash2 size={15} /></button>
            </div>
          </li>
        ))}
      </ul>
      {editing && (
        <div className="fade-in grid grid-cols-1 gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
          <div className="min-w-0"><label className="label">Nombre</label><input className="input" value={editing.full_name ?? ""} onChange={(e) => setEditing({ ...editing, full_name: e.target.value })} autoFocus /></div>
          <div className="min-w-0">
            <label className="label">Tipo de contacto</label>
            <select className="input" value={otherMode ? OTHER : roleValue(editing.role)} onChange={(e) => { const o = e.target.value === OTHER; setOtherMode(o); setEditing({ ...editing, role: o ? "" : e.target.value }); }}>
              <option value="">—</option>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              <option value={OTHER}>Otro…</option>
            </select>
          </div>
          {(editing.role !== undefined && editing.role !== null && !ROLES.includes(editing.role) && editing.role !== "") || otherMode ? (
            <div className="min-w-0 sm:col-span-2"><label className="label">¿Qué cargo?</label><input className="input" value={editing.role ?? ""} onChange={(e) => setEditing({ ...editing, role: e.target.value })} /></div>
          ) : null}
          <div className="min-w-0"><label className="label">Teléfono</label><input className="input" type="tel" inputMode="tel" value={editing.phone ?? ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></div>
          <div className="min-w-0"><label className="label">Correo</label><input className="input" type="email" inputMode="email" value={editing.email ?? ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></div>
          <div className="min-w-0 sm:col-span-2"><label className="label">Notas</label><input className="input" value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></div>
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn" onClick={save}>Guardar contacto</button>
            <button className="btn-secondary" onClick={() => { setEditing(null); setOtherMode(false); }}>Cancelar</button>
          </div>
        </div>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
    </section>
  );
}
