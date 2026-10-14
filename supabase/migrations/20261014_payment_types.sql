-- Tipos de pago configurables. Los registros históricos conservan un código y un nombre «congelado»,
-- así que renombrar o desactivar un tipo no altera lo ya registrado.
create table if not exists public.payment_types (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  code text not null,
  name text not null check (length(btrim(name)) between 1 and 60),
  category text,
  default_amount numeric check (default_amount is null or default_amount >= 0),
  notes text,
  active boolean not null default true,
  is_builtin boolean not null default false,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (owner_id, code)
);
create unique index if not exists payment_types_owner_name_uidx on public.payment_types (owner_id, lower(btrim(name)));
alter table public.payment_types enable row level security;
create policy payment_types_own on public.payment_types for all
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create trigger set_updated_at before update on public.payment_types for each row execute function public.set_updated_at();

-- Los códigos dejan de estar limitados a los 6 originales.
alter table public.payment_concepts drop constraint if exists payment_concepts_concept_check;
alter table public.payment_records drop constraint if exists payment_records_concept_check;
alter table public.payment_records add column if not exists concept_name text;
alter table public.payment_concepts add column if not exists payment_type_id uuid;
alter table public.payment_records add column if not exists payment_type_id uuid;

-- Siembra de los 6 tipos existentes para cada usuario con ajustes.
insert into public.payment_types (owner_id, code, name, is_builtin, sort_order)
select u.owner_id, t.code, t.name, true, t.ord
from public.user_settings u
cross join (values ('expositor','Expositor',1),('nevera','Nevera',2),('cabecera','Cabecera',3),
                   ('expositor_fijo','Expositor fijo',4),('bajo_cross','Bajo cross',5),('dispensador','Dispensador',6)) as t(code,name,ord)
on conflict (owner_id, code) do nothing;

update public.payment_concepts c set payment_type_id = t.id
from public.payment_types t where t.owner_id = c.owner_id and t.code = c.concept and c.payment_type_id is null;
update public.payment_records r set payment_type_id = t.id, concept_name = coalesce(r.concept_name, t.name)
from public.payment_types t where t.owner_id = r.owner_id and t.code = r.concept and r.payment_type_id is null;

alter table public.payment_concepts add constraint payment_concepts_type_fk
  foreign key (payment_type_id, owner_id) references public.payment_types(id, owner_id) on delete restrict;
alter table public.payment_records add constraint payment_records_type_fk
  foreign key (payment_type_id, owner_id) references public.payment_types(id, owner_id) on delete restrict;
create index if not exists payment_concepts_type_idx on public.payment_concepts (payment_type_id);
create index if not exists payment_records_type_idx on public.payment_records (payment_type_id);

-- Siembra bajo demanda para usuarios nuevos (la llama la app).
create or replace function public.ensure_payment_types() returns void
language sql security invoker set search_path = public as $$
  insert into public.payment_types (owner_id, code, name, is_builtin, sort_order)
  select auth.uid(), t.code, t.name, true, t.ord
  from (values ('expositor','Expositor',1),('nevera','Nevera',2),('cabecera','Cabecera',3),
               ('expositor_fijo','Expositor fijo',4),('bajo_cross','Bajo cross',5),('dispensador','Dispensador',6)) as t(code,name,ord)
  where auth.uid() is not null
  on conflict (owner_id, code) do nothing;
$$;
