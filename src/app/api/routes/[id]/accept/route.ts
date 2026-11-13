import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/** Acepta una ruta y crea una visita «planificada» por cada parada (sin duplicar). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  // La ruta puede ser de otra persona del equipo (lo controla la base de datos); los datos son de la organización.
  const { data: route } = await sb.from("routes").select("id,route_date,status,owner_id,user_id").eq("id", id).single();
  if (!route) return NextResponse.json({ error: "Ruta no encontrada" }, { status: 404 });
  const owner: string = route.owner_id;
  if (route.status === "completed") return NextResponse.json({ error: "La ruta ya está completada" }, { status: 409 });

  const { data: stops } = await sb.from("route_stops").select("id,store_id,planned_minutes").eq("route_id", id).eq("owner_id", owner);
  const ids = (stops ?? []).map((s) => s.id);
  const { data: have } = ids.length ? await sb.from("visits").select("route_stop_id").eq("owner_id", owner).in("route_stop_id", ids) : { data: [] };
  const haveSet = new Set((have ?? []).map((v) => v.route_stop_id));
  const rows = (stops ?? []).filter((s) => !haveSet.has(s.id)).map((s) => ({
    owner_id: owner, store_id: s.store_id, route_stop_id: s.id, visit_date: route.route_date, status: "planned", visit_type: "ordinaria", planned_minutes: s.planned_minutes,
  }));
  if (rows.length) {
    const { error } = await sb.from("visits").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await sb.from("routes").update({ status: "accepted", updated_at: new Date().toISOString() }).eq("id", id);
  await sb.from("alerts").update({ resolved_at: new Date().toISOString() }).eq("owner_id", u.user.id).eq("dedupe_key", `route:${route.route_date}`);
  return NextResponse.json({ ok: true, visitsCreated: rows.length });
}
