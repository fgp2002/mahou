-- Marca de cada pago (Mahou, San Miguel, Alhambra…): catálogo propio y referencia en conceptos y cobros. Aplicada en Supabase.
create table public.payment_brands (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, owner_id)
);
create unique index payment_brands_unique_name on public.payment_brands (owner_id, lower(trim(name)));
alter table public.payment_brands enable row level security;
create policy payment_brands_own on public.payment_brands for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
alter table public.payment_concepts add column if not exists brand_id uuid, add column if not exists brand_name text;
alter table public.payment_records add column if not exists brand_id uuid, add column if not exists brand_name text;
alter table public.payment_concepts add constraint payment_concepts_brand_fk foreign key (brand_id, owner_id) references public.payment_brands(id, owner_id) on delete set null (brand_id);
alter table public.payment_records add constraint payment_records_brand_fk foreign key (brand_id, owner_id) references public.payment_brands(id, owner_id) on delete set null (brand_id);
create index payment_concepts_brand on public.payment_concepts (brand_id);
create index payment_records_brand on public.payment_records (brand_id);
