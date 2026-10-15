-- Material colocado en cada visita: producto del catálogo + cantidad (nombre congelado para el histórico). Aplicada en Supabase.
create table public.visit_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  visit_id uuid not null,
  product_id uuid,
  product_name text not null,
  quantity integer not null default 1 check (quantity between 1 and 100000),
  created_at timestamptz not null default now(),
  foreign key (visit_id, owner_id) references public.visits(id, owner_id) on delete cascade
);
create index visit_items_visit_owner on public.visit_items (visit_id, owner_id);
create index visit_items_product on public.visit_items (product_id);
alter table public.products add constraint products_id_owner_unique unique (id, owner_id);
alter table public.visit_items add constraint visit_items_product_fk foreign key (product_id, owner_id) references public.products(id, owner_id) on delete set null (product_id);
alter table public.visit_items enable row level security;
create policy visit_items_own on public.visit_items for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
