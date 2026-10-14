-- Trazado de la ruta por carretera para la vista previa. Aplicada en Supabase.
alter table public.routes
  add column if not exists polyline text,
  add column if not exists start_lat double precision,
  add column if not exists start_lng double precision;
