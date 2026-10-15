import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { VisitsHistory, type VisitRow } from "@/components/VisitsHistory";

export default async function VisitsPage() {
  const sb = await supabaseServer();
  const { data } = await sb
    .from("visits").select("id,visit_date,status,visit_type,duration_minutes,is_manual,result,notes,store_id,stores(name,town,banner),visit_photos(count)")
    .order("visit_date", { ascending: false }).order("created_at", { ascending: false }).limit(1000);
  const rows: VisitRow[] = ((data ?? []) as unknown as {
    id: string; visit_date: string; status: string; visit_type: string; duration_minutes: number | null; is_manual: boolean; result: string | null; notes: string | null;
    store_id: string; stores: { name: string; town: string | null; banner: string | null } | null; visit_photos: { count: number }[];
  }[]).map((v) => ({
    id: v.id, date: v.visit_date, status: v.status, type: v.visit_type, minutes: v.duration_minutes, manual: v.is_manual,
    note: v.result || v.notes || null, storeId: v.store_id, store: v.stores?.name ?? "Tienda", town: v.stores?.town ?? null, banner: v.stores?.banner ?? null,
    photos: v.visit_photos?.[0]?.count ?? 0,
  }));
  const open = rows.find((r) => r.status === "in_progress");
  return (
    <div className="space-y-4">
      <PageHeader title="Historial de visitas" count={rows.length}>
        <Link href="/visits/new" className="btn">Nueva visita</Link>
      </PageHeader>
      {open && (
        <Link href={`/visits/${open.id}`} className="card tap block border-brand-300 bg-brand-50 text-sm">
          Visita en curso: <b>{open.store}</b> — pulsa para continuar.
        </Link>
      )}
      <VisitsHistory rows={rows} />
    </div>
  );
}
