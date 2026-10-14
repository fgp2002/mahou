-- Ruta hecha con tiendas elegidas a mano en el mapa. Aplicada en Supabase.
alter table public.routes add column if not exists selected_store_ids uuid[];
