"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "./Toast";

/** Tirar hacia abajo desde arriba del todo para actualizar los datos. */
export function PullToRefresh() {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const y0 = useRef<number | null>(null);
  const pullRef = useRef(0);

  useEffect(() => {
    const root = document.querySelector(".scroll-root");
    if (!root) return;
    const ts = (e: Event) => { y0.current = (root as HTMLElement).scrollTop <= 0 ? (e as TouchEvent).touches[0].clientY : null; };
    const tm = (e: Event) => {
      if (y0.current == null) return;
      const d = (e as TouchEvent).touches[0].clientY - y0.current;
      if (d <= 0) { pullRef.current = 0; setPull(0); return; }
      pullRef.current = Math.min(90, d * 0.5);
      setPull(pullRef.current);
    };
    const te = () => {
      if (pullRef.current >= 60) {
        setBusy(true);
        router.refresh();
        setTimeout(() => { setBusy(false); toast("Actualizado"); }, 700);
      }
      y0.current = null; pullRef.current = 0; setPull(0);
    };
    root.addEventListener("touchstart", ts, { passive: true });
    root.addEventListener("touchmove", tm, { passive: true });
    root.addEventListener("touchend", te);
    return () => { root.removeEventListener("touchstart", ts); root.removeEventListener("touchmove", tm); root.removeEventListener("touchend", te); };
  }, [router]);

  const show = pull > 8 || busy;
  return (
    <div aria-hidden className="pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top)+4.5rem)] z-[45] -translate-x-1/2 md:hidden"
      style={{ opacity: show ? 1 : 0, transform: `translate(-50%, ${busy ? 8 : pull / 2}px)`, transition: pull ? "none" : "all 250ms var(--ease)" }}>
      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white shadow-card">
        <RefreshCw size={16} className={busy ? "animate-spin" : ""} style={{ transform: busy ? undefined : `rotate(${pull * 4}deg)` }} />
      </span>
    </div>
  );
}
