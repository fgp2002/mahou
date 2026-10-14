"use client";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Check, AlertCircle } from "lucide-react";

type Kind = "ok" | "error";
/** Muestra un aviso breve arriba, tipo iOS. Se puede llamar desde cualquier componente de cliente. */
export function toast(message: string, kind: Kind = "ok") {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("mahou-toast", { detail: { message, kind } }));
}

export function ToastHost() {
  const [t, setT] = useState<{ message: string; kind: Kind; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ message: string; kind: Kind }>).detail;
      setT({ ...d, id: Date.now() });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setT(null), 3000);
    };
    window.addEventListener("mahou-toast", on);
    return () => { window.removeEventListener("mahou-toast", on); if (timer.current) clearTimeout(timer.current); };
  }, []);
  if (!t) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[90] flex justify-center px-4" role="status" aria-live="polite">
      <div key={t.id} className="toast-in pointer-events-auto flex max-w-sm items-center gap-2 rounded-full bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-50 shadow-[0_10px_30px_rgb(0_0_0/0.3)]">
        <span className={clsx("flex h-5 w-5 items-center justify-center rounded-full", t.kind === "ok" ? "bg-st-ok text-[#fff]" : "bg-st-late text-[#fff]")}>
          {t.kind === "ok" ? <Check size={13} strokeWidth={3} /> : <AlertCircle size={13} />}
        </span>
        <span className="min-w-0">{t.message}</span>
      </div>
    </div>
  );
}
