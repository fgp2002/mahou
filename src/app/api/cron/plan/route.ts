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
  // Organización: los datos son del propietario; quien no es propietario planifica solo sobre su cartera.
  const [{ data: orgs }, { data: members }] = await Promise.all([
    sb.from("organizations").select("id,owner_user_id,parent_org_id"),
    sb.from("members").select("user_id,organization_id,role,status"),
  ]);
  const orgById = new Map((orgs ?? []).map((o) => [o.id as string, o as { id: string; owner_user_id: string | null; parent_org_id: string | null }]));
  const ownerOf = (orgId: string): string | null => { const o = orgById.get(orgId); if (!o) return null; return o.owner_user_id ?? (o.parent_org_id ? ownerOf(o.parent_org_id) : null); };
  const orgOwners = new Set((orgs ?? []).map((o) => o.owner_user_id).filter(Boolean));
  const memberOf = new Map((members ?? []).map((m) => [m.user_id as string, m as { user_id: string; organization_id: string; role: string; status: string }]));
  const PLANS = new Set(["gpv", "reponedor", "reponedor_conveniencia"]);
  for (const o of owners ?? []) {
    try {
      const s = await loadOwnerSettings(sb, o.owner_id);
      if (!s) continue;
      const target = nextWorkDay(today, s);
      if (!isWorkDay(target, s)) { results.push({ owner: o.owner_id, skipped: "sin día laborable" }); continue; }
      const m = memberOf.get(o.owner_id);
      const isOwner = orgOwners.has(o.owner_id) || !m;
      if (!isOwner && (m!.status !== "activo" || !PLANS.has(m!.role))) { results.push({ owner: o.owner_id, skipped: "perfil sin ruta automática" }); continue; }
      const dataOwner = isOwner ? o.owner_id : ownerOf(m!.organization_id) ?? o.owner_id;
      const out = await generateRoute(sb, o.owner_id, target, { by: "auto", dataOwner, assignedOnly: !isOwner });
      results.push({ owner: o.owner_id, date: target, ...out });
    } catch (e) {
      console.error("cron plan", e);
      results.push({ owner: o.owner_id, error: (e as Error).message });
    }
  }
  return NextResponse.json({ ranAt: now.toISOString(), results });
}
