/** Clave estable de una enseña: mayúsculas y sin espacios sobrantes. */
export function brandKey(banner: string | null | undefined): string | null {
  const k = (banner ?? "").replace(/\s+/g, " ").trim().toUpperCase();
  return k || null;
}

export function logoUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/brand-logos/${path}`;
}
