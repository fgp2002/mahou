import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { geocodeOne } from "@/lib/server/geocode";

export const maxDuration = 60;

/** Geocodifica un lote de tiendas pendientes. El cliente repite la llamada hasta que `remaining` sea 0. */
export async function POST(req: Request) {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) return NextResponse.json({ error: "Falta GOOGLE_API_KEY" }, { status: 500 });
  const body = await req.json().catch(() => ({}));
  const retryFailed = !!body.retryFailed;
  const sb = await supabaseServer();

  const statuses = retryFailed ? ["pending", "failed"] : ["pending"];
  const { data: batch, error } = await sb
    .from("stores").select("id,address,town,postal_code,province").in("geocode_status", statuses).is("lat", null).eq("active", true).limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const t0 = Date.now();
  let ok = 0, partial = 0, failed = 0;
  const errors: string[] = [];
  for (const s of batch ?? []) {
    if (Date.now() - t0 > 45000) break;
    try {
      const g = await geocodeOne(s, key);
      const upd: Record<string, unknown> = { geocode_status: g.status, geocode_provider: "google", geocoded_at: new Date().toISOString(), geocode_formatted: g.formatted ?? null, geocode_place_id: g.placeId ?? null };
      if (g.status !== "failed") { upd.lat = g.lat; upd.lng = g.lng; }
      await sb.from("stores").update(upd).eq("id", s.id);
      if (g.status === "ok") ok++; else if (g.status === "partial") partial++; else { failed++; if (g.error && errors.length < 3) errors.push(g.error); }
      // Si la clave está mal configurada, no seguimos quemando peticiones.
      if (g.error && /REQUEST_DENIED|OVER_QUERY_LIMIT|API key/i.test(g.error)) {
        await sb.from("stores").update({ geocode_status: "pending", geocode_provider: null, geocoded_at: null }).eq("id", s.id);
        return NextResponse.json({ error: g.error, ok, partial, failed: failed - 1, remaining: -1 }, { status: 502 });
      }
    } catch (e) {
      failed++;
      errors.push((e as Error).message);
    }
  }
  const { count } = await sb.from("stores").select("id", { count: "exact", head: true }).eq("geocode_status", "pending").is("lat", null).eq("active", true);
  return NextResponse.json({ ok, partial, failed, remaining: count ?? 0, errors });
}
