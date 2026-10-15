-- Miniatura de cada foto (galería y listados cargan la miniatura, no la foto completa). Aplicada en Supabase.
alter table public.visit_photos add column if not exists thumb_path text;
