"use client";
import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { kv } from "@/lib/offline/db";
import { flush, onOutboxChange, pending } from "@/lib/offline/outbox";
import { toast } from "./Toast";

/** Pide al service worker que guarde estas páginas para poder abrirlas sin red. */
export function warmPages(urls: string[]) {
  if (typeof navigator === "undefined" || !navigator.serviceWorker?.controller) return;
  navigator.serviceWorker.controller.postMessage({ type: "warm", urls });
}

/**
 * Modo sin conexión: registra el service worker, guarda en el móvil los datos de consulta
 * (tiendas, tipos de pago, marcas) y envía la cola de cambios pendientes al volver la red.
 */
export function OfflineManager() {
  const [online, setOnline] = useState(true);
  const [queue, setQueue] = useState({ total: 0, failed: 0 });
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);

    const refresh = () => pending().then(setQueue);
    const sync = async () => {
      if (!navigator.onLine) return;
      const before = await pending();
      if (!before.total) return;
      setSyncing(true);
      const n = await flush();
      setSyncing(false);
      if (n) toast(`Sincronizado: ${n} cambio${n === 1 ? "" : "s"} enviado${n === 1 ? "" : "s"}`);
      refresh();
    };
    const cacheData = async () => {
      if (!navigator.onLine) return;
      const sb = supabaseBrowser();
      const [{ data: u }, { data: stores }, { data: types }, { data: brands }] = await Promise.all([
        sb.auth.getUser(),
        sb.from("stores").select("id,name,town,lat,lng").eq("active", true).order("name").limit(5000),
        sb.from("payment_types").select("id,code,name,default_amount,active").order("sort_order"),
        sb.from("payment_brands").select("id,name").eq("active", true).order("name"),
      ]);
      if (u.user) await kv.set("uid", u.user.id);
      if (stores) await kv.set("stores", stores);
      if (types) await kv.set("types", types);
      if (brands) await kv.set("brands", brands);
      warmPages(["/", "/offline/visit"]);
    };

    const goOnline = () => { setOnline(true); sync(); };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const off = onOutboxChange(refresh);
    refresh();
    sync();
    cacheData();
    const t = setInterval(sync, 60000);
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); off(); clearInterval(t); };
  }, []);

  if (online && !queue.total) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(0.5rem,env(safe-area-inset-top))] z-[85] flex justify-center px-4" role="status" aria-live="polite">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-slate-800 px-3.5 py-1.5 text-xs font-semibold text-slate-50 shadow-pop">
        {!online ? <><CloudOff size={14} /> Sin conexión{queue.total ? ` · ${queue.total} cambio${queue.total === 1 ? "" : "s"} guardado${queue.total === 1 ? "" : "s"} en el móvil` : ""}</>
          : <><RefreshCw size={14} className={syncing ? "animate-spin" : ""} /> {syncing ? "Sincronizando…" : `${queue.total} pendiente${queue.total === 1 ? "" : "s"} de enviar`}{queue.failed ? ` (${queue.failed} con error)` : ""}
            {!syncing && <button className="ml-1 underline" onClick={() => { setSyncing(true); flush().then(() => { setSyncing(false); pending().then(setQueue); }); }}>Reintentar</button>}</>}
      </div>
    </div>
  );
}
