"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export interface Contact { id: string; full_name: string | null; role: string | null; phone: string | null; email: string | null; notes: string | null }

export function Contacts({ storeId, contacts }: { storeId: string; contacts: Contact[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Partial<Contact> | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
    setErr(null);
    router.refresh();
  }

  async function remove(c: Contact) {
    if (!confirm(`¿Eliminar el contacto ${c.full_name ?? c.role ?? ""}?`)) return;
    const { error } = await supabaseBrowser().from("store_contacts").delete().eq("id", c.id);
    if (error) return setErr(error.message);
    router.refresh();
  }

  return (
    <section className="card space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Contactos</h2>
        <button className="btn-secondary" onClick={() => setEditing({})}>Añadir</button>
      </div>
      {contacts.length === 0 && !editing && <p className="text-sm text-slate-500">Sin contactos. Todos los campos son opcionales.</p>}
      <ul className="divide-y divide-slate-100">
        {contacts.map((c) => (
          <li key={c.id} className="flex items-start justify-between gap-2 py-2 text-sm">
            <div>
              <div className="font-medium">{c.full_name || "(sin nombre)"} {c.role && <span className="text-slate-500">· {c.role}</span>}</div>
              <div className="text-slate-500">
                {c.phone && <a className="mr-3 underline" href={`tel:${c.phone}`}>{c.phone}</a>}
                {c.email && <a className="underline" href={`mailto:${c.email}`}>{c.email}</a>}
              </div>
              {c.notes && <div className="text-xs text-slate-400">{c.notes}</div>}
            </div>
            <div className="flex gap-2">
              <button className="underline" onClick={() => setEditing(c)}>Editar</button>
              <button className="text-red-600 underline" onClick={() => remove(c)}>Borrar</button>
            </div>
          </li>
        ))}
      </ul>
      {editing && (
        <div className="grid grid-cols-1 gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
          {(["full_name", "role", "phone", "email"] as const).map((k) => (
            <div key={k}>
              <label className="label">{{ full_name: "Nombre", role: "Cargo", phone: "Teléfono", email: "Correo" }[k]}</label>
              <input className="input" value={editing[k] ?? ""} onChange={(e) => setEditing({ ...editing, [k]: e.target.value })} />
            </div>
          ))}
          <div className="sm:col-span-2">
            <label className="label">Notas</label>
            <input className="input" value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn" onClick={save}>Guardar contacto</button>
            <button className="btn-secondary" onClick={() => setEditing(null)}>Cancelar</button>
          </div>
        </div>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
    </section>
  );
}
