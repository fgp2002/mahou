-- Etiquetas de fotos (marca/modelo y promoción) para la Galería. Aplicada en Supabase.
create table public.photo_tags (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('product','promo')),
  name text not null check (length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (id, owner_id)
);
create unique index photo_tags_unique_name on public.photo_tags (owner_id, kind, lower(trim(name)));
create table public.visit_photo_tags (
  photo_id uuid not null references public.visit_photos(id) on delete cascade,
  tag_id uuid not null,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (photo_id, tag_id),
  foreign key (tag_id, owner_id) references public.photo_tags(id, owner_id) on delete cascade
);
create index visit_photo_tags_tag on public.visit_photo_tags (tag_id);
create index visit_photo_tags_owner on public.visit_photo_tags (owner_id);
alter table public.photo_tags enable row level security;
alter table public.visit_photo_tags enable row level security;
create policy photo_tags_own on public.photo_tags for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy visit_photo_tags_own on public.visit_photo_tags for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
