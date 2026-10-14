import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase/server";
import { generateRoute, isWorkDay, loadOwnerSettings, nextWorkDay } from "@/lib/server/routes";
import { madridDate, madridHour } from "@/lib/domain/dates";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Planificación automática del día siguiente.
 * Vercel Hobby solo permite un cron diario con precisión de ±59 min y en UTC, por eso hay dos
 * programaciones (16:00 y 17:00 UTC) y este manejador solo actúa cuando en Madrid ya son las 18:00 o más.
 * Es idempotente: si ya existe una ruta para esa fecha (de cualquier estado) no hace nada.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const now = new Date();
  const hour = madridHour(now);
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1"; // solo para pruebas manuales con el secreto
  if (hour < 18 && !force) return NextResponse.json({ skipped: "Aún no son las 18:00 en Madrid", hour });

  const sb = supabaseService();
  const { data: owners } = await sb.from("user_settings").select("owner_id");
  const today = madridDate(now);
  const results: Record<string, unknown>[] = [];
  for (const o of owners ?? []) {
    try {
      const s = await loadOwnerSettings(sb, o.owner_id);
      if (!s) continue;
      const target = nextWorkDay(today, s);
      if (!isWorkDay(target, s)) { results.push({ owner: o.owner_id, skipped: "sin día laborable" }); continue; }
      const out = await generateRoute(sb, o.owner_id, target, { by: "auto" });
      results.push({ owner: o.owner_id, date: target, ...out });
    } catch (e) {
      console.error("cron plan", e);
      results.push({ owner: o.owner_id, error: (e as Error).message });
    }
  }
  return NextResponse.json({ ranAt: now.toISOString(), results });
}
