import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { VisitRunner, type PhotoView } from "@/components/VisitRunner";
import { PageHeader } from "@/components/ui";
import type { PhotoTag } from "@/components/PhotoTags";
import type { VisitPayment } from "@/components/VisitPayments";
import { loadPaymentTypes } from "@/lib/server/load";
import { suggestNextVisit } from "@/lib/domain/periodicity";
import { madridDate } from "@/lib/domain/dates";
import type { Visit } from "@/lib/types";

export default async function VisitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();
  const { data: visit } = await sb.from("visits").select("*").eq("id", id).maybeSingle();
  if (!visit) notFound();
  const types = await loadPaymentTypes();
  const [{ data: store }, { data: contacts }, { data: concepts }, { data: ph }, { data: tagRows }] = await Promise.all([
    sb.from("stores").select("id,name,frequency").eq("id", visit.store_id).single(),
    sb.from("store_contacts").select("*").eq("store_id", visit.store_id),
    sb.from("payment_concepts").select("*").eq("store_id", visit.store_id).eq("status", "activo"),
    sb.from("visit_photos").select("id,storage_path,caption").eq("visit_id", id).order("created_at"),
    sb.from("photo_tags").select("id,kind,name").order("name"),
  ]);
  const { data: pays } = await sb.from("payment_records").select("id,payment_type_id,concept,concept_name,amount,status,payment_date,is_demo,brand_id,brand_name").eq("visit_id", id).order("created_at");
  const photoIds = (ph ?? []).map((p) => p.id);
  const { data: links } = photoIds.length ? await sb.from("visit_photo_tags").select("photo_id,tag_id").in("photo_id", photoIds) : { data: [] };
  const tagsByPhoto = new Map<string, string[]>();
  for (const l of links ?? []) tagsByPhoto.set(l.photo_id, [...(tagsByPhoto.get(l.photo_id) ?? []), l.tag_id]);
  const paths = (ph ?? []).map((p) => p.storage_path);
  const { data: signed } = paths.length ? await sb.storage.from("visit-photos").createSignedUrls(paths, 3600) : { data: [] };
  const urlByPath = new Map((signed ?? []).map((x) => [x.path, x.signedUrl]));
  const photos: PhotoView[] = (ph ?? []).map((p) => ({ id: p.id, url: urlByPath.get(p.storage_path) ?? null, caption: p.caption, tagIds: tagsByPhoto.get(p.id) ?? [] }));
  return (
    <div>
      <PageHeader title="Visita">
        <Link href={`/stores/${visit.store_id}`} className="btn-secondary">Ver tienda</Link>
      </PageHeader>
      <VisitRunner visit={visit as Visit} storeName={store?.name ?? ""} contacts={contacts ?? []} concepts={concepts ?? []} photos={photos} types={types} tags={(tagRows ?? []) as PhotoTag[]} payments={(pays ?? []) as VisitPayment[]} suggestedNext={store ? suggestNextVisit(store.frequency as "semanal", madridDate()) : null} />
    </div>
  );
}
