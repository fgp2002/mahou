import { NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";

export const maxDuration = 30;
const Body = z.object({ brand_key: z.string().trim().min(1).max(80), url: z.string().url().max(500) });
const OK = new Map([["image/png", "png"], ["image/jpeg", "jpg"], ["image/webp", "webp"]]);

function blockedHost(h: string): boolean {
  const host = h.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) return true; // sin IP literales
  return false;
}

/** IPs privadas, de bucle local o de enlace local: nunca se descargan (evita SSRF). */
function privateIp(ip: string): boolean {
  if (ip.includes(":")) return ip === "::1" || /^f[cd]/i.test(ip) || /^fe80/i.test(ip) || ip.startsWith("::ffff:");
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/** Descarga un logotipo desde una URL que el usuario indica y lo guarda una sola vez para esa enseña. */
export async function POST(req: Request) {
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(p.data.url);
  if (url.protocol !== "https:" || blockedHost(url.hostname)) return NextResponse.json({ error: "Solo se admiten direcciones https públicas." }, { status: 400 });

  try {
    const ips = await lookup(url.hostname, { all: true });
    if (!ips.length || ips.some((x) => privateIp(x.address))) return NextResponse.json({ error: "Solo se admiten direcciones https públicas." }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "No se encontró esa dirección." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10000), headers: { "User-Agent": "MahouLogoFetcher/1.0" } });
  } catch {
    return NextResponse.json({ error: "No se pudo descargar esa dirección (¿redirige a otra web?). Prueba a subir el archivo." }, { status: 502 });
  }
  if (!res.ok) return NextResponse.json({ error: `La web respondió ${res.status}.` }, { status: 502 });
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const ext = OK.get(type);
  if (!ext) return NextResponse.json({ error: "Debe ser una imagen PNG, JPG o WebP (no SVG)." }, { status: 415 });
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > 1_000_000) return NextResponse.json({ error: "La imagen pesa más de 1 MB." }, { status: 413 });

  const key = p.data.brand_key.toUpperCase();
  const path = `${u.user.id}/${crypto.randomUUID()}.${ext}`;
  const up = await sb.storage.from("brand-logos").upload(path, buf, { contentType: type, cacheControl: "31536000" });
  if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });
  const { data: old } = await sb.from("brand_logos").select("storage_path").eq("brand_key", key).maybeSingle();
  const { error } = await sb.from("brand_logos").upsert({ owner_id: u.user.id, brand_key: key, storage_path: path, source: url.hostname }, { onConflict: "owner_id,brand_key" });
  if (error) { await sb.storage.from("brand-logos").remove([path]); return NextResponse.json({ error: error.message }, { status: 500 }); }
  if (old?.storage_path) await sb.storage.from("brand-logos").remove([old.storage_path]);
  return NextResponse.json({ ok: true, path });
}
