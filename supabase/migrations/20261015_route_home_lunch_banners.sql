-- Punto de salida (casa), pausa de comida y filtro de enseñas en rutas. Aplicada en Supabase.
alter table public.user_settings
  add column if not exists home_address text,
  add column if not exists home_lat double precision,
  add column if not exists home_lng double precision;
alter table public.routes
  add column if not exists banner_filter text[],
  add column if not exists lunch_start time,
  add column if not exists lunch_after_position integer;
