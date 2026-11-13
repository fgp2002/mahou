"use client";
import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight, Plus } from "lucide-react";
import { dmy } from "@/lib/format";
import { madridDate } from "@/lib/domain/dates";
import type { Equipment } from "@/lib/equipment";
import type { PaymentType } from "@/lib/payments";
import { daysOpen, INCIDENT_TYPE_LABEL, isOpen, sortIncidents, type Incident } from "@/lib/incidents";
import { IncidentBadges, IncidentSheet } from "./IncidentSheet";

/** Incidencias de una tienda (o de todas): abiertas primero; cada fila abre su seguimiento. */
export function IncidentList({ incidents, storeId, storeNames, visitId, equipment, types, initialOpen, compact, allowNew = true }: {
  incidents: Incident[]; storeId?: string; storeNames?: Record<string, string>; visitId?: string | null; equipment?: Equipment[]; types?: PaymentType[];
  initialOpen?: string | null; compact?: boolean; allowNew?: boolean;
}) {
  const today = madridDate();
  const [open, setOpen] = useState<Incident | "new" | null>(() => incidents.find((i) => i.id === initialOpen) ?? null);
  const [showClosed, setShowClosed] = useState(false);
  const sorted = sortIncidents(incidents);
  const openOnes = sorted.filter((i) => isOpen(i.status));
  const closed = sorted.filter((i) => !isOpen(i.status));
  const current = open && open !== "new" ? open : null;

  const Row = ({ i }: { i: Incident }) => (
    <li>
      <button type="button" onClick={() => setOpen(i)} className="tap flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left">
        <AlertTriangle size={18} className={isOpen(i.status) ? "shrink-0 text-[rgb(var(--st-late))]" : "shrink-0 text-slate-300"} />
        <span className="min-w-0 flex-1">
          <b className="block truncate">{INCIDENT_TYPE_LABEL[i.type]}{storeNames && <span className="font-normal text-slate-500"> · {storeNames[i.store_id]}</span>}</b>
          {i.description && <span className="block truncate text-sm text-slate-600">{i.description}</span>}
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500"><IncidentBadges i={i} />{dmy(i.opened_on)} · {daysOpen(i, today)} d</span>
        </span>
        <ChevronRight size={16} className="shrink-0 text-slate-400" />
      </button>
    </li>
  );

  return (
    <div className="space-y-2">
      {openOnes.length === 0 && !compact && <p className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-500">No hay incidencias abiertas.</p>}
      <ul className="space-y-2">{openOnes.map((i) => <Row key={i.id} i={i} />)}</ul>
      {closed.length > 0 && !compact && (
        <>
          <button className="text-sm text-slate-500 underline" onClick={() => setShowClosed(!showClosed)}>{showClosed ? "Ocultar" : "Ver"} cerradas ({closed.length})</button>
          {showClosed && <ul className="space-y-2">{closed.map((i) => <Row key={i.id} i={i} />)}</ul>}
        </>
      )}
      {allowNew && storeId && <button className="btn-secondary w-full sm:w-auto" onClick={() => setOpen("new")}><Plus size={16} /> Incidencia</button>}
      {!storeId && compact && openOnes.length > 0 && <Link href="/incidents" className="link text-sm">Ver todas</Link>}
      {open && <IncidentSheet incident={current} storeId={current?.store_id ?? storeId!} visitId={visitId} equipment={equipment} types={types} onClose={() => setOpen(null)} />}
    </div>
  );
}
