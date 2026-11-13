"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Building2, Plus, Search, User, X } from "lucide-react";
import { roleShort } from "@/lib/enterprise/roles";
import { Sheet } from "../Sheet";
import { toast } from "../Toast";
import { EmptyState } from "../ui";
import { adminOp } from "./adminApi";

interface Store { id: string; name: string; town: string | null; chain: string | null; banner: string | null; unit_id: string | null }
interface Assign { id: string; store_id: string; user_id: string | null; company_id: string | null; function: string }
const FUNC: Record<string, string> = { gpv: "GPV", reponedor: "Reposición", servicio: "Servicio externo" };
const defaultFunc = (role: string) => (role === "gpv" || role === "jefe_gpv" ? "gpv" : "reponedor");

export function PortfoliosAdmin({ canAssign, selected, people, companies, stores, assigns }: {
  canAssign: boolean; selected: string | null; people: { id: string; name: string; role: string }[]; companies: { id: string; name: string }[]; stores: Store[]; assigns: Assign[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const storeById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);
  const count = (k: string, id: string) => assigns.filter((a) => (k === "p" ? a.user_id === id : a.company_id === id)).length;
  const [kind, id] = (selected ?? "").split(":");
  const person = kind === "p" ? people.find((p) => p.id === id) : null;
  const company = kind === "c" ? companies.find((c) => c.id === id) : null;
  const mine = assigns.filter((a) => (person ? a.user_id === person.id : company ? a.company_id === company.id : false)).filter((a) => storeById.has(a.store_id));
  const gaps = { gpv: stores.filter((s) => !assigns.some((a) => a.store_id === s.id && a.function === "gpv")).length, rep: stores.filter((s) => !assigns.some((a) => a.store_id === s.id && a.function !== "gpv")).length };
  const list = mine.map((a) => ({ a, s: storeById.get(a.store_id)! })).filter(({ s }) => !q || `${s.name} ${s.town ?? ""} ${s.chain ?? ""}`.toLowerCase().includes(q.toLowerCase())).sort((x, y) => x.s.name.localeCompare(y.s.name, "es"));

  async function remove(ids: string[]) {
    setBusy(true);
    const r = await adminOp({ op: "unassign", ids });
    setBusy(false);
    if (!r.ok) return toast(r.error, "error");
    toast(ids.length === 1 ? "Tienda retirada de la cartera" : `${ids.length} tiendas retiradas`); router.refresh();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="card !p-3"><span className="block text-xs font-semibold text-slate-500">Sin GPV</span><span className={clsx("text-2xl font-extrabold tabular-nums", gaps.gpv && "text-st-soon")}>{gaps.gpv}</span></div>
          <div className="card !p-3"><span className="block text-xs font-semibold text-slate-500">Sin reposición</span><span className={clsx("text-2xl font-extrabold tabular-nums", gaps.rep && "text-st-soon")}>{gaps.rep}</span></div>
        </div>
        <nav className="card !p-2" aria-label="Personas y empresas">
          {people.length === 0 && companies.length === 0 && <p className="p-3 text-sm text-slate-500">Da de alta usuarios con perfil GPV o reponedor, o empresas de servicio, para asignarles tiendas.</p>}
          {people.length > 0 && <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">Personas</p>}
          {people.map((p) => (
            <Link key={p.id} href={`/admin/portfolios?who=p:${p.id}`} className={clsx("flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm", person?.id === p.id ? "bg-brand-50 font-semibold text-brand-700" : "hover:bg-slate-100")}>
              <User size={15} className="shrink-0 opacity-60" /><span className="min-w-0 flex-1 truncate">{p.name}<span className="block text-[11px] font-normal text-slate-500">{roleShort(p.role)}</span></span><span className="tabular-nums text-slate-500">{count("p", p.id)}</span>
            </Link>
          ))}
          {companies.length > 0 && <p className="px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">Empresas de servicio</p>}
          {companies.map((c) => (
            <Link key={c.id} href={`/admin/portfolios?who=c:${c.id}`} className={clsx("flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm", company?.id === c.id ? "bg-brand-50 font-semibold text-brand-700" : "hover:bg-slate-100")}>
              <Building2 size={15} className="shrink-0 opacity-60" /><span className="min-w-0 flex-1 truncate">{c.name}</span><span className="tabular-nums text-slate-500">{count("c", c.id)}</span>
            </Link>
          ))}
        </nav>
      </aside>
      <section className="card min-w-0 space-y-3">
        {!person && !company ? <EmptyState title="Elige una persona o empresa" text="Verás sus tiendas y podrás añadir o retirar." /> : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><h2 className="t-section">{person?.name ?? company?.name}</h2><p className="text-sm text-slate-500">{mine.length} tiendas{person ? ` · ${roleShort(person.role)}` : " · servicio externo"}</p></div>
              {canAssign && <button className="btn" onClick={() => setAdding(true)}><Plus size={18} /> Añadir tiendas</button>}
            </div>
            {mine.length > 6 && <label className="relative block"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="input !pl-9" placeholder="Filtrar su cartera…" value={q} onChange={(e) => setQ(e.target.value)} /></label>}
            {list.length === 0 ? <p className="text-sm text-slate-500">{mine.length ? "Ninguna coincide." : "Sin tiendas asignadas todavía."}</p> : (
              <ul className="divide-y divide-slate-200">{list.map(({ a, s }) => (
                <li key={a.id} className="flex items-center gap-3 py-2">
                  <Link href={`/stores/${s.id}`} className="min-w-0 flex-1"><b className="block truncate text-sm">{s.name}</b><span className="block truncate text-xs text-slate-500">{[s.town, s.chain].filter(Boolean).join(" · ")} · {FUNC[a.function]}</span></Link>
                  {canAssign && <button className="icon-btn" aria-label={`Retirar ${s.name}`} disabled={busy} onClick={() => remove([a.id])}><X size={16} /></button>}
                </li>))}
              </ul>
            )}
          </>
        )}
      </section>
      {adding && (person || company) && (
        <AddStores who={person ? { kind: "p", id: person.id, name: person.name, func: defaultFunc(person.role) } : { kind: "c", id: company!.id, name: company!.name, func: "servicio" }}
          stores={stores} assigns={assigns} people={people} companies={companies} onClose={() => setAdding(false)} />
      )}
    </div>
  );
}

function AddStores({ who, stores, assigns, people, companies, onClose }: {
  who: { kind: string; id: string; name: string; func: string }; stores: Store[]; assigns: Assign[]; people: { id: string; name: string }[]; companies: { id: string; name: string }[]; onClose: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [onlyFree, setOnlyFree] = useState(true);
  const [replace, setReplace] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const holder = (sid: string) => assigns.find((a) => a.store_id === sid && a.function === who.func && (who.kind === "p" ? a.user_id !== who.id : a.company_id !== who.id));
  const holderName = (a: Assign) => (a.user_id ? people.find((p) => p.id === a.user_id)?.name : companies.find((c) => c.id === a.company_id)?.name) ?? "otra persona";
  const own = new Set(assigns.filter((a) => (who.kind === "p" ? a.user_id === who.id : a.company_id === who.id)).map((a) => a.store_id));
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = stores.filter((s) => !own.has(s.id) && (!onlyFree || !holder(s.id)) && terms.every((t) => `${s.name} ${s.town ?? ""} ${s.chain ?? ""} ${s.banner ?? ""}`.toLowerCase().includes(t))).slice(0, 400);
  const toggle = (id: string) => { const n = new Set(sel); if (n.has(id)) n.delete(id); else n.add(id); setSel(n); };
  return (
    <Sheet title={`Añadir tiendas a ${who.name}`} subtitle={`Función: ${FUNC[who.func]}`} onClose={onClose}
      footer={<div className="flex gap-2"><button className="btn-secondary flex-1" onClick={onClose}>Cancelar</button><button className="btn flex-1" disabled={busy || !sel.size} onClick={async () => {
        setBusy(true);
        const r = await adminOp<{ added: number }>({ op: "assign", store_ids: [...sel], function: who.func, replace, ...(who.kind === "p" ? { user_id: who.id } : { company_id: who.id }) });
        setBusy(false);
        if (!r.ok) return toast(r.error, "error");
        toast(`${r.data.added} tiendas añadidas`); router.refresh(); onClose();
      }}>Añadir {sel.size || ""}</button></div>}>
      <div className="space-y-3">
        <label className="relative block"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="input !pl-9" placeholder="Nombre, municipio, cadena…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} /> Solo tiendas sin {FUNC[who.func].toLowerCase()}</label>
          {!onlyFree && <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> Quitar a quien las tenga ahora</label>}
          <button className="link ml-auto" onClick={() => setSel(new Set([...sel, ...list.map((s) => s.id)]))}>Marcar las {list.length}</button>
        </div>
        <ul className="max-h-[52dvh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
          {list.map((s) => { const h = holder(s.id); return (
            <li key={s.id}><label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-1.5 hover:bg-slate-50">
              <input type="checkbox" className="h-5 w-5 shrink-0" checked={sel.has(s.id)} onChange={() => toggle(s.id)} />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{s.name}</span><span className="block truncate text-xs text-slate-500">{[s.town, s.chain].filter(Boolean).join(" · ")}{h ? ` · ahora: ${holderName(h)}` : ""}</span></span>
            </label></li>); })}
          {list.length === 0 && <li className="p-4 text-sm text-slate-500">No hay tiendas que coincidan.</li>}
        </ul>
      </div>
    </Sheet>
  );
}
