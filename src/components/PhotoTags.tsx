"use client";
import { useState } from "react";
import clsx from "clsx";
import { Tag } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";

export interface PhotoTag { id: string; kind: "product" | "promo"; name: string }

const KIND_LABEL = { product: "Marca y modelo", promo: "Promoción" } as const;
const KIND_HINT = { product: "Ej.: Alhambra Verde", promo: "Ej.: Navidad, La Liga, Feria, Verano" } as const;

/** Etiquetas de una foto: marca/modelo y tipo de promoción. Sin duplicados (se ignora mayúsculas). */
export function PhotoTags({ photoId, allTags, selected, onTagCreated, onChange }: {
  photoId: string;
  allTags: PhotoTag[];
  selected: string[];
  onTagCreated: (t: PhotoTag) => void;
  onChange: (ids: string[]) => void;
}) {
  const sb = supabaseBrowser();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ product: string; promo: string }>({ product: "", promo: "" });
  const [err, setErr] = useState<string | null>(null);
  const byId = new Map(allTags.map((t) => [t.id, t]));
  const chosen = selected.map((id) => byId.get(id)).filter(Boolean) as PhotoTag[];

  async function toggle(tag: PhotoTag) {
    setErr(null);
    const on = selected.includes(tag.id);
    const r = on
      ? await sb.from("visit_photo_tags").delete().eq("photo_id", photoId).eq("tag_id", tag.id)
      : await sb.from("visit_photo_tags").insert({ photo_id: photoId, tag_id: tag.id });
    if (r.error) return setErr(r.error.message);
    onChange(on ? selected.filter((x) => x !== tag.id) : [...selected, tag.id]);
  }

  async function create(kind: "product" | "promo") {
    const name = draft[kind].trim().replace(/\s+/g, " ");
    if (!name) return;
    setErr(null);
    const existing = allTags.find((t) => t.kind === kind && t.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      setDraft({ ...draft, [kind]: "" });
      if (!selected.includes(existing.id)) await toggle(existing);
      return;
    }
    const ins = await sb.from("photo_tags").insert({ kind, name }).select("id,kind,name").single();
    if (ins.error || !ins.data) return setErr(ins.error?.message ?? "No se pudo crear la etiqueta");
    const tag = ins.data as PhotoTag;
    onTagCreated(tag);
    setDraft({ ...draft, [kind]: "" });
    const link = await sb.from("visit_photo_tags").insert({ photo_id: photoId, tag_id: tag.id });
    if (link.error) return setErr(link.error.message);
    onChange([...selected, tag.id]);
  }

  return (
    <div className="mt-1.5">
      <button type="button" onClick={() => setOpen(!open)} className="tap flex min-h-9 items-center gap-1.5 rounded-full bg-slate-100 px-3 text-xs text-slate-700">
        <Tag size={14} /> {chosen.length ? chosen.map((t) => t.name).join(" · ") : "Etiquetar"}
      </button>
      {open && (
        <div className="fade-in mt-2 space-y-3 rounded-lg border border-slate-200 p-3">
          {(["product", "promo"] as const).map((kind) => (
            <div key={kind} className="space-y-2">
              <div className="label">{KIND_LABEL[kind]}</div>
              <div className="flex flex-wrap gap-1.5">
                {allTags.filter((t) => t.kind === kind).map((t) => (
                  <button key={t.id} type="button" onClick={() => toggle(t)}
                    className={clsx("tap min-h-9 rounded-full border px-3 text-xs", selected.includes(t.id) ? "border-brand-600 bg-brand-600 text-[rgb(var(--on-accent))]" : "border-slate-300 text-slate-700")}>
                    {t.name}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input className="input" placeholder={KIND_HINT[kind]} value={draft[kind]} onChange={(e) => setDraft({ ...draft, [kind]: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); create(kind); } }} maxLength={80} />
                <button type="button" className="btn-secondary" onClick={() => create(kind)}>Añadir</button>
              </div>
            </div>
          ))}
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
      )}
    </div>
  );
}
