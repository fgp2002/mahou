"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Images, Maximize2, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { resizeImage } from "@/lib/image";
import { toast } from "./Toast";

/** Foto del lineal de la tienda: solo se guarda la última; al subir otra, la anterior se borra. */
export function StoreLineal({ storeId, path, url, updatedAt }: { storeId: string; path: string | null; url: string | null; updatedAt: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [big, setBig] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("Elige una imagen", "error");
    setBusy(true);
    setPreview(URL.createObjectURL(file));
    try {
      const sb = supabaseBrowser();
      const { data: u } = await sb.auth.getUser();
      if (!u.user) throw new Error("Sesión caducada");
      const blob = await resizeImage(file, 2000, 0.85);
      const newPath = `${u.user.id}/lineal/${storeId}-${crypto.randomUUID()}.jpg`;
      const up = await sb.storage.from("visit-photos").upload(newPath, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
      if (up.error) throw up.error;
      const r = await sb.from("stores").update({ lineal_path: newPath, lineal_updated_at: new Date().toISOString() }).eq("id", storeId);
      if (r.error) { await sb.storage.from("visit-photos").remove([newPath]); throw r.error; }
      // La foto anterior se borra: solo se conserva la última.
      if (path) await sb.storage.from("visit-photos").remove([path]);
      toast("Foto del lineal guardada");
      router.refresh();
    } catch (e) {
      setPreview(null);
      toast("No se pudo subir la foto: " + (e as Error).message, "error");
    }
    setBusy(false);
  }

  const shown = preview ?? url;
  const when = updatedAt ? new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(updatedAt)) : null;

  return (
    <div className="space-y-3">
      {shown ? (
        <button type="button" onClick={() => setBig(true)} className="tap relative block w-full overflow-hidden rounded-xl bg-slate-100" aria-label="Ver la foto del lineal en grande">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shown} alt="Lineal de la tienda" className={`max-h-80 w-full object-contain ${busy ? "opacity-60" : ""}`} />
          <span className="absolute right-2 top-2 rounded-full bg-black/55 p-1.5 text-white"><Maximize2 size={14} /></span>
        </button>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">Todavía no hay foto del lineal de esta tienda.</p>
      )}
      {when && !busy && <p className="text-xs text-slate-500">Última foto: {when}. Si subes otra, esta se borra.</p>}
      {busy && <p className="text-xs text-slate-500">Subiendo…</p>}
      <div className="grid grid-cols-2 gap-2">
        <label className={`btn cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}>
          <Camera size={16} /> {shown ? "Nueva foto" : "Hacer foto"}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <label className={`btn-secondary cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}>
          <Images size={16} /> Galería
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
      </div>
      {big && shown && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 p-3" onClick={() => setBig(false)} role="dialog" aria-label="Foto del lineal">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shown} alt="Lineal de la tienda" className="max-h-full max-w-full object-contain" />
          <button className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] rounded-full bg-white/15 p-2 text-white" aria-label="Cerrar"><X size={20} /></button>
        </div>
      )}
    </div>
  );
}
