-- ENTREGA 2 · Gestión económica y acuerdos comerciales. Solo añade; no borra ni cambia importes existentes.
create table if not exists backup_20261113.payment_records_e2 as table public.payment_records;

-- 1) Categorías de inversión configurables. «nature» dice cómo se valora: dinero, horas, producto o material.
create table if not exists public.investment_categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  code text not null check (length(code) between 1 and 40),
  name text not null check (length(btrim(name)) between 1 and 60),
  nature text not null default 'dinero' check (nature in ('dinero','horas','producto','material')),
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (owner_id, code),
  unique (id, owner_id)
);
create unique index if not exists investment_categories_name on public.investment_categories (owner_id, lower(btrim(name)));
alter table public.investment_categories enable row level security;
drop policy if exists investment_categories_own on public.investment_categories;
create policy investment_categories_own on public.investment_categories for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

alter table public.payment_types add column if not exists category_id uuid;
alter table public.payment_types add column if not exists unit text not null default 'eur';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'payment_types_unit_check') then
    alter table public.payment_types add constraint payment_types_unit_check check (unit in ('eur','horas','cajas','litros','unidades'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payment_types_category_fk') then
    alter table public.payment_types add constraint payment_types_category_fk foreign key (category_id, owner_id) references public.investment_categories(id, owner_id) on delete set null (category_id);
  end if;
end $$;
create index if not exists payment_types_category on public.payment_types (category_id, owner_id);

-- Siembra del catálogo (categorías + conceptos que faltan) para un usuario. Idempotente.
create or replace function public.seed_investment_catalog(uid uuid) returns void
language plpgsql security invoker set search_path = public as $$
begin
  insert into public.investment_categories (owner_id, code, name, nature, sort_order) values
    (uid, 'espacios', 'Espacios comerciales', 'dinero', 1),
    (uid, 'equipamiento', 'Equipamiento', 'dinero', 2),
    (uid, 'servicios', 'Servicios y personal', 'horas', 3),
    (uid, 'producto', 'Producto', 'producto', 4),
    (uid, 'material', 'Material', 'material', 5),
    (uid, 'otras', 'Otras contraprestaciones', 'dinero', 6)
  on conflict (owner_id, code) do nothing;

  insert into public.payment_types (owner_id, code, name, is_builtin, sort_order, tracks_inventory, unit) values
    (uid, 'exposicion_adicional', 'Exposición adicional', true, 30, false, 'eur'),
    (uid, 'espacio_promocional', 'Espacio promocional', true, 31, false, 'eur'),
    (uid, 'horas_reposicion', 'Horas de reposición', true, 40, false, 'horas'),
    (uid, 'horas_promotor', 'Horas de promotor', true, 41, false, 'horas'),
    (uid, 'horas_montaje', 'Horas de montaje', true, 42, false, 'horas'),
    (uid, 'degustacion', 'Degustación', true, 43, false, 'unidades'),
    (uid, 'activacion', 'Activación', true, 44, false, 'unidades'),
    (uid, 'producto_entregado', 'Producto entregado', true, 50, false, 'cajas'),
    (uid, 'producto_bonificado', 'Producto bonificado', true, 51, false, 'cajas'),
    (uid, 'carteleria', 'Cartelería', true, 60, false, 'unidades'),
    (uid, 'material_promocional', 'Material promocional', true, 61, false, 'unidades'),
    (uid, 'mobiliario', 'Mobiliario', true, 62, true, 'unidades'),
    (uid, 'descuento_comercial', 'Descuento comercial', true, 70, false, 'eur'),
    (uid, 'campana', 'Campaña', true, 71, false, 'eur'),
    (uid, 'patrocinio', 'Patrocinio', true, 72, false, 'eur'),
    (uid, 'accion_especial', 'Acción especial', true, 73, false, 'eur')
  on conflict (owner_id, code) do nothing;

  update public.payment_types t set category_id = c.id
  from public.investment_categories c
  where t.owner_id = uid and c.owner_id = uid and t.category_id is null and c.code = case
    when t.code in ('cabecera','bajo_cross','isla','exposicion_adicional','espacio_promocional') then 'espacios'
    when t.code in ('nevera','expositor','expositor_fijo','dispensador','chimenea','otro_elemento') then 'equipamiento'
    when t.code in ('horas_reposicion','horas_promotor','horas_montaje','degustacion','activacion') then 'servicios'
    when t.code in ('producto_entregado','producto_bonificado') then 'producto'
    when t.code in ('plv','carteleria','material_promocional','mobiliario') then 'material'
    when t.code in ('descuento_comercial','campana','patrocinio','accion_especial') then 'otras'
  end;
end $$;

create or replace function public.ensure_investment_catalog() returns void
language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is not null then perform public.seed_investment_catalog(auth.uid()); end if;
end $$;

do $$ declare u record; begin
  for u in select owner_id from public.user_settings loop perform public.seed_investment_catalog(u.owner_id); end loop;
end $$;

-- 2) Acuerdos comerciales: el compromiso (los pagos son los movimientos).
create table if not exists public.agreements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  store_id uuid not null,
  type_id uuid not null,
  equipment_id uuid,
  title text check (title is null or length(btrim(title)) between 1 and 120),
  start_date date not null,
  end_date date,
  periodicity text not null default 'mensual' check (periodicity in ('puntual','mensual','bimestral','trimestral','semestral','anual')),
  amount numeric not null default 0 check (amount >= 0),
  quantity numeric check (quantity is null or quantity >= 0),
  unit text check (unit is null or unit in ('eur','horas','cajas','litros','unidades')),
  status text not null default 'borrador' check (status in ('borrador','pendiente_aprobacion','aprobado','en_ejecucion','finalizado','cancelado')),
  notes text check (notes is null or length(notes) <= 2000),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  check (end_date is null or end_date >= start_date),
  foreign key (store_id, owner_id) references public.stores(id, owner_id) on delete restrict,
  foreign key (type_id, owner_id) references public.payment_types(id, owner_id) on delete restrict,
  foreign key (equipment_id, owner_id) references public.store_equipment(id, owner_id) on delete set null (equipment_id)
);
create index if not exists agreements_store on public.agreements (store_id, owner_id);
create index if not exists agreements_type on public.agreements (type_id, owner_id);
create index if not exists agreements_equipment on public.agreements (equipment_id, owner_id);
create index if not exists agreements_status on public.agreements (owner_id, status, end_date) where deleted_at is null;
alter table public.agreements enable row level security;
drop policy if exists agreements_own on public.agreements;
create policy agreements_own on public.agreements for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop trigger if exists set_updated_at on public.agreements;
create trigger set_updated_at before update on public.agreements for each row execute function public.set_updated_at();

-- 3) Pagos: estados completos, naturaleza (dinero o en especie), cantidad y unidad, periodo, acuerdo y papelera.
alter table public.payment_records add column if not exists agreement_id uuid;
alter table public.payment_records add column if not exists quantity numeric;
alter table public.payment_records add column if not exists unit text;
alter table public.payment_records add column if not exists settlement text not null default 'dinero';
alter table public.payment_records add column if not exists period_start date;
alter table public.payment_records add column if not exists deleted_at timestamptz;
alter table public.payment_records drop constraint if exists payment_records_status_check;
alter table public.payment_records add constraint payment_records_status_check check (status in ('previsto','aprobado','comprobado','abonado','cancelado'));
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'payment_records_settlement_check') then
    alter table public.payment_records add constraint payment_records_settlement_check check (settlement in ('dinero','especie'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payment_records_unit_check') then
    alter table public.payment_records add constraint payment_records_unit_check check (unit is null or unit in ('eur','horas','cajas','litros','unidades'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payment_records_quantity_check') then
    alter table public.payment_records add constraint payment_records_quantity_check check (quantity is null or quantity >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payment_records_agreement_fk') then
    alter table public.payment_records add constraint payment_records_agreement_fk foreign key (agreement_id, owner_id) references public.agreements(id, owner_id) on delete set null (agreement_id);
  end if;
end $$;
create index if not exists payment_records_agreement on public.payment_records (agreement_id, owner_id);
create index if not exists payment_records_period on public.payment_records (owner_id, payment_date) where deleted_at is null;
update public.payment_records set period_start = date_trunc('month', payment_date)::date where period_start is null;

-- 4) Histórico de modificaciones: cada cambio o borrado de un pago o acuerdo guarda el antes y el después.
create table if not exists public.change_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entity text not null,
  entity_id uuid not null,
  action text not null check (action in ('update','delete')),
  changes jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists change_history_entity on public.change_history (owner_id, entity, entity_id, created_at desc);
alter table public.change_history enable row level security;
drop policy if exists change_history_read on public.change_history;
drop policy if exists change_history_write on public.change_history;
create policy change_history_read on public.change_history for select to authenticated using (owner_id = (select auth.uid()));
create policy change_history_write on public.change_history for insert to authenticated with check (owner_id = (select auth.uid()));

create or replace function public.log_row_change() returns trigger
language plpgsql security invoker set search_path = public as $$
declare diff jsonb := '{}'::jsonb; k text; o jsonb; n jsonb;
begin
  if tg_op = 'DELETE' then
    insert into public.change_history (owner_id, entity, entity_id, action, changes) values (old.owner_id, tg_table_name, old.id, 'delete', to_jsonb(old));
    return old;
  end if;
  o := to_jsonb(old); n := to_jsonb(new);
  for k in select jsonb_object_keys(n) loop
    if k in ('updated_at') then continue; end if;
    if (o -> k) is distinct from (n -> k) then diff := diff || jsonb_build_object(k, jsonb_build_array(o -> k, n -> k)); end if;
  end loop;
  if diff <> '{}'::jsonb then
    insert into public.change_history (owner_id, entity, entity_id, action, changes) values (new.owner_id, tg_table_name, new.id, 'update', diff);
  end if;
  return new;
end $$;
drop trigger if exists log_change on public.payment_records;
create trigger log_change after update or delete on public.payment_records for each row execute function public.log_row_change();
drop trigger if exists log_change on public.agreements;
create trigger log_change after update or delete on public.agreements for each row execute function public.log_row_change();
