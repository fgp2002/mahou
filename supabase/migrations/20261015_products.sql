-- Catálogo de productos (referencia, nombre, envase, capacidad, unidades por pack). Aplicada en Supabase.
create table public.products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reference text check (reference is null or length(trim(reference)) between 1 and 60),
  name text not null check (length(trim(name)) between 1 and 120),
  brand text check (brand is null or length(brand) <= 80),
  container text check (container in ('botella','lata','barril','otro')),
  capacity_ml integer check (capacity_ml is null or capacity_ml between 1 and 100000),
  pack_units integer check (pack_units is null or pack_units between 1 and 1000),
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index products_owner_ref on public.products (owner_id, lower(trim(reference))) where reference is not null;
create index products_owner on public.products (owner_id);
alter table public.products enable row level security;
create policy products_own on public.products for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
