"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { logoUrl } from "@/lib/brands";

// Logos de las marcas de producto (Mahou, San Miguel, Alhambra…), cargados una vez por sesión.
let cache: Map<string, string> | null = null;
let loading: Promise<Map<string, string>> | null = null;
const listeners = new Set<() => void>();

export function invalidateBrandLogos() {
  cache = null;
  loading = null;
  load().then(() => listeners.forEach((l) => l()));
}

function load(): Promise<Map<string, string>> {
  if (cache) return Promise.resolve(cache);
  loading ??= (async () => {
    const { data } = await supabaseBrowser().from("payment_brands").select("name,logo_path").not("logo_path", "is", null);
    const rows = (data ?? []) as { name: string; logo_path: string }[];
    cache = new Map(rows.map((r) => [r.name.toLowerCase(), logoUrl(r.logo_path)] as [string, string]));
    return cache;
  })();
  return loading;
}

/** Etiqueta de marca con su logo (si lo tiene). */
export function BrandBadge({ name, className = "" }: { name: string; className?: string }) {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    if (!cache) load().then(l);
    return () => { listeners.delete(l); };
  }, []);
  const src = cache?.get(name.toLowerCase());
  return (
    <span className={`badge inline-flex items-center gap-1 bg-brand-50 text-brand-700 ${className}`}>
      {src && <img src={src} alt="" className="h-3.5 w-3.5 rounded-sm bg-white object-contain" />}
      {name}
    </span>
  );
}
