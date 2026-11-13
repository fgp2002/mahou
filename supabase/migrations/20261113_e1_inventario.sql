-- ENTREGA 1 · Inventario comercial.
-- Solo añade: no borra ni cambia ningún registro existente. Los «elementos activos» (payment_concepts)
-- se COPIAN al inventario y la tabla antigua se conserva intacta.

-- 0) Copia previa de lo que se toca, dentro de la base de datos (esquema no expuesto por la API).
create schema if not exists backup_20261113;
revoke all on schema backup_20261113 from anon, authenticated;
create table if not exists backup_20261113.payment_concepts as table public.payment_concepts;
create table if not exists backup_20261113.payment_records as table public.payment_records;
create table if not exists backup_20261113.payment_types as table public.payment_types;
create table if not exists backup_20261113.visit_photos as table public.visit_photos;
create table if not exists backup_20261113.stores_lineal as
  select id, owner_id, lineal_path, lineal_updated_at from public.stores where lineal_path is not null;

-- 1) Tipos de elemento = el catálogo de tipos de pago de siempre, con la marca «se instala en tienda».
alter table public.payment_types add column if not exists tracks_inventory boolean not null default false;
update public.payment_types set tracks_inventory = true
  where code in ('expositor','nevera','cabecera','expositor_fijo','bajo_cross','dispensador','chimenea');

insert into public.payment_types (owner_id, code, name, is_builtin, sort_order, tracks_inventory)
select u.owner_id, t.code, t.name, true, t.ord, true
from public.user_settings u
cross join (values ('chimenea','Chimenea',7),('isla','Isla promocional',8),('plv','Material PLV',9),('otro_elemento','Otro elemento',20)) as t(code,name,ord)
on conflict (owner_id, code) do nothing;

create or replace function public.ensure_payment_types() returns void
language sql security invoker set search_path = public as $$
  insert into public.payment_types (owner_id, code, name, is_builtin, sort_order, tracks_inventory)
  select auth.uid(), t.code, t.name, true, t.ord, true
  from (values ('expositor','Expositor',1),('nevera','Nevera',2),('cabecera','Cabecera',3),
               ('expositor_fijo','Expositor fijo',4),('bajo_cross','Bajo cross',5),('dispensador','Dispensador',6),
               ('chimenea','Chimenea',7),('isla','Isla promocional',8),('plv','Material PLV',9),('otro_elemento','Otro elemento',20)) as t(code,name,ord)
  where auth.uid() is not null
  on conflict (owner_id, code) do nothing;
$$;

-- 2) Inventario: un registro por elemento físico (o grupo de elementos pequeños con cantidad).
create table if not exists public.store_equipment (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  store_id uuid not null,
  type_id uuid not null,
  code text check (code is null or length(code) between 1 and 20),
  name text check (name is null or length(btrim(name)) between 1 and 120),
  brand_id uuid,
  brand_name text check (brand_name is null or length(brand_name) <= 80),
  quantity integer not null default 1 check (quantity between 1 and 100000),
  location text check (location is null or length(location) <= 120),
  status text not null default 'activo'
    check (status in ('pendiente_instalacion','instalado','activo','deteriorado','pendiente_revision','retirado')),
  installed_on date,
  installed_on_estimated boolean not null default false,
  removed_on date,
  last_reviewed_at timestamptz,
  reference_amount numeric check (reference_amount is null or reference_amount >= 0),
  notes text check (notes is null or length(notes) <= 2000),
  legacy_concept_id uuid unique,
  context_visit_id uuid,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (owner_id, code),
  check (removed_on is null or installed_on is null or removed_on >= installed_on),
  foreign key (store_id, owner_id) references public.stores(id, owner_id) on delete restrict,
  foreign key (type_id, owner_id) references public.payment_types(id, owner_id) on delete restrict,
  foreign key (brand_id, owner_id) references public.payment_brands(id, owner_id) on delete set null (brand_id),
  foreign key (context_visit_id, owner_id) references public.visits(id, owner_id) on delete set null (context_visit_id)
);
create index if not exists store_equipment_store on public.store_equipment (store_id, owner_id);
create index if not exists store_equipment_type on public.store_equipment (type_id, owner_id);
create index if not exists store_equipment_brand on public.store_equipment (brand_id, owner_id);
create index if not exists store_equipment_visit on public.store_equipment (context_visit_id, owner_id);
create index if not exists store_equipment_status on public.store_equipment (owner_id, status) where deleted_at is null;
alter table public.store_equipment enable row level security;
drop policy if exists store_equipment_own on public.store_equipment;
create policy store_equipment_own on public.store_equipment for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop trigger if exists set_updated_at on public.store_equipment;
create trigger set_updated_at before update on public.store_equipment for each row execute function public.set_updated_at();

-- Código corto legible por tipo (NEV-0001, CAB-0002…), único por usuario.
create or replace function public.equipment_set_code() returns trigger
language plpgsql security invoker set search_path = public as $$
declare prefix text; n integer;
begin
  if new.code is not null then return new; end if;
  select upper(left(regexp_replace(coalesce(t.code, 'ele'), '[^a-zA-Z]', '', 'g'), 3)) into prefix
  from public.payment_types t where t.id = new.type_id;
  prefix := coalesce(nullif(prefix, ''), 'ELE');
  select coalesce(max(nullif(regexp_replace(e.code, '^.*-', ''), '')::int), 0) + 1 into n
  from public.store_equipment e
  where e.owner_id = new.owner_id and e.code like prefix || '-%' and e.code ~ '-[0-9]+$';
  new.code := prefix || '-' || lpad(n::text, 4, '0');
  return new;
end $$;
drop trigger if exists equipment_set_code on public.store_equipment;
create trigger equipment_set_code before insert on public.store_equipment for each row execute function public.equipment_set_code();

-- 3) Historial del elemento: se escribe solo desde la base de datos, también para lo que llega de la cola sin conexión.
create table if not exists public.equipment_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  equipment_id uuid not null,
  store_id uuid not null,
  event_type text not null check (event_type in ('alta','instalacion','cambio_estado','revision','modificacion','retirada','papelera','restaurado')),
  from_status text,
  to_status text,
  changes jsonb,
  visit_id uuid,
  note text,
  occurred_on date not null default ((now() at time zone 'Europe/Madrid')::date),
  created_at timestamptz not null default now(),
  foreign key (equipment_id, owner_id) references public.store_equipment(id, owner_id) on delete cascade,
  foreign key (visit_id, owner_id) references public.visits(id, owner_id) on delete set null (visit_id)
);
create index if not exists equipment_events_equipment on public.equipment_events (equipment_id, owner_id, occurred_on desc);
create index if not exists equipment_events_store on public.equipment_events (store_id, owner_id);
create index if not exists equipment_events_visit on public.equipment_events (visit_id, owner_id);
alter table public.equipment_events enable row level security;
drop policy if exists equipment_events_own on public.equipment_events;
create policy equipment_events_own on public.equipment_events for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create or replace function public.equipment_log() returns trigger
language plpgsql security invoker set search_path = public as $$
declare
  today date := (now() at time zone 'Europe/Madrid')::date;
  diff jsonb := '{}'::jsonb;
  k text;
  watched text[] := array['name','type_id','brand_name','quantity','location','installed_on','removed_on','reference_amount','notes'];
begin
  if tg_op = 'INSERT' then
    insert into public.equipment_events (owner_id, equipment_id, store_id, event_type, to_status, visit_id, note, occurred_on)
    values (new.owner_id, new.id, new.store_id, 'alta', new.status, new.context_visit_id,
            case when new.legacy_concept_id is not null then 'Alta por migración desde los elementos activos' end,
            coalesce(new.installed_on, today));
    return new;
  end if;

  if new.deleted_at is distinct from old.deleted_at then
    insert into public.equipment_events (owner_id, equipment_id, store_id, event_type, visit_id)
    values (new.owner_id, new.id, new.store_id, case when new.deleted_at is null then 'restaurado' else 'papelera' end, new.context_visit_id);
  end if;

  if new.status is distinct from old.status then
    insert into public.equipment_events (owner_id, equipment_id, store_id, event_type, from_status, to_status, visit_id, occurred_on)
    values (new.owner_id, new.id, new.store_id,
      case when new.status = 'retirado' then 'retirada'
           when old.status = 'pendiente_instalacion' and new.status in ('instalado','activo') then 'instalacion'
           else 'cambio_estado' end,
      old.status, new.status, new.context_visit_id,
      case when new.status = 'retirado' then coalesce(new.removed_on, today)
           when old.status = 'pendiente_instalacion' and new.status in ('instalado','activo') then coalesce(new.installed_on, today)
           else today end);
  end if;

  if new.last_reviewed_at is distinct from old.last_reviewed_at and new.last_reviewed_at is not null then
    insert into public.equipment_events (owner_id, equipment_id, store_id, event_type, to_status, visit_id, occurred_on)
    values (new.owner_id, new.id, new.store_id, 'revision', new.status, new.context_visit_id, (new.last_reviewed_at at time zone 'Europe/Madrid')::date);
  end if;

  foreach k in array watched loop
    -- Las fechas que acompañan a un cambio de estado ya quedan en su propio suceso.
    if new.status is distinct from old.status and k in ('installed_on','removed_on') then continue; end if;
    if (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
      diff := diff || jsonb_build_object(k, jsonb_build_array(to_jsonb(old) -> k, to_jsonb(new) -> k));
    end if;
  end loop;
  if diff <> '{}'::jsonb then
    insert into public.equipment_events (owner_id, equipment_id, store_id, event_type, changes, visit_id)
    values (new.owner_id, new.id, new.store_id, 'modificacion', diff, new.context_visit_id);
  end if;
  return new;
end $$;
drop trigger if exists equipment_log on public.store_equipment;
create trigger equipment_log after insert or update on public.store_equipment for each row execute function public.equipment_log();

-- 4) Fotos: una sola tabla para fotos de visita, del lineal, de elementos (y de incidencias en la Entrega 3).
alter table public.visit_photos alter column visit_id drop not null;
alter table public.visit_photos add column if not exists store_id uuid;
alter table public.visit_photos add column if not exists equipment_id uuid;
alter table public.visit_photos add column if not exists kind text not null default 'visita';
alter table public.visit_photos add column if not exists taken_at timestamptz not null default now();
alter table public.visit_photos add column if not exists deleted_at timestamptz;
update public.visit_photos p set store_id = v.store_id from public.visits v where v.id = p.visit_id and p.store_id is null;
update public.visit_photos set taken_at = created_at where taken_at <> created_at;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'visit_photos_kind_check') then
    alter table public.visit_photos add constraint visit_photos_kind_check check (kind in ('visita','lineal','elemento','incidencia'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'visit_photos_store_fk') then
    alter table public.visit_photos add constraint visit_photos_store_fk foreign key (store_id, owner_id) references public.stores(id, owner_id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'visit_photos_equipment_fk') then
    alter table public.visit_photos add constraint visit_photos_equipment_fk foreign key (equipment_id, owner_id) references public.store_equipment(id, owner_id) on delete set null (equipment_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'visit_photos_anchor_check') then
    alter table public.visit_photos add constraint visit_photos_anchor_check check (visit_id is not null or store_id is not null);
  end if;
end $$;
create index if not exists visit_photos_store on public.visit_photos (store_id, owner_id, taken_at desc);
create index if not exists visit_photos_equipment on public.visit_photos (equipment_id, owner_id);

-- La tienda se rellena sola a partir de la visita (también para las fotos que llegan de la cola sin conexión).
create or replace function public.photo_fill_store() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if new.store_id is null and new.visit_id is not null then
    select v.store_id into new.store_id from public.visits v where v.id = new.visit_id;
  end if;
  if new.store_id is null and new.equipment_id is not null then
    select e.store_id into new.store_id from public.store_equipment e where e.id = new.equipment_id;
  end if;
  return new;
end $$;
drop trigger if exists photo_fill_store on public.visit_photos;
create trigger photo_fill_store before insert or update of visit_id, equipment_id on public.visit_photos for each row execute function public.photo_fill_store();

-- 5) Cada pago apunta al elemento físico. Se mantiene el enlace antiguo (concept_id) para poder volver atrás.
alter table public.payment_records add column if not exists equipment_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'payment_records_equipment_fk') then
    alter table public.payment_records add constraint payment_records_equipment_fk foreign key (equipment_id, owner_id) references public.store_equipment(id, owner_id) on delete set null (equipment_id);
  end if;
end $$;
create index if not exists payment_records_equipment on public.payment_records (equipment_id, owner_id);

-- 6) Copia de los elementos activos al inventario (sin datos DEMO) y enlace de sus pagos.
insert into public.store_equipment (owner_id, store_id, type_id, brand_id, brand_name, quantity, status,
  installed_on, installed_on_estimated, removed_on, last_reviewed_at, reference_amount, notes, legacy_concept_id, created_at)
select c.owner_id, c.store_id, c.payment_type_id, c.brand_id, c.brand_name, 1,
  case c.status when 'activo' then 'activo' when 'pausado' then 'pendiente_revision' else 'retirado' end,
  coalesce(c.start_date, (c.created_at at time zone 'Europe/Madrid')::date),
  c.start_date is null,
  case when c.status = 'finalizado' then coalesce(c.end_date, (c.updated_at at time zone 'Europe/Madrid')::date) end,
  c.last_checked_at, c.default_amount, c.notes, c.id, c.created_at
from public.payment_concepts c
where not c.is_demo and c.payment_type_id is not null
  and not exists (select 1 from public.store_equipment e where e.legacy_concept_id = c.id)
order by c.created_at;

update public.payment_records r set equipment_id = e.id
from public.store_equipment e
where e.legacy_concept_id = r.concept_id and r.equipment_id is null;
