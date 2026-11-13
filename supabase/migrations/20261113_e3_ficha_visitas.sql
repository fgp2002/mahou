-- ENTREGA 3 · Incidencias, checklist de visita e histórico de fotos del lineal. Solo añade.

-- 1) Incidencias con seguimiento.
create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  store_id uuid not null,
  visit_id uuid,
  equipment_id uuid,
  type text not null default 'otros' check (type in ('falta_producto','reposicion','cabecera_desmontada','nevera_deteriorada','exposicion','acceso','comercial','otros')),
  description text check (description is null or length(description) <= 2000),
  priority text not null default 'media' check (priority in ('baja','media','alta')),
  status text not null default 'abierta' check (status in ('abierta','en_seguimiento','resuelta','descartada')),
  opened_on date not null default ((now() at time zone 'Europe/Madrid')::date),
  resolved_on date,
  resolution text check (resolution is null or length(resolution) <= 2000),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  check (resolved_on is null or resolved_on >= opened_on),
  foreign key (store_id, owner_id) references public.stores(id, owner_id) on delete restrict,
  foreign key (visit_id, owner_id) references public.visits(id, owner_id) on delete set null (visit_id),
  foreign key (equipment_id, owner_id) references public.store_equipment(id, owner_id) on delete set null (equipment_id)
);
create index if not exists incidents_store on public.incidents (store_id, owner_id);
create index if not exists incidents_visit on public.incidents (visit_id, owner_id);
create index if not exists incidents_equipment on public.incidents (equipment_id, owner_id);
create index if not exists incidents_open on public.incidents (owner_id, status) where deleted_at is null;
alter table public.incidents enable row level security;
drop policy if exists incidents_own on public.incidents;
create policy incidents_own on public.incidents for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop trigger if exists set_updated_at on public.incidents;
create trigger set_updated_at before update on public.incidents for each row execute function public.set_updated_at();
drop trigger if exists log_change on public.incidents;
create trigger log_change after update or delete on public.incidents for each row execute function public.log_row_change();

alter table public.visit_photos add column if not exists incident_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'visit_photos_incident_fk') then
    alter table public.visit_photos add constraint visit_photos_incident_fk foreign key (incident_id, owner_id) references public.incidents(id, owner_id) on delete set null (incident_id);
  end if;
end $$;
create index if not exists visit_photos_incident on public.visit_photos (incident_id, owner_id);

-- La única incidencia escrita como texto en una visita pasa a ser una incidencia con seguimiento (el texto se conserva en la visita).
insert into public.incidents (owner_id, store_id, visit_id, type, description, status, opened_on)
select v.owner_id, v.store_id, v.id, 'otros', btrim(v.incidents), 'abierta', v.visit_date
from public.visits v
where v.incidents is not null and btrim(v.incidents) <> ''
  and not exists (select 1 from public.incidents i where i.visit_id = v.id);

-- 2) Checklist configurable y marcado por visita (nunca obligatorio).
alter table public.user_settings add column if not exists checklist jsonb not null
  default '["Revisar lineal","Revisar cabeceras","Comprobar neveras","Comprobar expositores","Revisar stock","Hacer fotografías","Registrar incidencias"]'::jsonb;
alter table public.visits add column if not exists checklist jsonb not null default '{}'::jsonb;

-- 3) Histórico del lineal: la foto actual pasa a ser la primera de su histórico (ya no se borra al subir otra).
insert into public.visit_photos (owner_id, store_id, storage_path, kind, mime_type, taken_at, created_at)
select s.owner_id, s.id, s.lineal_path, 'lineal', 'image/jpeg', coalesce(s.lineal_updated_at, s.updated_at), coalesce(s.lineal_updated_at, s.updated_at)
from public.stores s
where s.lineal_path is not null
  and not exists (select 1 from public.visit_photos p where p.owner_id = s.owner_id and p.storage_path = s.lineal_path);
