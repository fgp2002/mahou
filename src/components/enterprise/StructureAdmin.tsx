"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Building2, ChevronRight, MapPin, Pencil, Plus } from "lucide-react";
import { can, childKind, unitKindName } from "@/lib/enterprise/roles";
import { Sheet } from "../Sheet";
import { toast } from "../Toast";
import { adminOp } from "./adminApi";

interface Unit { id: string; parent_id: string | null; kind: string; name: string; sort_order: number; active: boolean }
interface Company { id: string; name: string; active: boolean; tax_id: string | null; notes: string | null }
interface StoreLite { id: string; unit_id: string | null; town: string | null; chain: string | null; banner: string | null }

export function StructureAdmin({ perms, units, people, companies, companyStores, stores }: {
  perms: string[]; units: Unit[]; people: Record<string, number>; companies: Company[]; companyStores: Record<string, number>; stores: StoreLite[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [unitForm, setUnitForm] = useState<{ parent?: Unit; edit?: Unit } | null>(null);
  const [compForm, setCompForm] = useState<Company | "new" | null>(null);
  const [move, setMove] = useState<Unit | null>(null);
  const canEdit = can(perms, "estructura.editar");
  const canCreate = can(perms, "estructura.crear");
  const canComp = can(perms, "empresas.crear");
  const storesIn = useMemo(() => {
    const direct: Record<string, number> = {};
    for (const s of stores) if (s.unit_id) direct[s.unit_id] = (direct[s.unit_id] ?? 0) + 1;
    const total = (id: string): number => (direct[id] ?? 0) + units.filter((u) => u.parent_id === id).reduce((a, u) => a + total(u.id), 0);
    return Object.fromEntries(units.map((u) => [u.id, total(u.id)]));
  }, [stores, units]);
  const noUnit = stores.filter((s) => !s.unit_id).length;
  const roots = units.filter((u) => !u.parent_id || !units.some((p) => p.id === u.parent_id));

  function Node({ u, depth }: { u: Unit; depth: number }) {
    const kids = units.filter((x) => x.parent_id === u.id);
    const ck = childKind(u.kind);
    return (
      <li>
        <div className={clsx("flex flex-wrap items-center gap-2 rounded-xl px-2 py-2 hover:bg-slate-50", !u.active && "opacity-50")} style={{ paddingLeft: `${0.5 + depth * 1.25}rem` }}>
          {depth > 0 && <ChevronRight size={14} className="text-slate-400" />}
          <span className="badge bg-slate-100 text-slate-600">{unitKindName(u.kind)}</span>
          <b className="min-w-0 truncate">{u.name}</b>
          <span className="text-xs text-slate-500">{storesIn[u.id] ?? 0} tiendas · {people[u.id] ?? 0} personas</span>
          <span className="ml-auto flex gap-1">
            {canEdit && u.kind !== "pais" && <button className="btn-ghost !min-h-9 !px-2 text-xs" onClick={() => setMove(u)}><MapPin size={14} /> Tiendas</button>}
            {canEdit && <button className="icon-btn" aria-label={`Editar ${u.name}`} onClick={() => setUnitForm({ edit: u })}><Pencil size={15} /></button>}
            {canCreate && ck && <button className="btn-ghost !min-h-9 !px-2 text-xs" onClick={() => setUnitForm({ parent: u })}><Plus size={14} /> {unitKindName(ck)}</button>}
          </span>
        </div>
        {kids.length > 0 && <ul>{kids.map((k) => <Node key={k.id} u={k} depth={depth + 1} />)}</ul>}
      </li>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section className="card space-y-3">
        <div className="flex items-center justify-between gap-2"><h2 className="t-section">Estructura territorial</h2></div>
        <p className="text-sm text-slate-500">País › región › zona › equipo. Cada persona ve las tiendas de su unidad y de lo que cuelga de ella.</p>
        <ul className="-mx-2">{roots.map((u) => <Node key={u.id} u={u} depth={0} />)}</ul>
        {noUnit > 0 && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{noUnit} tiendas sin unidad: solo las ven quienes tienen ámbito de toda la organización o las tienen en su cartera.</p>}
      </section>
      <section className="card space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="t-section">Empresas de servicio</h2>
          {canComp && <button className="btn-secondary !min-h-9" onClick={() => setCompForm("new")}><Plus size={16} /> Nueva</button>}
        </div>
        <p className="text-sm text-slate-500">Empresas externas (p. ej. de conveniencia). Sus usuarios solo ven las tiendas que se les asignan.</p>
        {companies.length === 0 ? <p className="text-sm text-slate-500">Aún no hay empresas externas.</p> : (
          <ul className="divide-y divide-slate-200">{companies.map((c) => (
            <li key={c.id} className={clsx("flex items-center gap-3 py-2.5", !c.active && "opacity-50")}>
              <Building2 size={18} className="shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1"><b className="block truncate">{c.name}</b><span className="text-xs text-slate-500">{companyStores[c.id] ?? 0} tiendas · {people[c.id] ?? 0} usuarios{c.tax_id ? ` · ${c.tax_id}` : ""}{!c.active ? " · desactivada" : ""}</span></span>
              {can(perms, "empresas.editar") && <button className="icon-btn" aria-label={`Editar ${c.name}`} onClick={() => setCompForm(c)}><Pencil size={15} /></button>}
            </li>))}
          </ul>
        )}
      </section>

      {unitForm && <UnitSheet ctx={unitForm} busy={busy} onClose={() => setUnitForm(null)} onSave={async (name, active) => {
        setBusy(true);
        const r = unitForm.edit ? await adminOp({ op: "update_unit", id: unitForm.edit.id, name, active }) : await adminOp({ op: "create_unit", parent_id: unitForm.parent!.id, kind: childKind(unitForm.parent!.kind), name });
        setBusy(false);
        if (!r.ok) return toast(r.error, "error");
        toast(unitForm.edit ? "Unidad actualizada" : "Unidad creada"); setUnitForm(null); router.refresh();
      }} />}
      {compForm && <CompanySheet c={compForm === "new" ? null : compForm} busy={busy} onClose={() => setCompForm(null)} onSave={async (v) => {
        setBusy(true);
        const r = compForm === "new" ? await adminOp({ op: "create_company", ...v }) : await adminOp({ op: "update_company", id: compForm.id, name: v.name, active: v.active });
        setBusy(false);
        if (!r.ok) return toast(r.error, "error");
        toast("Empresa guardada"); setCompForm(null); router.refresh();
      }} />}
      {move && <MoveStores unit={move} stores={stores} units={units} onClose={() => setMove(null)} />}
    </div>
  );
}

function UnitSheet({ ctx, busy, onClose, onSave }: { ctx: { parent?: Unit; edit?: Unit }; busy: boolean; onClose: () => void; onSave: (name: string, active?: boolean) => void }) {
  const [name, setName] = useState(ctx.edit?.name ?? "");
  const [active, setActive] = useState(ctx.edit?.active ?? true);
  const kind = ctx.edit ? ctx.edit.kind : childKind(ctx.parent!.kind)!;
  return (
    <Sheet title={ctx.edit ? `Editar ${unitKindName(kind).toLowerCase()}` : `Nueva ${unitKindName(kind).toLowerCase()}`} subtitle={ctx.parent ? `Dentro de ${ctx.parent.name}` : undefined} onClose={onClose}
      footer={<div className="flex gap-2"><button className="btn-secondary flex-1" onClick={onClose}>Cancelar</button><button className="btn flex-1" disabled={busy || !name.trim()} onClick={() => onSave(name.trim(), ctx.edit ? active : undefined)}>Guardar</button></div>}>
      <div className="space-y-4">
        <label className="block"><span className="label">Nombre</span><input className="input" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label>
        {ctx.edit && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={active} onChange={(e) => setActive(e.target.checked)} /> Activa</label>}
        <p className="text-xs text-slate-500">Usa los nombres reales de vuestra organización: la app no inventa estructura.</p>
      </div>
    </Sheet>
  );
}

function CompanySheet({ c, busy, onClose, onSave }: { c: Company | null; busy: boolean; onClose: () => void; onSave: (v: { name: string; tax_id?: string; notes?: string; active?: boolean }) => void }) {
  const [v, setV] = useState({ name: c?.name ?? "", tax_id: c?.tax_id ?? "", notes: c?.notes ?? "", active: c?.active ?? true });
  return (
    <Sheet title={c ? c.name : "Nueva empresa de servicio"} onClose={onClose}
      footer={<div className="flex gap-2"><button className="btn-secondary flex-1" onClick={onClose}>Cancelar</button><button className="btn flex-1" disabled={busy || v.name.trim().length < 2} onClick={() => onSave({ name: v.name.trim(), tax_id: v.tax_id || undefined, notes: v.notes || undefined, active: c ? v.active : undefined })}>Guardar</button></div>}>
      <div className="space-y-4">
        <label className="block"><span className="label">Nombre de la empresa</span><input className="input" maxLength={120} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
        {!c && <label className="block"><span className="label">CIF (opcional)</span><input className="input" maxLength={20} value={v.tax_id} onChange={(e) => setV({ ...v, tax_id: e.target.value })} /></label>}
        {!c && <label className="block"><span className="label">Notas (opcional)</span><textarea className="input min-h-20" maxLength={500} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></label>}
        {c && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> Activa (si la desactivas, no se le pueden asignar tiendas nuevas)</label>}
      </div>
    </Sheet>
  );
}

/** Pasar tiendas a una unidad por municipio o cadena (p. ej. todos los de la costa a «Málaga Oeste»). */
function MoveStores({ unit, stores, units, onClose }: { unit: Unit; stores: StoreLite[]; units: Unit[]; onClose: () => void }) {
  const router = useRouter();
  const [by, setBy] = useState<"town" | "chain">("town");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [onlyFrom, setOnlyFrom] = useState(unit.parent_id ?? "");
  const [busy, setBusy] = useState(false);
  const pool = stores.filter((s) => !onlyFrom || s.unit_id === onlyFrom || !s.unit_id);
  const groups = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of pool) { const k = (by === "town" ? s.town : s.chain) || "(sin dato)"; m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"));
  }, [pool, by]);
  const picked = pool.filter((s) => sel.has((by === "town" ? s.town : s.chain) || "(sin dato)"));
  return (
    <Sheet title={`Tiendas de ${unit.name}`} subtitle={`Ahora: ${stores.filter((s) => s.unit_id === unit.id).length} tiendas`} onClose={onClose}
      footer={<div className="flex gap-2"><button className="btn-secondary flex-1" onClick={onClose}>Cerrar</button><button className="btn flex-1" disabled={busy || !picked.length} onClick={async () => {
        setBusy(true);
        const r = await adminOp<{ updated: number }>({ op: "set_store_unit", unit_id: unit.id, store_ids: picked.map((s) => s.id) });
        setBusy(false);
        if (!r.ok) return toast(r.error, "error");
        toast(`${r.data.updated} tiendas pasan a ${unit.name}`); router.refresh(); onClose();
      }}>Pasar {picked.length || ""} tiendas</button></div>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <select className="input" value={by} onChange={(e) => { setBy(e.target.value as "town" | "chain"); setSel(new Set()); }} aria-label="Agrupar por"><option value="town">Por municipio</option><option value="chain">Por cadena</option></select>
          <select className="input" value={onlyFrom} onChange={(e) => { setOnlyFrom(e.target.value); setSel(new Set()); }} aria-label="Origen">
            <option value="">De cualquier unidad</option>{units.filter((u) => u.id !== unit.id).map((u) => <option key={u.id} value={u.id}>Que ahora están en {u.name}</option>)}
          </select>
        </div>
        <ul className="max-h-[50dvh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
          {groups.map(([k, n]) => (
            <li key={k}><label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 text-sm hover:bg-slate-50">
              <input type="checkbox" className="h-5 w-5" checked={sel.has(k)} onChange={(e) => { const s = new Set(sel); if (e.target.checked) s.add(k); else s.delete(k); setSel(s); }} />
              <span className="flex-1">{k}</span><span className="tabular-nums text-slate-500">{n}</span>
            </label></li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}
