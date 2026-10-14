import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { generateRoute } from "@/lib/server/routes";

export const maxDuration = 60;

const Body = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  replace: z.boolean().optional(),
  override: z.boolean().optional(),
  forced: z.array(z.string().uuid()).optional(),
  exclude: z.array(z.string().uuid()).optional(),
  banners: z.array(z.string().min(1).max(120)).max(60).optional(),
});

export async function POST(req: Request) {
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Petición no válida" }, { status: 400 });
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  try {
    const out = await generateRoute(sb, u.user.id, p.data.date, {
      by: "manual", replaceExisting: p.data.replace, overrideProtected: p.data.override, forcedStoreIds: p.data.forced, excludeStoreIds: p.data.exclude, banners: p.data.banners,
    });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
