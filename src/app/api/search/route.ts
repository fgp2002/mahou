import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { INCIDENT_TYPE_LABEL, type IncidentType } from "@/lib/incidents";

export interface SearchHit { group: string; id: string; title: string; sub: string; href: string }

/** Búsqueda global: tiendas, cadenas, contactos, pagos, acuerdos, elementos, visitas e incidencias. */
export async function GET(req: Request) {
  const raw = (new URL(req.url).searchParams.get("q") ?? "").trim();
  // Se quitan los caracteres que rompen el filtro «or» de PostgREST.
  const term = raw.replace(/[%,()*\\]/g, " ").replace(/\s+/g, " ").trim();
  if (term.length < 2) return NextResponse.json({ hits: [] });
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const like = `%${term}%`;
  const L = 6;

  const [stores, chains, contacts, pays, ags, eq, visits, incs] = await Promise.all([
    sb.from("stores").select("id,name,town,banner,address").eq("active", true).or(`name.ilike.${like},town.ilike.${like},banner.ilike.${like},address.ilike.${like},source_id.ilike.${like},chain.ilike.${like}`).order("name").limit(L),
    sb.from("stores").select("chain").eq("active", true).ilike("chain", like).limit(200),
    sb.from("store_contacts").select("id,store_id,full_name,role,phone").or(`full_name.ilike.${like},phone.ilike.${like},email.ilike.${like},role.ilike.${like}`).limit(L),
    sb.from("payment_records").select("id,store_id,concept_name,brand_name,amount,payment_date").is("deleted_at", null).or(`concept_name.ilike.${like},brand_name.ilike.${like},notes.ilike.${like}`).order("payment_date", { ascending: false }).limit(L),
    sb.from("agreements").select("id,store_id,title,status,end_date").is("deleted_at", null).or(`title.ilike.${like},notes.ilike.${like}`).limit(L),
    sb.from("store_equipment").select("id,store_id,code,name,brand_name,location").is("deleted_at", null).or(`code.ilike.${like},name.ilike.${like},brand_name.ilike.${like},location.ilike.${like}`).limit(L),
    sb.from("visits").select("id,store_id,visit_date,notes,result").or(`notes.ilike.${like},result.ilike.${like},contact_name_snapshot.ilike.${like}`).order("visit_date", { ascending: false }).limit(L),
    sb.from("incidents").select("id,store_id,type,description,status").is("deleted_at", null).or(`description.ilike.${like},resolution.ilike.${like}`).limit(L),
  ]);

  // Nombres de tienda para dar contexto al resto de resultados.
  const ids = new Set<string>();
  for (const r of [contacts, pays, ags, eq, visits, incs]) for (const x of (r.data ?? []) as { store_id: string }[]) ids.add(x.store_id);
  const { data: names } = ids.size ? await sb.from("stores").select("id,name").in("id", [...ids]) : { data: [] };
  const nm = new Map((names ?? []).map((s) => [s.id, s.name as string]));
  const store = (id: string) => nm.get(id) ?? "Tienda";
  const fmtD = (d: string | null) => (d ? d.split("-").reverse().join("/") : "");
  const eur = (n: number) => Number(n).toLocaleString("es-ES", { style: "currency", currency: "EUR" });

  const hits: SearchHit[] = [];
  for (const s of stores.data ?? []) hits.push({ group: "Tiendas", id: s.id, title: s.name, sub: [s.banner, s.town].filter(Boolean).join(" · "), href: `/stores/${s.id}` });
  const chainCount = new Map<string, number>();
  for (const c of chains.data ?? []) if (c.chain) chainCount.set(c.chain, (chainCount.get(c.chain) ?? 0) + 1);
  for (const [c, n] of [...chainCount].slice(0, 4)) hits.push({ group: "Cadenas", id: c, title: c, sub: `${n} tienda${n === 1 ? "" : "s"}`, href: `/stores?chain=${encodeURIComponent(c)}` });
  for (const c of contacts.data ?? []) hits.push({ group: "Contactos", id: c.id, title: c.full_name, sub: [c.role, store(c.store_id), c.phone].filter(Boolean).join(" · "), href: `/stores/${c.store_id}?tab=contactos` });
  for (const e of eq.data ?? []) hits.push({ group: "Elementos", id: e.id, title: `${e.code ?? ""} ${e.name ?? ""}`.trim() || "Elemento", sub: [store(e.store_id), e.brand_name, e.location].filter(Boolean).join(" · "), href: `/stores/${e.store_id}?tab=inventario&eq=${e.id}` });
  for (const p of pays.data ?? []) hits.push({ group: "Pagos", id: p.id, title: `${p.concept_name ?? "Pago"} · ${eur(p.amount)}`, sub: [store(p.store_id), fmtD(p.payment_date)].join(" · "), href: `/stores/${p.store_id}?tab=pagos&pay=${p.id}` });
  for (const a of ags.data ?? []) hits.push({ group: "Acuerdos", id: a.id, title: a.title || "Acuerdo", sub: [store(a.store_id), a.end_date ? `hasta ${fmtD(a.end_date)}` : ""].filter(Boolean).join(" · "), href: `/stores/${a.store_id}?tab=pagos&ag=${a.id}` });
  for (const v of visits.data ?? []) hits.push({ group: "Visitas", id: v.id, title: `${store(v.store_id)} · ${fmtD(v.visit_date)}`, sub: (v.notes || v.result || "").slice(0, 90), href: `/visits/${v.id}` });
  for (const i of incs.data ?? []) hits.push({ group: "Incidencias", id: i.id, title: `${store(i.store_id)} · ${INCIDENT_TYPE_LABEL[i.type as IncidentType] ?? i.type}`, sub: (i.description ?? "").slice(0, 90), href: `/stores/${i.store_id}?tab=incidencias&inc=${i.id}` });
  return NextResponse.json({ hits });
}
