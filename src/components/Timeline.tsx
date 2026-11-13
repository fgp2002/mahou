import Link from "next/link";
import { AlertTriangle, Box, Camera, ClipboardCheck, FileSignature, Image as ImageIcon, Wallet, Pencil } from "lucide-react";
import type { TimelineItem, TimelineKind } from "@/lib/server/timeline";
import { dmy } from "@/lib/format";

const ICON: Record<TimelineKind, typeof Box> = { visita: ClipboardCheck, foto: Camera, lineal: ImageIcon, pago: Wallet, acuerdo: FileSignature, elemento: Box, incidencia: AlertTriangle, cambio: Pencil };
const TONE: Record<TimelineKind, string> = {
  visita: "bg-slate-900 text-slate-50", foto: "bg-slate-200 text-slate-700", lineal: "bg-slate-200 text-slate-700", pago: "bg-st-ok text-[#fff]",
  acuerdo: "bg-brand-50 text-brand-700", elemento: "bg-brand-600 text-[rgb(var(--on-accent))]", incidencia: "bg-st-late text-[#fff]", cambio: "bg-slate-100 text-slate-600",
};

/** Cronología: un día por bloque, cada suceso con su icono y enlace a su información original. */
export function Timeline({ items, empty = "Todavía no hay actividad registrada." }: { items: TimelineItem[]; empty?: string }) {
  if (!items.length) return <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">{empty}</p>;
  const days: [string, TimelineItem[]][] = [];
  for (const it of items) { const last = days.at(-1); if (last && last[0] === it.date) last[1].push(it); else days.push([it.date, [it]]); }
  return (
    <ol className="space-y-4">
      {days.map(([d, xs]) => (
        <li key={d}>
          <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">{dmy(d)}</div>
          <ul className="space-y-1">
            {xs.map((it) => {
              const I = ICON[it.kind];
              return (
                <li key={it.key}>
                  <Link href={it.href} scroll={false} className="row-link -mx-2 flex min-h-12 items-center gap-3 rounded-xl px-2 py-1.5">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${TONE[it.kind]}`}><I size={15} /></span>
                    <span className="min-w-0 flex-1 text-sm"><span className="block truncate font-medium">{it.title}</span>{it.detail && <span className="block truncate text-xs text-slate-500">{it.detail}</span>}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ol>
  );
}
