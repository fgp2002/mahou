"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { createPaymentType, eur, type InvestmentCategory, type PaymentType } from "@/lib/payments";
import { NATURE_LABEL, UNIT_LABEL, UNIT_NAME, type Nature, type Unit } from "@/lib/economy";

export function PaymentTypesManager({ types, usage, categories }: { types: PaymentType[]; usage: Record<string, number>; categories: InvestmentCategory[] }) {
  const router = useRouter();
  const sb = supabaseBrowser();
  const [edit, setEdit] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", amount: "", category: "", notes: "", inv: false, cat: "", unit: "eur" as Unit });
  const [nf, setNf] = useState({ name: "", amount: "", category: "", inv: true, cat: categories[0]?.id ?? "", unit: "eur" as Unit });
  const [nc, setNc] = useState({ name: "", nature: "dinero" as Nature });
  const catName = (id: string | null | undefined) => categories.find((c) => c.id === id)?.name;
  const [msg, setMsg] = useState<string | null>(null);

  async function add() {
    const { data, error } = await createPaymentType(sb, { name: nf.name, default_amount: nf.amount.trim() === "" ? null : Number(nf.amount.replace(",", ".")), category: nf.category, tracks_inventory: nf.inv });
    if (error) return setMsg(error);
    if (data) await sb.from("payment_types").update({ category_id: nf.cat || null, unit: nf.unit }).eq("id", data.id);
    setNf({ name: "", amount: "", category: "", inv: true, cat: nf.cat, unit: "eur" });
    setMsg("Tipo creado.");
    router.refresh();
  }
  function start(t: PaymentType) {
    setEdit(t.id);
    setF({ name: t.name, amount: t.default_amount?.toString() ?? "", category: t.category ?? "", notes: t.notes ?? "", inv: !!t.tracks_inventory, cat: t.category_id ?? "", unit: (t.unit ?? "eur") as Unit });
  }
  async function save(t: PaymentType) {
    const name = f.name.replace(/\s+/g, " ").trim();
    if (!name) return setMsg("El nombre no puede estar vacío.");
    const amount = f.amount.trim() === "" ? null : Number(f.amount.replace(",", "."));
    if (amount != null && (!Number.isFinite(amount) || amount < 0)) return setMsg("El importe no es válido.");
    const clash = types.find((x) => x.id !== t.id && x.name.trim().toLowerCase() === name.toLowerCase());
    if (clash) return setMsg(`Ya existe un tipo llamado «${clash.name}».`);
    // Solo se actualiza el tipo: los pagos ya registrados conservan el nombre con el que se hicieron.
    const { error } = await sb.from("payment_types").update({ name, default_amount: amount, category: f.category.trim() || null, notes: f.notes.trim() || null, tracks_inventory: f.inv, category_id: f.cat || null, unit: f.unit }).eq("id", t.id);
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
      <h2 className="font-medium">Tipos de elemento y conceptos de pago</h2>
      <p className="text-sm text-slate-500">Un solo catálogo para el inventario y los pagos. Marca «Se instala en tienda» en lo que es físico (neveras, cabeceras, expositores…): aparecerá en el inventario. Los pagos ya registrados conservan su nombre original; los tipos con historial no se pueden eliminar, solo desactivar.</p>
      <ul className="divide-y divide-slate-200">
        {types.map((t) => {
          const used = usage[t.id] ?? 0;
          return (
            <li key={t.id} className="py-3">
              {edit === t.id ? (
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2 sm:col-span-1"><label className="label">Nombre</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
                  <div><label className="label">Importe (€)</label><input className="input" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
                  <div><label className="label">Tipo de inversión</label><select className="input" value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })}><option value="">Sin categoría</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                  <div><label className="label">Se mide en</label><select className="input" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value as Unit })}>{(Object.keys(UNIT_NAME) as Unit[]).map((u) => <option key={u} value={u}>{UNIT_NAME[u]}</option>)}</select></div>
                  <div className="col-span-2"><label className="label">Notas</label><input className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
                  <label className="col-span-2 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-[rgb(var(--brand-600))]" checked={f.inv} onChange={(e) => setF({ ...f, inv: e.target.checked })} /> Se instala en tienda (aparece en el inventario)</label>
                  <div className="col-span-2 flex gap-2"><button className="btn" onClick={() => save(t)}>Guardar</button><button className="btn-secondary" onClick={() => setEdit(null)}>Cancelar</button></div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className={t.active ? "" : "opacity-50"}>
                    <div className="font-medium">{t.name} {t.tracks_inventory && <span className="badge bg-brand-50 text-brand-700">Inventario</span>} {!t.active && <span className="badge bg-slate-200 text-slate-700">Desactivado</span>}</div>
                    <div className="text-xs text-slate-500">{catName(t.category_id) ?? "Sin categoría"} · {t.default_amount != null ? eur(t.default_amount) : "sin importe"}{t.unit && t.unit !== "eur" ? ` · en ${UNIT_LABEL[t.unit]}` : ""} · {used} usos</div>
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
          <div className="col-span-2 sm:col-span-1"><label className="label">Tipo de inversión</label><select className="input" value={nf.cat} onChange={(e) => setNf({ ...nf, cat: e.target.value })}><option value="">Sin categoría</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label className="label">Se mide en</label><select className="input" value={nf.unit} onChange={(e) => setNf({ ...nf, unit: e.target.value as Unit })}>{(Object.keys(UNIT_NAME) as Unit[]).map((u) => <option key={u} value={u}>{UNIT_NAME[u]}</option>)}</select></div>
        </div>
        <label className="mt-2 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-[rgb(var(--brand-600))]" checked={nf.inv} onChange={(e) => setNf({ ...nf, inv: e.target.checked })} /> Se instala en tienda (aparece en el inventario)</label>
        <button className="btn mt-2" onClick={add}>Crear tipo</button>
      </div>
      {msg && <p className="text-sm text-slate-600" role="status">{msg}</p>}

      <div className="space-y-2 border-t border-slate-100 pt-4">
        <h3 className="font-medium">Tipos de inversión</h3>
        <p className="text-sm text-slate-500">Agrupan los conceptos en Economía e Informes. La naturaleza indica cómo se valora: lo que no es dinero (horas, producto, material) nunca se suma como dinero abonado.</p>
        <ul className="divide-y divide-slate-100 text-sm">
          {categories.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
              <input className="input !min-h-9 min-w-0 flex-1" defaultValue={c.name} aria-label="Nombre" onBlur={async (e) => { const n = e.target.value.trim(); if (n && n !== c.name) { const { error } = await sb.from("investment_categories").update({ name: n }).eq("id", c.id); setMsg(error ? error.message : "Tipo de inversión renombrado."); router.refresh(); } }} />
              <select className="input !min-h-9 !w-36" value={c.nature} aria-label="Naturaleza" onChange={async (e) => { await sb.from("investment_categories").update({ nature: e.target.value }).eq("id", c.id); router.refresh(); }}>
                {(Object.keys(NATURE_LABEL) as Nature[]).map((n) => <option key={n} value={n}>{NATURE_LABEL[n]}</option>)}
              </select>
              <span className="text-xs text-slate-500">{types.filter((t) => t.category_id === c.id).length} conceptos</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1"><label className="label">Nuevo tipo de inversión</label><input className="input" value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} /></div>
          <select className="input !w-36" value={nc.nature} aria-label="Naturaleza" onChange={(e) => setNc({ ...nc, nature: e.target.value as Nature })}>{(Object.keys(NATURE_LABEL) as Nature[]).map((n) => <option key={n} value={n}>{NATURE_LABEL[n]}</option>)}</select>
          <button className="btn" disabled={!nc.name.trim()} onClick={async () => {
            const name = nc.name.trim();
            const code = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40) || "categoria";
            const { error } = await sb.from("investment_categories").insert({ name, code: `${code}_${Math.random().toString(36).slice(2, 5)}`, nature: nc.nature, sort_order: 50 });
            setMsg(error ? (error.code === "23505" ? "Ya existe un tipo de inversión con ese nombre." : error.message) : "Tipo de inversión creado.");
            if (!error) setNc({ name: "", nature: "dinero" });
            router.refresh();
          }}>Crear</button>
        </div>
      </div>
    </section>
  );
}
