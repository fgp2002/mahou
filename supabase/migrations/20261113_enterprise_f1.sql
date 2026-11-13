-- Mahou Enterprise · Fase 1: organización, usuarios, roles, permisos por persona, carteras, tareas y auditoría de accesos.
-- Migración ADITIVA: no borra datos ni cambia identificadores. El propietario actual conserva exactamente su acceso
-- (las políticas «owner_id = auth.uid()» siguen); las nuevas políticas solo AÑADEN acceso a otros miembros según su ámbito.
-- Los datos operativos pasan a pertenecer a la organización: owner_id = propietario de la organización (data_owner()),
-- y quién lo registró queda en created_by / en la auditoría.

-- ── Organización y estructura ──────────────────────────────────────────────
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  kind text not null default 'propietaria' check (kind in ('propietaria', 'externa')),
  owner_user_id uuid references auth.users(id) on delete restrict,
  parent_org_id uuid references public.organizations(id) on delete restrict,
  tax_id text, notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check ((kind = 'propietaria' and owner_user_id is not null and parent_org_id is null) or (kind = 'externa' and parent_org_id is not null))
);

create table if not exists public.org_units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  parent_id uuid references public.org_units(id) on delete restrict,
  kind text not null check (kind in ('pais', 'region', 'zona', 'equipo')),
  name text not null check (length(btrim(name)) between 1 and 80),
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists org_units_parent on public.org_units(parent_id);

create table if not exists public.roles (
  key text primary key,
  name text not null,
  description text,
  scope text not null check (scope in ('organizacion', 'unidad', 'cartera', 'empresa', 'propio')),
  external boolean not null default false,
  sort_order integer not null default 100
);

create table if not exists public.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  full_name text not null check (length(btrim(full_name)) between 1 and 120),
  email text,
  position text,
  phone text,
  role text not null references public.roles(key),
  unit_id uuid references public.org_units(id) on delete set null,
  manager_id uuid references public.members(user_id) on delete set null,
  status text not null default 'activo' check (status in ('activo', 'suspendido', 'baja')),
  valid_from date not null default current_date,
  valid_to date,
  approval_limit numeric check (approval_limit is null or approval_limit >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);
create index if not exists members_org on public.members(organization_id);
create index if not exists members_unit on public.members(unit_id);
create index if not exists members_manager on public.members(manager_id);

-- Permisos: «módulo.acción». La matriz por rol se carga abajo; las excepciones por persona van en permission_grants.
create table if not exists public.role_permissions (
  role text not null references public.roles(key) on delete cascade,
  permission text not null,
  primary key (role, permission)
);

create table if not exists public.permission_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.members(user_id) on delete cascade,
  permission text not null check (permission ~ '^[a-z_]+\.[a-z_]+$'),
  effect text not null default 'allow' check (effect in ('allow', 'deny')),
  unit_id uuid references public.org_units(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  reason text not null check (length(btrim(reason)) between 3 and 500),
  granted_by uuid not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid,
  check (granted_by <> user_id),
  check (valid_to is null or valid_to > valid_from)
);
create index if not exists permission_grants_user on public.permission_grants(user_id);

-- Carteras: qué tiendas atiende cada persona o empresa externa, con vigencia (reasignar = cerrar y abrir).
create table if not exists public.store_assignments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid references public.members(user_id) on delete cascade,
  company_id uuid references public.organizations(id) on delete cascade,
  function text not null check (function in ('gpv', 'reponedor', 'servicio')),
  valid_from date not null default current_date,
  valid_to date,
  created_by uuid,
  created_at timestamptz not null default now(),
  check ((user_id is not null) <> (company_id is not null)),
  check (valid_to is null or valid_to >= valid_from)
);
create index if not exists store_assignments_store on public.store_assignments(store_id);
create index if not exists store_assignments_user on public.store_assignments(user_id);
create index if not exists store_assignments_company on public.store_assignments(company_id);

-- Registro de autorizaciones: solo se añade (sin políticas de modificación ni borrado).
create table if not exists public.access_audit (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete set null,
  actor uuid,
  action text not null,
  target_user uuid,
  entity text,
  entity_id uuid,
  detail jsonb not null default '{}'::jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists access_audit_created on public.access_audit(created_at desc);

alter table public.stores add column if not exists unit_id uuid references public.org_units(id) on delete set null;
create index if not exists stores_unit on public.stores(unit_id);

-- ── Funciones de seguridad (SECURITY DEFINER: leen la estructura sin depender de las políticas) ──
create or replace function public.my_member() returns public.members language sql stable security definer set search_path = public as $$
  select m.* from public.members m where m.user_id = auth.uid()
    and m.status = 'activo' and m.valid_from <= current_date and (m.valid_to is null or m.valid_to >= current_date)
$$;

-- Dueño de los datos de la organización de quien consulta (para el propietario, él mismo).
create or replace function public.data_owner() returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select coalesce(p.owner_user_id, o.owner_user_id) from public.members m
       join public.organizations o on o.id = m.organization_id
       left join public.organizations p on p.id = o.parent_org_id
     where m.user_id = auth.uid()),
    auth.uid())
$$;

create or replace function public.is_org_owner() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organizations where owner_user_id = auth.uid() and kind = 'propietaria')
$$;

create or replace function public.my_role() returns text language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.my_member()), case when public.is_org_owner() then 'administrador' end)
$$;

-- ¿Puede la persona actual hacer «permiso»? Denegación expresa > concesión > rol > no.
-- «administrar» de un módulo incluye consultar, crear, editar, eliminar y asignar (no aprobar ni validar).
create or replace function public.has_perm(p text) returns boolean language plpgsql stable security definer set search_path = public as $$
declare me public.members; modul text := split_part(p, '.', 1); act text := split_part(p, '.', 2);
begin
  if public.is_org_owner() then return true; end if;
  select * into me from public.my_member();
  if me.user_id is null then return false; end if;
  if exists (select 1 from public.permission_grants g where g.user_id = me.user_id and g.effect = 'deny' and g.permission = p
             and g.revoked_at is null and g.valid_from <= now() and (g.valid_to is null or g.valid_to > now())
             and g.unit_id is null and g.store_id is null) then return false; end if;
  if exists (select 1 from public.permission_grants g where g.user_id = me.user_id and g.effect = 'allow'
             and (g.permission = p or (g.permission = modul || '.administrar' and act in ('consultar','crear','editar','eliminar','asignar')))
             and g.revoked_at is null and g.valid_from <= now() and (g.valid_to is null or g.valid_to > now())) then return true; end if;
  return exists (select 1 from public.role_permissions r where r.role = me.role
                 and (r.permission = p or (r.permission = modul || '.administrar' and act in ('consultar','crear','editar','eliminar','asignar'))));
end $$;

create or replace function public.unit_subtree(root uuid) returns setof uuid language sql stable security definer set search_path = public as $$
  with recursive t as (select id from public.org_units where id = root union all select u.id from public.org_units u join t on u.parent_id = t.id)
  select id from t
$$;

-- Tiendas visibles para la persona actual según su rol, su unidad, su cartera, su empresa y sus concesiones.
create or replace function public.visible_store_ids() returns setof uuid language plpgsql stable security definer set search_path = public as $$
declare me public.members; sc text; owner uuid := public.data_owner();
begin
  if public.is_org_owner() then return query select s.id from public.stores s where s.owner_id = auth.uid(); return; end if;
  select * into me from public.my_member();
  if me.user_id is null then return; end if;
  select scope into sc from public.roles where key = me.role;
  if sc = 'organizacion' or (sc = 'unidad' and me.unit_id is null) then
    return query select s.id from public.stores s where s.owner_id = owner;
  elsif sc = 'unidad' then
    return query select s.id from public.stores s where s.owner_id = owner and s.unit_id in (select public.unit_subtree(me.unit_id));
  elsif sc = 'empresa' then
    return query select a.store_id from public.store_assignments a where a.company_id = me.organization_id
      and a.valid_from <= current_date and (a.valid_to is null or a.valid_to >= current_date);
  end if;
  -- Cartera propia (todos los perfiles) y concesiones con ámbito de tienda o de unidad.
  return query select a.store_id from public.store_assignments a where a.user_id = me.user_id
      and a.valid_from <= current_date and (a.valid_to is null or a.valid_to >= current_date);
  return query select g.store_id from public.permission_grants g where g.user_id = me.user_id and g.effect = 'allow' and g.store_id is not null
      and g.revoked_at is null and g.valid_from <= now() and (g.valid_to is null or g.valid_to > now());
  return query select s.id from public.permission_grants g join public.stores s on s.owner_id = owner
      and s.unit_id in (select public.unit_subtree(g.unit_id))
      where g.user_id = me.user_id and g.effect = 'allow' and g.unit_id is not null
      and g.revoked_at is null and g.valid_from <= now() and (g.valid_to is null or g.valid_to > now());
end $$;

create or replace function public.can_see_store(sid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select sid is not null and exists (select 1 from public.visible_store_ids() v where v = sid)
$$;

-- Personas de mi equipo: a quienes superviso (cadena de responsables), los de mi unidad si mi rol es territorial,
-- y los de mi empresa si soy supervisor externo.
create or replace function public.team_user_ids() returns setof uuid language plpgsql stable security definer set search_path = public as $$
declare me public.members; sc text;
begin
  if public.is_org_owner() then return query select user_id from public.members; return; end if;
  select * into me from public.my_member();
  if me.user_id is null then return; end if;
  select scope into sc from public.roles where key = me.role;
  return query with recursive t as (select user_id from public.members where manager_id = me.user_id
                 union select m.user_id from public.members m join t on m.manager_id = t.user_id) select user_id from t;
  if sc = 'organizacion' then return query select user_id from public.members where organization_id = me.organization_id
     or organization_id in (select id from public.organizations where parent_org_id = me.organization_id); end if;
  if sc = 'unidad' and me.unit_id is not null then return query select user_id from public.members where unit_id in (select public.unit_subtree(me.unit_id)); end if;
  if sc = 'empresa' then return query select user_id from public.members where organization_id = me.organization_id; end if;
end $$;

-- Contexto de la sesión para la app: rol, permisos efectivos, organización y unidad.
create or replace function public.my_context() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me public.members; r text := public.my_role(); perms text[];
begin
  select * into me from public.my_member();
  if public.is_org_owner() then
    perms := array(select distinct permission from public.role_permissions union select 'todo.todo');
  else
    perms := array(
      select distinct p from (
        select r2.permission p from public.role_permissions r2 where r2.role = me.role
        union select g.permission from public.permission_grants g where g.user_id = me.user_id and g.effect = 'allow'
          and g.revoked_at is null and g.valid_from <= now() and (g.valid_to is null or g.valid_to > now())
      ) x where not exists (select 1 from public.permission_grants d where d.user_id = me.user_id and d.effect = 'deny' and d.permission = x.p
          and d.revoked_at is null and d.valid_from <= now() and (d.valid_to is null or d.valid_to > now()) and d.unit_id is null and d.store_id is null));
  end if;
  return jsonb_build_object(
    'user_id', auth.uid(), 'role', r, 'is_owner', public.is_org_owner(), 'data_owner', public.data_owner(),
    'member', case when me.user_id is null then null else to_jsonb(me) end,
    'organization', (select to_jsonb(o) from public.organizations o where o.id = coalesce(me.organization_id, (select id from public.organizations where owner_user_id = auth.uid() limit 1))),
    'unit', (select to_jsonb(u) from public.org_units u where u.id = me.unit_id),
    'tracking_start', (select us.tracking_start from public.user_settings us where us.owner_id = public.data_owner()),
    'permissions', to_jsonb(perms));
end $$;

create or replace function public.my_org_id() returns uuid language sql stable security definer set search_path = public as $$
  select coalesce((select organization_id from public.my_member()), (select id from public.organizations where owner_user_id = auth.uid() and kind = 'propietaria' limit 1))
$$;

grant execute on function public.my_org_id, public.my_member, public.data_owner, public.is_org_owner, public.my_role, public.has_perm(text), public.unit_subtree(uuid),
  public.visible_store_ids, public.can_see_store(uuid), public.team_user_ids, public.my_context to authenticated;

-- ── Tareas ────────────────────────────────────────────────────────────────
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.data_owner() references auth.users(id) on delete cascade,
  store_id uuid not null,
  equipment_id uuid,
  incident_id uuid,
  kind text not null default 'otra' check (kind in ('revisar_nevera', 'reponer', 'fotografiar', 'revisar_exposicion', 'comprobar_material', 'reparar', 'visitar', 'verificar_instalacion', 'otra')),
  title text not null check (length(btrim(title)) between 1 and 160),
  description text check (description is null or length(description) <= 2000),
  priority text not null default 'media' check (priority in ('baja', 'media', 'alta')),
  due_date date,
  status text not null default 'pendiente' check (status in ('pendiente', 'asignada', 'en_curso', 'completada', 'pendiente_validacion', 'validada', 'rechazada', 'cancelada')),
  created_by uuid not null default auth.uid(),
  assignee_id uuid references public.members(user_id) on delete set null,
  company_id uuid references public.organizations(id) on delete set null,
  completed_at timestamptz, validated_by uuid, validated_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (store_id, owner_id) references public.stores(id, owner_id) on delete restrict,
  foreign key (equipment_id, owner_id) references public.store_equipment(id, owner_id) on delete set null (equipment_id),
  foreign key (incident_id, owner_id) references public.incidents(id, owner_id) on delete set null (incident_id)
);
create index if not exists tasks_store on public.tasks(store_id);
create index if not exists tasks_assignee on public.tasks(assignee_id, status);
create index if not exists tasks_company on public.tasks(company_id, status);

create table if not exists public.task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  actor uuid not null default auth.uid(),
  kind text not null check (kind in ('alta', 'estado', 'asignacion', 'comentario')),
  from_status text, to_status text, note text check (note is null or length(note) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists task_events_task on public.task_events(task_id, created_at);

create or replace function public.task_log() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.task_events (task_id, actor, kind, to_status) values (new.id, coalesce(auth.uid(), new.created_by), 'alta', new.status);
    return new;
  end if;
  new.updated_at := now();
  if new.status is distinct from old.status then
    insert into public.task_events (task_id, actor, kind, from_status, to_status) values (new.id, coalesce(auth.uid(), new.created_by), 'estado', old.status, new.status);
    if new.status in ('completada', 'pendiente_validacion') and new.completed_at is null then new.completed_at := now(); end if;
    if new.status = 'validada' then new.validated_by := auth.uid(); new.validated_at := now(); end if;
  end if;
  if new.assignee_id is distinct from old.assignee_id or new.company_id is distinct from old.company_id then
    insert into public.task_events (task_id, actor, kind, note) values (new.id, coalesce(auth.uid(), new.created_by), 'asignacion',
      coalesce((select full_name from public.members where user_id = new.assignee_id), (select name from public.organizations where id = new.company_id), 'Sin asignar'));
  end if;
  return new;
end $$;
-- Quién puede hacer qué con una tarea: el asignado la avanza; validar o rechazar exige «tareas.validar»;
-- reasignar exige «tareas.asignar»; cambiar el contenido exige haberla creado o «tareas.asignar».
create or replace function public.task_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_org_owner() then return new; end if;
  if new.status in ('validada', 'rechazada') and new.status is distinct from old.status and not public.has_perm('tareas.validar') then
    raise exception 'No tienes permiso para validar tareas'; end if;
  if (new.assignee_id is distinct from old.assignee_id or new.company_id is distinct from old.company_id)
     and not public.has_perm('tareas.asignar') then raise exception 'No tienes permiso para asignar tareas'; end if;
  if (new.title, coalesce(new.description, ''), new.store_id, new.kind, new.priority, coalesce(new.due_date, '1900-01-01'::date), new.owner_id, new.created_by)
     is distinct from (old.title, coalesce(old.description, ''), old.store_id, old.kind, old.priority, coalesce(old.due_date, '1900-01-01'::date), old.owner_id, old.created_by)
     and not (old.created_by = auth.uid() or public.has_perm('tareas.asignar')) then
    raise exception 'Solo puedes cambiar el estado de esta tarea'; end if;
  return new;
end $$;
drop trigger if exists task_guard on public.tasks;
create trigger task_guard before update on public.tasks for each row execute function public.task_guard();
drop trigger if exists task_log_ins on public.tasks;
drop trigger if exists task_log_upd on public.tasks;
create trigger task_log_ins after insert on public.tasks for each row execute function public.task_log();
create trigger task_log_upd before update on public.tasks for each row execute function public.task_log();

-- ── Rutas por persona ────────────────────────────────────────────────────
alter table public.routes add column if not exists user_id uuid references auth.users(id) on delete cascade;
update public.routes set user_id = owner_id where user_id is null;
alter table public.routes alter column user_id set default auth.uid();
-- La planificación automática (sin sesión) crea la ruta para el dueño de los datos si no se indica la persona.
create or replace function public.routes_fill_user() returns trigger language plpgsql set search_path = public as $$
begin new.user_id := coalesce(new.user_id, auth.uid(), new.owner_id); return new; end $$;
drop trigger if exists routes_fill_user on public.routes;
create trigger routes_fill_user before insert on public.routes for each row execute function public.routes_fill_user();
alter table public.routes alter column user_id set not null;
alter table public.routes drop constraint if exists routes_owner_id_route_date_key;
do $$ begin
  alter table public.routes add constraint routes_user_id_route_date_key unique (user_id, route_date);
exception when duplicate_object or duplicate_table then null; end $$;

-- ── Los nuevos registros operativos pertenecen a la organización ─────────
do $$ declare t text; begin
  foreach t in array array['stores','store_contacts','visits','visit_photos','visit_items','visit_photo_tags','store_equipment','equipment_events',
                           'incidents','payment_records','agreements','change_history','routes','route_stops','payment_concepts','import_runs','change_log',
                           'payment_types','investment_categories','payment_brands','brand_logos','products','photo_tags'] loop
    execute format('alter table public.%I alter column owner_id set default public.data_owner()', t);
  end loop;
end $$;

-- Quién registró cada cosa (hasta hoy solo había un usuario: el propietario).
do $$ declare t text; begin
  foreach t in array array['visits','incidents','visit_photos','store_equipment','payment_records','agreements','store_contacts'] loop
    execute format('alter table public.%I add column if not exists created_by uuid', t);
    execute format('update public.%I set created_by = owner_id where created_by is null', t);
    execute format('alter table public.%I alter column created_by set default auth.uid()', t);
  end loop;
end $$;

-- Los catálogos solo los siembra el propietario (antes cualquiera los habría creado a su nombre).
create or replace function public.ensure_payment_types() returns void language sql set search_path to 'public' as $$
  insert into public.payment_types (owner_id, code, name, is_builtin, sort_order, tracks_inventory)
  select auth.uid(), t.code, t.name, true, t.ord, true
  from (values ('expositor','Expositor',1),('nevera','Nevera',2),('cabecera','Cabecera',3),
               ('expositor_fijo','Expositor fijo',4),('bajo_cross','Bajo cross',5),('dispensador','Dispensador',6),
               ('chimenea','Chimenea',7),('isla','Isla promocional',8),('plv','Material PLV',9),('otro_elemento','Otro elemento',20)) as t(code,name,ord)
  where auth.uid() is not null and public.data_owner() = auth.uid()
  on conflict (owner_id, code) do nothing;
$$;
create or replace function public.ensure_investment_catalog() returns void language plpgsql set search_path to 'public' as $$
begin if auth.uid() is not null and public.data_owner() = auth.uid() then perform public.seed_investment_catalog(auth.uid()); end if; end $$;

-- Los registros automáticos (historial de elementos y de cambios) los escribe el sistema, sea quien sea quien cambia.
alter function public.equipment_log() security definer;
alter function public.log_row_change() security definer;
alter function public.photo_fill_store() security definer;

-- ── Seguridad: tablas nuevas ─────────────────────────────────────────────
alter table public.organizations enable row level security;
alter table public.org_units enable row level security;
alter table public.roles enable row level security;
alter table public.members enable row level security;
alter table public.role_permissions enable row level security;
alter table public.permission_grants enable row level security;
alter table public.store_assignments enable row level security;
alter table public.access_audit enable row level security;
alter table public.tasks enable row level security;
alter table public.task_events enable row level security;

-- Privilegios explícitos: el navegador solo lee la estructura; las tareas se crean y actualizan con sus reglas.
revoke all on public.organizations, public.org_units, public.roles, public.members, public.role_permissions, public.permission_grants,
  public.store_assignments, public.access_audit, public.tasks, public.task_events from anon, authenticated;
grant select on public.organizations, public.org_units, public.roles, public.members, public.role_permissions, public.permission_grants,
  public.store_assignments, public.access_audit to authenticated;
grant select, insert, update on public.tasks to authenticated;
grant select, insert on public.task_events to authenticated;

-- Las altas y cambios de organización, usuarios, permisos y carteras pasan por el servidor (que comprueba el permiso
-- y deja auditoría). Desde el navegador solo se leen.
create policy organizations_read on public.organizations for select to authenticated using (
  owner_user_id = (select auth.uid()) or id = (select organization_id from public.my_member())
  or (parent_org_id = (select organization_id from public.my_member()) and (select public.has_perm('empresas.consultar')))
  or (parent_org_id is not null and (select public.is_org_owner()) and parent_org_id = public.my_org_id()));
create policy org_units_read on public.org_units for select to authenticated using (
  organization_id in (select id from public.organizations where owner_user_id = (select public.data_owner())));
create policy roles_read on public.roles for select to authenticated using (true);
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);
create policy members_read on public.members for select to authenticated using (
  user_id = (select auth.uid()) or (select public.is_org_owner())
  or ((select public.has_perm('usuarios.consultar')) and (
       user_id in (select public.team_user_ids())
       or ((select o.kind from public.organizations o where o.id = (select organization_id from public.my_member())) = 'propietaria'
           and (select scope from public.roles where key = public.my_role()) = 'organizacion'))));
create policy permission_grants_read on public.permission_grants for select to authenticated using (
  user_id = (select auth.uid()) or (select public.is_org_owner()) or ((select public.has_perm('usuarios.consultar')) and user_id in (select public.team_user_ids())));
create policy store_assignments_read on public.store_assignments for select to authenticated using (
  (select public.is_org_owner()) or user_id = (select auth.uid()) or company_id = (select organization_id from public.my_member())
  or ((select public.has_perm('carteras.consultar')) and store_id in (select public.visible_store_ids())));
create policy access_audit_read on public.access_audit for select to authenticated using ((select public.has_perm('auditoria.consultar')));

create policy tasks_read on public.tasks for select to authenticated using (
  owner_id = (select public.data_owner()) and (
    (select public.is_org_owner()) or assignee_id = (select auth.uid()) or created_by = (select auth.uid())
    or (company_id is not null and company_id = (select organization_id from public.my_member()) and (select public.has_perm('tareas.asignar')))
    or ((select public.has_perm('tareas.consultar')) and store_id in (select public.visible_store_ids()))));
create policy tasks_insert on public.tasks for insert to authenticated with check (
  owner_id = (select public.data_owner()) and created_by = (select auth.uid()) and (select public.has_perm('tareas.crear')) and store_id in (select public.visible_store_ids()));
create policy tasks_update on public.tasks for update to authenticated using (
  owner_id = (select public.data_owner()) and ((select public.is_org_owner()) or assignee_id = (select auth.uid()) or created_by = (select auth.uid())
    or (company_id = (select organization_id from public.my_member()) and (select public.has_perm('tareas.asignar')))
    or (((select public.has_perm('tareas.editar')) or (select public.has_perm('tareas.validar')) or (select public.has_perm('tareas.asignar'))) and store_id in (select public.visible_store_ids()))))
  with check (owner_id = (select public.data_owner()));
create policy task_events_read on public.task_events for select to authenticated using (exists (select 1 from public.tasks t where t.id = task_id));
create policy task_events_insert on public.task_events for insert to authenticated with check (actor = (select auth.uid()) and exists (select 1 from public.tasks t where t.id = task_id));

-- ── Seguridad: acceso de los miembros a los datos existentes (se SUMA a «owner_id = (select auth.uid())») ──
-- Patrón: mismo dueño de datos + permiso del módulo + tienda dentro de su ámbito. Borrar = papelera (editar).
do $$ declare r record; begin
  for r in select * from (values
      ('stores', 'tiendas', 'id'), ('store_contacts', 'contactos', 'store_id'), ('visits', 'visitas', 'store_id'),
      ('visit_photos', 'fotos', 'store_id'), ('store_equipment', 'inventario', 'store_id'), ('incidents', 'incidencias', 'store_id'),
      ('payment_records', 'pagos', 'store_id'), ('agreements', 'acuerdos', 'store_id')) as v(t, m, col) loop
    execute format('create policy %1$s_member_read on public.%1$I for select to authenticated using (owner_id = (select public.data_owner()) and (select public.has_perm(%2$L)) and %3$I in (select public.visible_store_ids()))', r.t, r.m || '.consultar', r.col);
    execute format('create policy %1$s_member_insert on public.%1$I for insert to authenticated with check (owner_id = (select public.data_owner()) and (select public.has_perm(%2$L)) and %3$I in (select public.visible_store_ids()))', r.t, r.m || '.crear', r.col);
    execute format('create policy %1$s_member_update on public.%1$I for update to authenticated using (owner_id = (select public.data_owner()) and (select public.has_perm(%2$L)) and %3$I in (select public.visible_store_ids())) with check (owner_id = (select public.data_owner()) and %3$I in (select public.visible_store_ids()))', r.t, r.m || '.editar', r.col);
  end loop;
end $$;
-- El reponedor puede cambiar el ESTADO de un elemento (avería, no localizado) aunque no pueda editarlo entero:
-- su permiso «inventario.editar» viene limitado por la pantalla y por esta regla de columnas.
create or replace function public.equipment_member_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select public.is_org_owner()) or (select public.has_perm('inventario.crear')) then return new; end if;
  if (new.type_id, new.store_id, new.quantity, coalesce(new.reference_amount, -1), coalesce(new.code, ''), coalesce(new.brand_name, ''))
     is distinct from (old.type_id, old.store_id, old.quantity, coalesce(old.reference_amount, -1), coalesce(old.code, ''), coalesce(old.brand_name, '')) then
    raise exception 'Solo puedes cambiar el estado, la ubicación, las notas y la fecha de revisión de este elemento';
  end if;
  return new;
end $$;
drop trigger if exists equipment_member_guard on public.store_equipment;
create trigger equipment_member_guard before update on public.store_equipment for each row execute function public.equipment_member_guard();

create policy visit_items_member on public.visit_items for all to authenticated
  using (owner_id = (select public.data_owner()) and exists (select 1 from public.visits v where v.id = visit_id))
  with check (owner_id = (select public.data_owner()) and exists (select 1 from public.visits v where v.id = visit_id));
create policy equipment_events_member_read on public.equipment_events for select to authenticated using (
  owner_id = (select public.data_owner()) and (select public.has_perm('inventario.consultar')) and store_id in (select public.visible_store_ids()));
create policy change_history_member_read on public.change_history for select to authenticated using (
  owner_id = (select public.data_owner()) and ((select public.has_perm('auditoria.consultar')) or (entity = 'incidents' and (select public.has_perm('incidencias.consultar')))
    or (entity in ('payment_records', 'agreements') and (select public.has_perm('pagos.consultar')))));
-- Catálogos de la organización: lectura para todos sus miembros.
do $$ declare t text; begin
  foreach t in array array['payment_types','investment_categories','payment_brands','brand_logos','products','photo_tags'] loop
    execute format('create policy %1$s_member_read on public.%1$I for select to authenticated using (owner_id = (select public.data_owner()))', t);
  end loop;
end $$;
-- Catálogos: los gestiona quien tenga «catalogos» (p. ej. administrador); las etiquetas de fotos, quien hace fotos.
do $$ declare t text; begin
  foreach t in array array['payment_types','investment_categories','payment_brands','brand_logos','products'] loop
    execute format('create policy %1$s_member_insert on public.%1$I for insert to authenticated with check (owner_id = (select public.data_owner()) and (select public.has_perm(''catalogos.crear'')))', t);
    execute format('create policy %1$s_member_update on public.%1$I for update to authenticated using (owner_id = (select public.data_owner()) and (select public.has_perm(''catalogos.editar''))) with check (owner_id = (select public.data_owner()))', t);
    execute format('create policy %1$s_member_delete on public.%1$I for delete to authenticated using (owner_id = (select public.data_owner()) and (select public.has_perm(''catalogos.eliminar'')))', t);
  end loop;
end $$;
create policy photo_tags_member_insert on public.photo_tags for insert to authenticated with check (owner_id = (select public.data_owner()) and (select public.has_perm('fotos.crear')));
create policy visit_photo_tags_member on public.visit_photo_tags for all to authenticated
  using (owner_id = (select public.data_owner()) and exists (select 1 from public.visit_photos p where p.id = photo_id))
  with check (owner_id = (select public.data_owner()) and exists (select 1 from public.visit_photos p where p.id = photo_id));

-- Rutas: cada persona las suyas; los responsables consultan (y con permiso, editan) las de su equipo.
create policy routes_member on public.routes for all to authenticated
  using (owner_id = (select public.data_owner()) and (user_id = (select auth.uid()) or ((select public.has_perm('rutas.consultar')) and user_id in (select public.team_user_ids()))))
  with check (owner_id = (select public.data_owner()) and (user_id = (select auth.uid()) or ((select public.has_perm('rutas.editar')) and user_id in (select public.team_user_ids()))));
create policy route_stops_member on public.route_stops for all to authenticated
  using (owner_id = (select public.data_owner()) and exists (select 1 from public.routes r where r.id = route_id))
  with check (owner_id = (select public.data_owner()) and exists (select 1 from public.routes r where r.id = route_id));

-- Fotos (almacenamiento): cada uno sube a su carpeta; se pueden ver las fotos registradas de tiendas de su ámbito.
create or replace function public.can_read_photo(path text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.visit_photos p where (p.storage_path = path or p.thumb_path = path) and p.owner_id = (select public.data_owner())
                   and ((select public.is_org_owner()) or ((select public.has_perm('fotos.consultar')) and p.store_id in (select public.visible_store_ids()))))
      or exists (select 1 from public.stores s where s.lineal_path = path and s.owner_id = (select public.data_owner()) and s.id in (select public.visible_store_ids()))
$$;
grant execute on function public.can_read_photo(text) to authenticated;
create policy visit_photos_member_select on storage.objects for select to authenticated using (bucket_id = 'visit-photos' and public.can_read_photo(name));

-- ── Roles y matriz de permisos (sección D del documento maestro) ─────────
insert into public.roles (key, name, description, scope, external, sort_order) values
  ('administrador', 'Administrador de plataforma', 'Usuarios, roles, estructura, catálogos e integraciones. Sin acceso económico por defecto.', 'organizacion', false, 1),
  ('direccion_nacional', 'Dirección nacional', 'Estado global del canal en España.', 'organizacion', false, 2),
  ('direccion_regional', 'Dirección regional', 'Ejecución y resultados de su región.', 'unidad', false, 3),
  ('jefe_comercial', 'Jefe comercial', 'Resultados comerciales y coordinación de su ámbito.', 'unidad', false, 4),
  ('jefe_gpv', 'Jefe de GPV', 'Supervisión de GPV y reponedores de su equipo.', 'unidad', false, 5),
  ('gpv', 'GPV', 'Cartera de tiendas y coordinación de la reposición.', 'cartera', false, 6),
  ('reponedor', 'Reponedor Mahou', 'Reposición y estado de activos en sus tiendas.', 'cartera', false, 7),
  ('supervisor_conveniencia', 'Supervisor de conveniencia', 'Ejecución del servicio de su empresa externa.', 'empresa', true, 8),
  ('reponedor_conveniencia', 'Reponedor de conveniencia', 'Tareas operativas asignadas.', 'cartera', true, 9),
  ('analista', 'Analista / auditor', 'Consulta, análisis y auditoría.', 'unidad', false, 10)
on conflict (key) do update set name = excluded.name, description = excluded.description, scope = excluded.scope, external = excluded.external, sort_order = excluded.sort_order;

insert into public.role_permissions (role, permission)
select r, m || '.' || a from (values
  ('administrador', 'panel', '{consultar}'), ('administrador', 'tiendas', '{consultar,administrar}'), ('administrador', 'inventario', '{administrar}'),
  ('administrador', 'usuarios', '{consultar,crear,editar,eliminar,asignar,administrar}'), ('administrador', 'carteras', '{administrar}'),
  ('administrador', 'estructura', '{administrar}'), ('administrador', 'catalogos', '{administrar}'), ('administrador', 'empresas', '{administrar}'),
  ('administrador', 'auditoria', '{consultar,exportar}'),
  ('direccion_nacional', 'panel', '{consultar,exportar}'), ('direccion_nacional', 'tiendas', '{consultar,exportar}'), ('direccion_nacional', 'contactos', '{consultar}'),
  ('direccion_nacional', 'visitas', '{consultar,exportar}'), ('direccion_nacional', 'rutas', '{consultar}'), ('direccion_nacional', 'inventario', '{consultar,exportar}'),
  ('direccion_nacional', 'tareas', '{consultar}'), ('direccion_nacional', 'incidencias', '{consultar,exportar}'), ('direccion_nacional', 'fotos', '{consultar}'),
  ('direccion_nacional', 'acuerdos', '{consultar,exportar}'), ('direccion_nacional', 'pagos', '{consultar,exportar}'), ('direccion_nacional', 'informes', '{consultar,exportar}'),
  ('direccion_nacional', 'usuarios', '{consultar}'), ('direccion_nacional', 'carteras', '{consultar}'), ('direccion_nacional', 'estructura', '{consultar}'),
  ('direccion_nacional', 'catalogos', '{consultar}'), ('direccion_nacional', 'empresas', '{consultar}'), ('direccion_nacional', 'auditoria', '{consultar}'),
  ('direccion_regional', 'panel', '{consultar,exportar}'), ('direccion_regional', 'tiendas', '{consultar,editar,exportar}'), ('direccion_regional', 'contactos', '{consultar}'),
  ('direccion_regional', 'visitas', '{consultar,exportar}'), ('direccion_regional', 'rutas', '{consultar}'), ('direccion_regional', 'inventario', '{consultar,exportar}'),
  ('direccion_regional', 'tareas', '{consultar}'), ('direccion_regional', 'incidencias', '{consultar,exportar}'), ('direccion_regional', 'fotos', '{consultar}'),
  ('direccion_regional', 'acuerdos', '{consultar,aprobar,exportar}'), ('direccion_regional', 'pagos', '{consultar,aprobar,exportar}'), ('direccion_regional', 'informes', '{consultar,exportar}'),
  ('direccion_regional', 'usuarios', '{consultar}'), ('direccion_regional', 'carteras', '{consultar,asignar}'), ('direccion_regional', 'estructura', '{consultar}'),
  ('direccion_regional', 'catalogos', '{consultar}'), ('direccion_regional', 'empresas', '{consultar}'), ('direccion_regional', 'auditoria', '{consultar}'),
  ('jefe_comercial', 'panel', '{consultar,exportar}'), ('jefe_comercial', 'tiendas', '{consultar,crear,editar,exportar}'), ('jefe_comercial', 'contactos', '{consultar}'),
  ('jefe_comercial', 'visitas', '{consultar,exportar}'), ('jefe_comercial', 'rutas', '{consultar}'), ('jefe_comercial', 'inventario', '{consultar,exportar}'),
  ('jefe_comercial', 'tareas', '{consultar,crear,asignar}'), ('jefe_comercial', 'incidencias', '{consultar,crear,exportar}'), ('jefe_comercial', 'fotos', '{consultar}'),
  ('jefe_comercial', 'acuerdos', '{consultar,crear,editar,aprobar,exportar}'), ('jefe_comercial', 'pagos', '{consultar,aprobar,exportar}'), ('jefe_comercial', 'informes', '{consultar,exportar}'),
  ('jefe_comercial', 'usuarios', '{consultar}'), ('jefe_comercial', 'carteras', '{consultar,asignar}'), ('jefe_comercial', 'estructura', '{consultar}'),
  ('jefe_comercial', 'catalogos', '{consultar}'), ('jefe_comercial', 'empresas', '{consultar}'),
  ('jefe_gpv', 'panel', '{consultar,exportar}'), ('jefe_gpv', 'tiendas', '{consultar,editar,asignar,exportar}'), ('jefe_gpv', 'contactos', '{consultar,crear,editar}'),
  ('jefe_gpv', 'visitas', '{consultar,validar,exportar}'), ('jefe_gpv', 'rutas', '{consultar,crear,editar,asignar}'), ('jefe_gpv', 'inventario', '{consultar,editar,validar,exportar}'),
  ('jefe_gpv', 'tareas', '{consultar,crear,editar,eliminar,asignar,validar}'), ('jefe_gpv', 'incidencias', '{consultar,crear,editar,asignar,validar,exportar}'),
  ('jefe_gpv', 'fotos', '{consultar,validar}'), ('jefe_gpv', 'acuerdos', '{consultar,editar,aprobar,exportar}'), ('jefe_gpv', 'pagos', '{consultar,crear,editar,aprobar,validar,exportar}'),
  ('jefe_gpv', 'informes', '{consultar,exportar}'), ('jefe_gpv', 'usuarios', '{consultar}'), ('jefe_gpv', 'carteras', '{consultar,asignar}'),
  ('jefe_gpv', 'estructura', '{consultar}'), ('jefe_gpv', 'catalogos', '{consultar}'), ('jefe_gpv', 'empresas', '{consultar}'),
  ('gpv', 'panel', '{consultar}'), ('gpv', 'tiendas', '{consultar,crear,editar}'), ('gpv', 'contactos', '{consultar,crear,editar,eliminar}'),
  ('gpv', 'visitas', '{consultar,crear,editar}'), ('gpv', 'rutas', '{consultar,crear,editar}'), ('gpv', 'inventario', '{consultar,crear,editar,eliminar}'),
  ('gpv', 'tareas', '{consultar,crear,editar,asignar,validar}'), ('gpv', 'incidencias', '{consultar,crear,editar,asignar}'), ('gpv', 'fotos', '{consultar,crear,eliminar}'),
  ('gpv', 'acuerdos', '{consultar,crear,editar}'), ('gpv', 'pagos', '{consultar,crear,editar}'), ('gpv', 'informes', '{consultar,exportar}'),
  ('gpv', 'carteras', '{consultar}'), ('gpv', 'estructura', '{consultar}'), ('gpv', 'catalogos', '{consultar}'),
  ('reponedor', 'panel', '{consultar}'), ('reponedor', 'tiendas', '{consultar}'), ('reponedor', 'contactos', '{consultar}'),
  ('reponedor', 'visitas', '{consultar,crear,editar}'), ('reponedor', 'rutas', '{consultar,crear,editar}'), ('reponedor', 'inventario', '{consultar,editar}'),
  ('reponedor', 'tareas', '{consultar,editar}'), ('reponedor', 'incidencias', '{consultar,crear}'), ('reponedor', 'fotos', '{consultar,crear}'), ('reponedor', 'informes', '{consultar}'),
  ('supervisor_conveniencia', 'panel', '{consultar,exportar}'), ('supervisor_conveniencia', 'tiendas', '{consultar}'), ('supervisor_conveniencia', 'contactos', '{consultar}'),
  ('supervisor_conveniencia', 'visitas', '{consultar,validar}'), ('supervisor_conveniencia', 'rutas', '{consultar,crear,editar,asignar}'), ('supervisor_conveniencia', 'inventario', '{consultar}'),
  ('supervisor_conveniencia', 'tareas', '{consultar,crear,asignar,validar}'), ('supervisor_conveniencia', 'incidencias', '{consultar,crear,asignar}'), ('supervisor_conveniencia', 'fotos', '{consultar}'),
  ('supervisor_conveniencia', 'informes', '{consultar,exportar}'), ('supervisor_conveniencia', 'usuarios', '{consultar}'), ('supervisor_conveniencia', 'carteras', '{consultar,asignar}'),
  ('reponedor_conveniencia', 'panel', '{consultar}'), ('reponedor_conveniencia', 'tiendas', '{consultar}'), ('reponedor_conveniencia', 'contactos', '{consultar}'),
  ('reponedor_conveniencia', 'visitas', '{consultar,crear,editar}'), ('reponedor_conveniencia', 'rutas', '{consultar}'), ('reponedor_conveniencia', 'inventario', '{consultar,editar}'),
  ('reponedor_conveniencia', 'tareas', '{consultar,editar}'), ('reponedor_conveniencia', 'incidencias', '{consultar,crear}'), ('reponedor_conveniencia', 'fotos', '{consultar,crear}'),
  ('reponedor_conveniencia', 'informes', '{consultar}'),
  ('analista', 'panel', '{consultar,exportar}'), ('analista', 'tiendas', '{consultar,exportar}'), ('analista', 'contactos', '{consultar}'), ('analista', 'visitas', '{consultar,exportar}'),
  ('analista', 'rutas', '{consultar}'), ('analista', 'inventario', '{consultar,exportar}'), ('analista', 'tareas', '{consultar,exportar}'), ('analista', 'incidencias', '{consultar,exportar}'),
  ('analista', 'fotos', '{consultar}'), ('analista', 'acuerdos', '{consultar,exportar}'), ('analista', 'pagos', '{consultar,exportar}'), ('analista', 'informes', '{consultar,exportar}'),
  ('analista', 'usuarios', '{consultar}'), ('analista', 'carteras', '{consultar}'), ('analista', 'estructura', '{consultar}'), ('analista', 'catalogos', '{consultar}'),
  ('analista', 'empresas', '{consultar}'), ('analista', 'auditoria', '{consultar,exportar}')
) as v(r, m, acts), unnest(acts::text[]) as a
on conflict do nothing;

-- ── Organización inicial a partir de los datos actuales (no cambia ningún identificador) ──
do $$ declare owner uuid; org uuid; es uuid; an uuid; ma uuid; nm text; em text; begin
  select owner_id into owner from public.stores group by owner_id order by count(*) desc limit 1;
  if owner is null or exists (select 1 from public.organizations where owner_user_id = owner) then return; end if;
  insert into public.organizations (name, kind, owner_user_id) values ('Mahou San Miguel', 'propietaria', owner) returning id into org;
  insert into public.org_units (organization_id, kind, name, sort_order) values (org, 'pais', 'España', 1) returning id into es;
  insert into public.org_units (organization_id, parent_id, kind, name, sort_order) values (org, es, 'region', 'Andalucía', 1) returning id into an;
  insert into public.org_units (organization_id, parent_id, kind, name, sort_order) values (org, an, 'zona', 'Málaga', 1) returning id into ma;
  update public.stores set unit_id = ma where owner_id = owner and unit_id is null;
  select coalesce(p.display_name, split_part(u.email, '@', 1)), u.email into nm, em from auth.users u left join public.profiles p on p.id = u.id where u.id = owner;
  insert into public.members (user_id, organization_id, full_name, email, position, role, unit_id)
    values (owner, org, coalesce(nullif(nm, ''), 'Propietario'), em, 'GPV · propietario de la plataforma', 'gpv', ma) on conflict do nothing;
  insert into public.store_assignments (store_id, user_id, function, created_by)
    select s.id, owner, 'gpv', owner from public.stores s where s.owner_id = owner;
  insert into public.access_audit (organization_id, actor, action, target_user, detail, reason)
    values (org, owner, 'organizacion_creada', owner, jsonb_build_object('tiendas', (select count(*) from public.stores where owner_id = owner)), 'Migración a Mahou Enterprise');
end $$;
