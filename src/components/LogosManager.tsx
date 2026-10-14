"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export interface BrandRow { key: string; stores: number; path: string | null; url: string | null; source: string | null }

async function toPng(file: File, size = 256): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, size / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Imagen no válida"))), "image/png"));
}

export function LogosManager({ brands }: { brands: BrandRow[] }) {
  const router = useRouter();
  const sb = supabaseBrowser();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const missing = brands.filter((b) => !b.url).length;

  async function setPath(key: string, path: string, source: string, oldPath: string | null) {
    const { data: u } = await sb.auth.getUser();
    const { error } = await sb.from("brand_logos").upsert({ owner_id: u.user!.id, brand_key: key, storage_path: path, source }, { onConflict: "owner_id,brand_key" });
    if (error) throw error;
    if (oldPath && oldPath !== path) {
      // Solo se borra el archivo si ninguna otra enseña lo usa (al copiar un logo se comparte el archivo).
      const { count } = await sb.from("brand_logos").select("id", { count: "exact", head: true }).eq("storage_path", oldPath);
      if (!count) await sb.storage.from("brand-logos").remove([oldPath]);
    }
  }

  async function upload(b: BrandRow, file: File | undefined) {
    if (!file) return;
    setBusy(b.key);
    setMsg(null);
    try {
      const blob = await toPng(file);
      const { data: u } = await sb.auth.getUser();
      const path = `${u.user!.id}/${crypto.randomUUID()}.png`;
      const up = await sb.storage.from("brand-logos").upload(path, blob, { contentType: "image/png", cacheControl: "31536000" });
      if (up.error) throw up.error;
      await setPath(b.key, path, "archivo subido", b.path);
      router.refresh();
    } catch (e) {
      setMsg(`${b.key}: ${(e as Error).message}`);
    }
    setBusy(null);
  }

  async function fromUrl(b: BrandRow) {
    const url = urls[b.key]?.trim();
    if (!url) return;
    setBusy(b.key);
    setMsg(null);
    const r = await fetch("/api/brand-logo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_key: b.key, url }) });
    const j = await r.json();
    setBusy(null);
    if (!r.ok) return setMsg(`${b.key}: ${j.error}`);
    setUrls({ ...urls, [b.key]: "" });
    router.refresh();
  }

  async function copyFrom(b: BrandRow, otherKey: string) {
    const o = brands.find((x) => x.key === otherKey);
    if (!o?.path) return;
    setBusy(b.key);
    try { await setPath(b.key, o.path, `copiado de ${o.key}`, b.path); router.refresh(); } catch (e) { setMsg((e as Error).message); }
    setBusy(null);
  }

  async function remove(b: BrandRow) {
    if (!b.path || !confirm(`¿Quitar el logotipo de ${b.key}?`)) return;
    setBusy(b.key);
    await sb.from("brand_logos").delete().eq("brand_key", b.key);
    const { count } = await sb.from("brand_logos").select("id", { count: "exact", head: true }).eq("storage_path", b.path);
    if (!count) await sb.storage.from("brand-logos").remove([b.path]);
    setBusy(null);
    router.refresh();
  }

  const withLogo = brands.filter((b) => b.url);
  return (
    <section className="card space-y-3">
      <h2 className="font-medium">Logotipos de enseñas</h2>
      <p className="text-sm text-slate-500">Un logotipo por enseña; se guarda una sola vez y se reutiliza en todos los pines. Faltan <b>{missing}</b> de {brands.length}. Sube un PNG/JPG/WebP o pega la dirección de la imagen. Se admiten imágenes de hasta 1 MB.</p>
      <ul className="divide-y divide-slate-200">
        {brands.map((b) => (
          <li key={b.key} className="space-y-2 py-3">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-300 bg-[#fff]">
                {b.url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={b.url} alt={`Logotipo de ${b.key}`} loading="lazy" className="h-9 w-9 object-contain" /> : <span className="text-xs text-slate-400">—</span>}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{b.key}</div>
                <div className="text-xs text-slate-500">{b.stores} tiendas{b.source ? ` · ${b.source}` : ""}</div>
              </div>
              {b.url && <button className="btn-secondary" disabled={busy === b.key} onClick={() => remove(b)}>Quitar</button>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="btn-secondary cursor-pointer">Subir archivo<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={busy === b.key} onChange={(e) => upload(b, e.target.files?.[0])} /></label>
              <input className="input min-w-0 flex-1" placeholder="o pega https://…/logo.png" value={urls[b.key] ?? ""} onChange={(e) => setUrls({ ...urls, [b.key]: e.target.value })} />
              <button className="btn-secondary" disabled={busy === b.key || !urls[b.key]} onClick={() => fromUrl(b)}>Usar</button>
              {withLogo.length > 0 && (
                <select className="input w-auto" aria-label="Copiar logotipo de otra enseña" value="" onChange={(e) => e.target.value && copyFrom(b, e.target.value)}>
                  <option value="">Copiar de…</option>
                  {withLogo.filter((o) => o.key !== b.key).map((o) => <option key={o.key} value={o.key}>{o.key}</option>)}
                </select>
              )}
            </div>
          </li>
        ))}
      </ul>
      {msg && <p className="text-sm text-red-600" role="alert">{msg}</p>}
    </section>
  );
}
