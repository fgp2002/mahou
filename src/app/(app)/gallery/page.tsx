import { supabaseServer } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { GalleryView, type GalleryPhoto } from "@/components/GalleryView";

export const metadata = { title: "Galería · Mahou" };

export default async function GalleryPage() {
  const sb = await supabaseServer();
  const { data: rows } = await sb
    .from("visit_photos")
    .select("id,storage_path,created_at,visit_id,visits(visit_date,store_id,stores(id,name,town,banner,chain))")
    .order("created_at", { ascending: false })
    .limit(600);
  const photos = (rows ?? []) as unknown as {
    id: string; storage_path: string; created_at: string; visit_id: string;
    visits: { visit_date: string; store_id: string; stores: { id: string; name: string; town: string | null; banner: string | null; chain: string | null } | null } | null;
  }[];
  const ids = photos.map((p) => p.id);
  const [{ data: tags }, { data: links }, { data: signed }] = await Promise.all([
    sb.from("photo_tags").select("id,kind,name").order("name"),
    ids.length ? sb.from("visit_photo_tags").select("photo_id,tag_id").in("photo_id", ids) : Promise.resolve({ data: [] as { photo_id: string; tag_id: string }[] }),
    photos.length ? sb.storage.from("visit-photos").createSignedUrls(photos.map((p) => p.storage_path), 3600) : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[] }),
  ]);
  const urlByPath = new Map((signed ?? []).map((x) => [x.path, x.signedUrl]));
  const tagsByPhoto = new Map<string, string[]>();
  for (const l of links ?? []) tagsByPhoto.set(l.photo_id, [...(tagsByPhoto.get(l.photo_id) ?? []), l.tag_id]);
  const items: GalleryPhoto[] = photos.map((p) => ({
    id: p.id,
    url: urlByPath.get(p.storage_path) ?? null,
    date: p.visits?.visit_date ?? p.created_at.slice(0, 10),
    visitId: p.visit_id,
    storeId: p.visits?.stores?.id ?? "",
    store: p.visits?.stores?.name ?? "Tienda",
    town: p.visits?.stores?.town ?? "",
    banner: p.visits?.stores?.banner ?? p.visits?.stores?.chain ?? "",
    tagIds: tagsByPhoto.get(p.id) ?? [],
  }));
  return (
    <div className="space-y-4">
      <PageHeader title="Galería" />
      <GalleryView photos={items} tags={(tags ?? []) as { id: string; kind: "product" | "promo"; name: string }[]} />
    </div>
  );
}
