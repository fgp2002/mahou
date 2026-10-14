import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { recalcRoute } from "@/lib/server/routes";

export const maxDuration = 30;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  try {
    const out = await recalcRoute(sb, u.user.id, id);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
