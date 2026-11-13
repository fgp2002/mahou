"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { CalendarClock, Building2, Plus, User } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { can, roleShort, TASK_KINDS, TASK_STATUS, taskKindName } from "@/lib/enterprise/roles";
import { dmy } from "@/lib/format";
import { Sheet } from "../Sheet";
import { StorePicker, type PickedStore } from "../StorePicker";
import { toast } from "../Toast";
import { EmptyState } from "../ui";

export interface TaskRow {
  id: string; store_id: string; kind: string; title: string; description: string | null; priority: string; due_date: string | null; status: string;
  assignee_id: string | null; company_id: string | null; created_by: string; created_at: string; completed_at: string | null;
}
interface Person { id: string; name: string; role: string; org: string }
interface Me { id: string; orgId: string | null; perms: string[]; isOwner: boolean }

const PRIO: Record<string, string> = { alta: "bg-st-late text-[#fff]", media: "bg-amber-100 text-amber-800", baja: "bg-slate-100 text-slate-600" };

export function TaskBoard({ tasks, tab, me, stores, people, companies, today, storeId }: {
  tasks: TaskRow[]; tab: string; me: Me; stores: Record<string, { name: string; town: string | null }>; people: Person[]; companies: { id: string; name: string }[]; today: string; storeId?: string;
}) {
  const [open, setOpen] = useState<TaskRow | null>(null);
  const [creating, setCreating] = useState(false);
  const who = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const comp = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);
  const canCreate = can(me.perms, "tareas.crear");
  return (
    <>
      {canCreate && (
        <div className="flex justify-end"><button className="btn" onClick={() => setCreating(true)}><Plus size={18} /> Nueva tarea</button></div>
      )}
      {tasks.length === 0 ? (
        <div className="card"><EmptyState title={tab === "mias" ? "No tienes tareas pendientes" : tab === "validar" ? "Nada por validar" : "Sin tareas"} text={canCreate ? "Crea una tarea y asígnala a una persona o a una empresa de servicio." : "Cuando te asignen trabajo aparecerá aquí."} /></div>
      ) : (
        <ul className="grid gap-2.5 md:grid-cols-2 2xl:grid-cols-3">
          {tasks.map((t) => {
            const late = t.due_date && t.due_date < today && !["completada", "validada", "cancelada", "pendiente_validacion"].includes(t.status);
            const p = t.assignee_id ? who.get(t.assignee_id) : null;
            return (
              <li key={t.id}>
                <button onClick={() => setOpen(t)} className="card tap flex h-full w-full flex-col gap-2 text-left hover:border-slate-300">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className={clsx("badge", TASK_STATUS[t.status]?.tone)}>{TASK_STATUS[t.status]?.label ?? t.status}</span>
                    {t.priority !== "media" && <span className={clsx("badge", PRIO[t.priority])}>Prioridad {t.priority}</span>}
                    {late && <span className="badge bg-red-100 text-red-700">Fuera de plazo</span>}
                  </span>
                  <span className="font-semibold leading-snug">{t.title}</span>
                  {!storeId && <span className="truncate text-sm text-slate-600">{stores[t.store_id]?.name ?? "Tienda"}{stores[t.store_id]?.town ? ` · ${stores[t.store_id]?.town}` : ""}</span>}
                  <span className="mt-auto flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                    {p ? <span className="inline-flex items-center gap-1"><User size={13} />{p.name}</span> : t.company_id ? <span className="inline-flex items-center gap-1"><Building2 size={13} />{comp.get(t.company_id) ?? "Empresa"}</span> : <span>Sin asignar</span>}
                    {t.due_date && <span className={clsx("inline-flex items-center gap-1", late && "font-semibold text-red-600")}><CalendarClock size={13} />{dmy(t.due_date)}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {open && <TaskDetail task={open} me={me} who={who} comp={comp} store={stores[open.store_id]} people={people} companies={companies} onClose={() => setOpen(null)} />}
      {creating && <TaskForm me={me} people={people} companies={companies} storeId={storeId} storeName={storeId ? stores[storeId]?.name : undefined} onClose={() => setCreating(false)} />}
    </>
  );
}

function TaskForm({ me, people, companies, storeId, storeName, onClose }: { me: Me; people: Person[]; companies: { id: string; name: string }[]; storeId?: string; storeName?: string; onClose: () => void }) {
  const router = useRouter();
  const [store, setStore] = useState<PickedStore | null>(storeId ? { id: storeId, name: storeName ?? "", town: null } : null);
  const [f, setF] = useState({ kind: "revisar_nevera", title: "", description: "", priority: "media", due: "", assign: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canAssign = can(me.perms, "tareas.asignar");
  const assignable = people.filter((p) => ["gpv", "reponedor", "reponedor_conveniencia", "supervisor_conveniencia", "jefe_gpv"].includes(p.role) || p.id === me.id);
  async function save() {
    if (!store) return setErr("Elige la tienda");
    setBusy(true); setErr(null);
    const [kind, id] = f.assign.split(":");
    const { error } = await supabaseBrowser().from("tasks").insert({
      store_id: store.id, kind: f.kind, title: f.title.trim() || taskKindName(f.kind), description: f.description.trim() || null, priority: f.priority, due_date: f.due || null,
      assignee_id: kind === "p" ? id : null, company_id: kind === "c" ? id : null, status: f.assign ? "asignada" : "pendiente",
    });
    setBusy(false);
    if (error) return setErr(error.message.includes("row-level security") ? "No tienes permiso para crear tareas en esa tienda." : error.message);
    toast("Tarea creada"); router.refresh(); onClose();
  }
  return (
    <Sheet title="Nueva tarea" onClose={onClose} footer={<div className="flex gap-2"><button className="btn-secondary flex-1" onClick={onClose}>Cancelar</button><button className="btn flex-1" disabled={busy} onClick={save}>{busy ? "Guardando…" : "Crear tarea"}</button></div>}>
      <div className="space-y-4">
        {!storeId && <div><span className="label">Tienda</span><StorePicker value={store} onChange={setStore} /></div>}
        <label className="block"><span className="label">Qué hay que hacer</span>
          <select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{TASK_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="block"><span className="label">Título (opcional)</span><input className="input" maxLength={160} placeholder={taskKindName(f.kind)} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label className="block"><span className="label">Detalle</span><textarea className="input min-h-24" maxLength={2000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="label">Prioridad</span>
            <select className="input" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option></select></label>
          <label className="block"><span className="label">Fecha límite</span><input type="date" className="input" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></label>
        </div>
        {canAssign && (
          <label className="block"><span className="label">Asignar a</span>
            <select className="input" value={f.assign} onChange={(e) => setF({ ...f, assign: e.target.value })}>
              <option value="">Sin asignar</option>
              {assignable.length > 0 && <optgroup label="Personas">{assignable.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.name} · {roleShort(p.role)}</option>)}</optgroup>}
              {companies.length > 0 && <optgroup label="Empresas de servicio">{companies.map((c) => <option key={c.id} value={`c:${c.id}`}>{c.name}</option>)}</optgroup>}
            </select></label>
        )}
        {err && <p className="field-error" role="alert">{err}</p>}
      </div>
    </Sheet>
  );
}

function TaskDetail({ task, me, who, comp, store, people, companies, onClose }: {
  task: TaskRow; me: Me; who: Map<string, Person>; comp: Map<string, string>; store?: { name: string; town: string | null }; people: Person[]; companies: { id: string; name: string }[]; onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [events, setEvents] = useState<{ id: string; kind: string; from_status: string | null; to_status: string | null; note: string | null; actor: string; created_at: string }[] | null>(null);
  const [assign, setAssign] = useState(task.assignee_id ? `p:${task.assignee_id}` : task.company_id ? `c:${task.company_id}` : "");
  const sb = supabaseBrowser();
  useEffect(() => {
    if (events !== null) return;
    sb.from("task_events").select("id,kind,from_status,to_status,note,actor,created_at").eq("task_id", task.id).order("created_at").then(({ data }: { data: typeof events }) => setEvents(data ?? []));
  }, [events, sb, task.id]);
  const mineNow = task.assignee_id === me.id || (task.company_id && task.company_id === me.orgId);
  const canValidate = can(me.perms, "tareas.validar");
  const canAssign = can(me.perms, "tareas.asignar");
  async function patch(values: Record<string, unknown>, msg: string) {
    setBusy(true);
    const { error } = await sb.from("tasks").update(values).eq("id", task.id);
    if (!error && note.trim()) await sb.from("task_events").insert({ task_id: task.id, kind: "comentario", note: note.trim() });
    setBusy(false);
    if (error) return toast(error.message.includes("permiso") || error.message.includes("Solo") ? error.message : "No se pudo guardar: " + error.message, "error");
    toast(msg); router.refresh(); onClose();
  }
  async function comment() {
    if (!note.trim()) return;
    setBusy(true);
    const { error } = await sb.from("task_events").insert({ task_id: task.id, kind: "comentario", note: note.trim() });
    setBusy(false);
    if (error) return toast(error.message, "error");
    setNote(""); setEvents(null);
  }
  const s = task.status;
  const actions: { label: string; to: string; primary?: boolean; danger?: boolean }[] = [];
  if (mineNow && ["pendiente", "asignada", "rechazada"].includes(s)) actions.push({ label: "Empezar", to: "en_curso" });
  if (mineNow && ["pendiente", "asignada", "en_curso", "rechazada"].includes(s)) actions.push({ label: "Marcar como hecha", to: "pendiente_validacion", primary: true });
  if (canValidate && s === "pendiente_validacion") { actions.push({ label: "Validar", to: "validada", primary: true }); actions.push({ label: "Rechazar", to: "rechazada", danger: true }); }
  if ((canAssign || task.created_by === me.id) && !["validada", "cancelada"].includes(s)) actions.push({ label: "Cancelar tarea", to: "cancelada", danger: true });
  const nameOf = (id: string) => who.get(id)?.name ?? (id === me.id ? "Tú" : "Otra persona");
  return (
    <Sheet title={task.title} subtitle={`${taskKindName(task.kind)} · ${store?.name ?? "Tienda"}`} onClose={onClose}
      footer={actions.length ? <div className="flex flex-wrap gap-2">{actions.map((a) => <button key={a.to} disabled={busy} className={clsx("flex-1", a.primary ? "btn" : a.danger ? "btn-secondary !text-red-700" : "btn-secondary")} onClick={() => patch({ status: a.to }, a.to === "validada" ? "Tarea validada" : a.to === "pendiente_validacion" ? "Enviada para validar" : "Tarea actualizada")}>{a.label}</button>)}</div> : undefined}>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-1.5">
          <span className={clsx("badge", TASK_STATUS[s]?.tone)}>{TASK_STATUS[s]?.label}</span>
          <span className={clsx("badge", PRIO[task.priority])}>Prioridad {task.priority}</span>
          {task.due_date && <span className="badge bg-slate-100 text-slate-700">Hasta el {dmy(task.due_date)}</span>}
        </div>
        {task.description && <p className="whitespace-pre-wrap text-slate-700">{task.description}</p>}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          <dt className="text-slate-500">Tienda</dt><dd><Link className="link" href={`/stores/${task.store_id}`}>{store?.name ?? "Abrir ficha"}</Link>{store?.town ? ` · ${store.town}` : ""}</dd>
          <dt className="text-slate-500">Asignada a</dt><dd>{task.assignee_id ? nameOf(task.assignee_id) : task.company_id ? comp.get(task.company_id) ?? "Empresa externa" : "Sin asignar"}</dd>
          <dt className="text-slate-500">Creada por</dt><dd>{nameOf(task.created_by)} · {dmy(task.created_at.slice(0, 10))}</dd>
        </dl>
        {canAssign && !["validada", "cancelada"].includes(s) && (
          <div className="flex gap-2">
            <select className="input" value={assign} onChange={(e) => setAssign(e.target.value)} aria-label="Reasignar">
              <option value="">Sin asignar</option>
              <optgroup label="Personas">{people.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.name} · {roleShort(p.role)}</option>)}</optgroup>
              {companies.length > 0 && <optgroup label="Empresas de servicio">{companies.map((c) => <option key={c.id} value={`c:${c.id}`}>{c.name}</option>)}</optgroup>}
            </select>
            <button className="btn-secondary shrink-0" disabled={busy || assign === (task.assignee_id ? `p:${task.assignee_id}` : task.company_id ? `c:${task.company_id}` : "")}
              onClick={() => { const [k, id] = assign.split(":"); patch({ assignee_id: k === "p" ? id : null, company_id: k === "c" ? id : null, status: assign ? (s === "pendiente" ? "asignada" : s) : "pendiente" }, "Tarea reasignada"); }}>Reasignar</button>
          </div>
        )}
        <div>
          <h3 className="t-section mb-2 !text-sm">Historial</h3>
          {events === null ? <div className="skeleton h-16" /> : (
            <ol className="space-y-2 border-l-2 border-slate-200 pl-3">
              {events.map((e) => (
                <li key={e.id} className="text-[13px]">
                  <span className="text-slate-500">{new Date(e.created_at).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" })} · {nameOf(e.actor)}</span>
                  <span className="block">{e.kind === "alta" ? "Creó la tarea" : e.kind === "estado" ? `${TASK_STATUS[e.from_status ?? ""]?.label ?? e.from_status} → ${TASK_STATUS[e.to_status ?? ""]?.label ?? e.to_status}` : e.kind === "asignacion" ? `Asignó a ${e.note}` : e.note}</span>
                </li>
              ))}
            </ol>
          )}
          <div className="mt-3 flex gap-2">
            <input className="input" placeholder="Añadir comentario…" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn-secondary shrink-0" disabled={busy || !note.trim()} onClick={comment}>Añadir</button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
