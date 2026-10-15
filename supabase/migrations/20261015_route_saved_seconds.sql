-- Tiempo ahorrado por la optimización frente al orden sin optimizar. Aplicada en Supabase.
alter table public.routes add column if not exists est_saved_seconds integer;
