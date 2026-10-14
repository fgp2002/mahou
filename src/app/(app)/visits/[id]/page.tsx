import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { VisitRunner, type PhotoView } from "@/components/VisitRunner";
import { PageHeader } from "@/components/ui";
import type { Visit } from "@/lib/types";

export default async function VisitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();
  const { data: visit } = await sb.from("visits").select("*").eq("id", id).maybeSingle();
  if (!visit) notFound();
  const [{ data: store }, { data: contacts }, { data: concepts }, { data: ph }] = await Promise.all([
    sb.from("stores").select("id,name").eq("id", visit.store_id).single(),
    sb.from("store_contacts").select("*").eq("store_id", visit.store_id),
    sb.from("payment_concepts").select("*").eq("store_id", visit.store_id).eq("status", "activo"),
    sb.from("visit_photos").select("id,storage_path,caption").eq("visit_id", id).order("created_at"),
  ]);
  const photos: PhotoView[] = [];
  for (const p of ph ?? []) {
    const { data: s } = await sb.storage.from("visit-photos").createSignedUrl(p.storage_path, 3600);
    photos.push({ id: p.id, url: s?.signedUrl ?? null, caption: p.caption });
  }
  return (
    <div>
      <PageHeader title="Visita">
        <Link href={`/stores/${visit.store_id}`} className="btn-secondary">Ver tienda</Link>
      </PageHeader>
      <VisitRunner visit={visit as Visit} storeName={store?.name ?? ""} contacts={contacts ?? []} concepts={concepts ?? []} photos={photos} />
    </div>
  );
}
