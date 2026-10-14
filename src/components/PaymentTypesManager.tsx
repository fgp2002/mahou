"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { createPaymentType, eur, type PaymentType } from "@/lib/payments";

export function PaymentTypesManager({ types, usage }: { types: PaymentType[]; usage: Record<string, number> }) {
  const router = useRouter();
  const sb = supabaseBrowser();
  const [edit, setEdit] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", amount: "", category: "", notes: "" });
  const [nf, setNf] = useState({ name: "", amount: "", category: "" });
  const [msg, setMsg] = useState<string | null>(null);

  async function add() {
    const { error } = await createPaymentType(sb, { name: nf.name, default_amount: nf.amount.trim() === "" ? null : Number(nf.amount.replace(",", ".")), category: nf.category });
    if (error) return setMsg(error);
    setNf({ name: "", amount: "", category: "" });
    setMsg("Tipo creado.");
    router.refresh();
  }
  function start(t: PaymentType) {
    setEdit(t.id);
    setF({ name: t.name, amount: t.default_amount?.toString() ?? "", category: t.category ?? "", notes: t.notes ?? "" });
  }
  async function save(t: PaymentType) {
    const name = f.name.replace(/\s+/g, " ").trim();
    if (!name) return setMsg("El nombre no puede estar vacío.");
    const amount = f.amount.trim() === "" ? null : Number(f.amount.replace(",", "."));
    if (amount != null && (!Number.isFinite(amount) || amount < 0)) return setMsg("El importe no es válido.");
    const clash = types.find((x) => x.id !== t.id && x.name.trim().toLowerCase() === name.toLowerCase());
    if (clash) return setMsg(`Ya existe un tipo llamado «${clash.name}».`);
    // Solo se actualiza el tipo: los pagos ya registrados conservan el nombre con el que se hicieron.
    const { error } = await sb.from("payment_types").update({ name, default_amount: amount, category: f.category.trim() || null, notes: f.notes.trim() || null }).eq("id", t.id);
    if (error) return setMsg(error.message);
    setEdit(null);
    setMsg("Guardado. El historial de pagos no cambia.");
    router.refresh();
  }
  async function toggle(t: PaymentType) {
    const { error } = await sb.from("payment_types").update({ active: !t.active }).eq("id", t.id);
    setMsg(error ? error.message : null);
    router.refresh();
  }
  async function remove(t: PaymentType) {
    if (!confirm(`¿Eliminar el tipo «${t.name}»? No se puede deshacer.`)) return;
    const { error } = await sb.from("payment_types").delete().eq("id", t.id);
    setMsg(error ? "No se puede eliminar porque tiene pagos asociados. Desactívalo en su lugar." : "Eliminado.");
    router.refresh();
  }

  return (
    <section className="card space-y-3">
      <h2 className="font-medium">Tipos de pago</h2>
      <p className="text-sm text-slate-500">Crea, renombra o desactiva tipos. Los pagos ya registrados conservan su nombre original. Los tipos con historial no se pueden eliminar, solo desactivar.</p>
      <ul className="divide-y divide-slate-200">
        {types.map((t) => {
          const used = usage[t.id] ?? 0;
          return (
            <li key={t.id} className="py-3">
              {edit === t.id ? (
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2 sm:col-span-1"><label className="label">Nombre</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
                  <div><label className="label">Importe (€)</label><input className="input" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
                  <div><label className="label">Categoría</label><input className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></div>
                  <div className="col-span-2"><label className="label">Notas</label><input className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
                  <div className="col-span-2 flex gap-2"><button className="btn" onClick={() => save(t)}>Guardar</button><button className="btn-secondary" onClick={() => setEdit(null)}>Cancelar</button></div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className={t.active ? "" : "opacity-50"}>
                    <div className="font-medium">{t.name} {!t.active && <span className="badge bg-slate-200 text-slate-700">Desactivado</span>}</div>
                    <div className="text-xs text-slate-500">{t.default_amount != null ? eur(t.default_amount) : "sin importe"}{t.category ? ` · ${t.category}` : ""} · {used} usos</div>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-secondary" onClick={() => start(t)}>Editar</button>
                    <button className="btn-secondary" onClick={() => toggle(t)}>{t.active ? "Desactivar" : "Activar"}</button>
                    {used === 0 && !t.is_builtin && <button className="btn-secondary text-red-600" onClick={() => remove(t)}>Eliminar</button>}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="rounded-xl bg-slate-100 p-3">
        <div className="mb-2 text-sm font-medium">Nuevo tipo</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div><label className="label">Nombre</label><input className="input" value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} /></div>
          <div><label className="label">Importe (€)</label><input className="input" inputMode="decimal" value={nf.amount} onChange={(e) => setNf({ ...nf, amount: e.target.value })} /></div>
          <div className="col-span-2 sm:col-span-1"><label className="label">Categoría</label><input className="input" value={nf.category} onChange={(e) => setNf({ ...nf, category: e.target.value })} /></div>
        </div>
        <button className="btn mt-2" onClick={add}>Crear tipo</button>
      </div>
      {msg && <p className="text-sm text-slate-600" role="status">{msg}</p>}
    </section>
  );
}
