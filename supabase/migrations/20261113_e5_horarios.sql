-- ENTREGA 5 · Horarios de las tiendas para el planificador. Solo añade columnas opcionales (vacías = sin restricción).
alter table public.stores add column if not exists opening_days smallint[];
alter table public.stores add column if not exists open_time time;
alter table public.stores add column if not exists close_time time;
alter table public.stores add column if not exists preferred_from time;
alter table public.stores add column if not exists preferred_to time;
alter table public.stores add column if not exists extra_minutes integer not null default 0;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'stores_extra_minutes_check') then
    alter table public.stores add constraint stores_extra_minutes_check check (extra_minutes between 0 and 180);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stores_hours_check') then
    alter table public.stores add constraint stores_hours_check check (open_time is null or close_time is null or close_time > open_time);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stores_preferred_check') then
    alter table public.stores add constraint stores_preferred_check check (preferred_from is null or preferred_to is null or preferred_to > preferred_from);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stores_opening_days_check') then
    alter table public.stores add constraint stores_opening_days_check check (opening_days is null or opening_days <@ array[0,1,2,3,4,5,6]::smallint[]);
  end if;
end $$;
