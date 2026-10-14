import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";

export const maxDuration = 60;

const Row = z.object({
  source_id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  banner: z.string().nullish(), chain: z.string().nullish(), macro_chain: z.string().nullish(), store_type: z.string().nullish(),
  area: z.string().nullish(), kam: z.string().nullish(), address: z.string().nullish(), town: z.string().nullish(),
  postal_code: z.string().nullish(), province: z.string().nullish(), gpv: z.string().nullish(), nielsen_code: z.string().nullish(),
  frequency: z.enum(["semanal", "quincenal", "mensual", "ninguna"]).optional(),
  audit: z.boolean().optional(),
  active: z.boolean().optional(),
});
const Body = z.object({ filename: z.string().optional(), dryRun: z.boolean().default(false), rows: z.array(z.unknown()).max(5000) });
const FIELDS = ["name", "banner", "chain", "macro_chain", "store_type", "area", "kam", "address", "town", "postal_code", "province", "gpv", "nielsen_code", "frequency", "audit", "active"] as const;

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Formato no válido" }, { status: 400 });
  const { rows, dryRun, filename } = parsed.data;

  const errors: { row: number; error: string }[] = [];
  const seen = new Set<string>();
  const valid: z.infer<typeof Row>[] = [];
  let duplicatesInFile = 0;
  rows.forEach((r, i) => {
    const p = Row.safeParse(r);
    if (!p.success) return errors.push({ row: i + 2, error: p.error.issues.map((x) => x.path.join(".") + ": " + x.message).join("; ") });
    if (seen.has(p.data.source_id)) { duplicatesInFile++; return; }
    seen.add(p.data.source_id);
    valid.push(p.data);
  });

  const sb = await supabaseServer();
  const existing = new Map<string, { id: string; manual_overrides: string[]; [k: string]: unknown }>();
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from("stores").select("*").not("source_id", "is", null).range(from, from + 999);
    for (const s of data ?? []) existing.set(s.source_id, s);
    if (!data || data.length < 1000) break;
  }

  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: { id: string; patch: Record<string, unknown> }[] = [];
  let unchanged = 0;
  for (const r of valid) {
    const ex = existing.get(r.source_id);
    if (!ex) { toInsert.push({ ...r, source_data: r }); continue; }
    const patch: Record<string, unknown> = {};
    for (const f of FIELDS) {
      if ((ex.manual_overrides ?? []).includes(f)) continue; // lo editado a mano se respeta
      const nv = r[f] === undefined ? undefined : r[f] ?? null;
      if (nv === undefined) continue;
      if ((ex[f] ?? null) !== nv) patch[f] = nv;
    }
    if (Object.keys(patch).length) {
      // Si cambia la dirección, hay que volver a geocodificar.
      if ("address" in patch || "town" in patch || "postal_code" in patch) { patch.geocode_status = "pending"; patch.lat = null; patch.lng = null; }
      toUpdate.push({ id: ex.id, patch });
    } else unchanged++;
  }

  const summary = { total: rows.length, valid: valid.length, inserted: toInsert.length, updated: toUpdate.length, unchanged, duplicatesInFile, errors: errors.length };
  if (dryRun) return NextResponse.json({ dryRun: true, summary, errors: errors.slice(0, 50) });

  for (let i = 0; i < toInsert.length; i += 200) {
    const { error } = await sb.from("stores").insert(toInsert.slice(i, i + 200));
    if (error) return NextResponse.json({ error: error.message, summary }, { status: 500 });
  }
  for (const u of toUpdate) {
    const { error } = await sb.from("stores").update(u.patch).eq("id", u.id);
    if (error) errors.push({ row: 0, error: error.message });
  }
  await sb.from("import_runs").insert({ filename: filename ?? null, inserted: toInsert.length, updated: toUpdate.length, skipped: unchanged + duplicatesInFile, errors });
  return NextResponse.json({ dryRun: false, summary, errors: errors.slice(0, 50) });
}
