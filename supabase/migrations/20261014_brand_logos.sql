create table if not exists public.brand_logos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  brand_key text not null check (length(btrim(brand_key)) > 0),
  storage_path text not null,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, brand_key)
);
alter table public.brand_logos enable row level security;
create policy brand_logos_own on public.brand_logos for all
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create trigger set_updated_at before update on public.brand_logos for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand-logos', 'brand-logos', true, 1048576, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

create policy brand_logos_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'brand-logos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy brand_logos_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'brand-logos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy brand_logos_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'brand-logos' and (storage.foldername(name))[1] = (select auth.uid())::text);
