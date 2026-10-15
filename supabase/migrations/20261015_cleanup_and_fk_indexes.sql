-- Limpieza: tablas sin uso en el código (comprobado: sin referencias, sin FKs entrantes, sin triggers ni funciones que las usen).
drop table if exists public.change_log;
drop table if exists public.profiles;

-- Índices para las claves foráneas (owner_id + referencia), recomendados por el asesor de Supabase.
create index if not exists import_runs_owner on public.import_runs (owner_id);
create index if not exists payment_concepts_brand_owner on public.payment_concepts (brand_id, owner_id);
create index if not exists payment_concepts_owner on public.payment_concepts (owner_id);
create index if not exists payment_concepts_store_owner on public.payment_concepts (store_id, owner_id);
create index if not exists payment_concepts_type_owner on public.payment_concepts (payment_type_id, owner_id);
create index if not exists payment_records_brand_owner on public.payment_records (brand_id, owner_id);
create index if not exists payment_records_concept_owner on public.payment_records (concept_id, owner_id);
create index if not exists payment_records_store_owner on public.payment_records (store_id, owner_id);
create index if not exists payment_records_type_owner on public.payment_records (payment_type_id, owner_id);
create index if not exists payment_records_visit_owner on public.payment_records (visit_id, owner_id);
create index if not exists route_stops_owner on public.route_stops (owner_id);
create index if not exists route_stops_route_owner on public.route_stops (route_id, owner_id);
create index if not exists route_stops_store_owner on public.route_stops (store_id, owner_id);
create index if not exists store_contacts_owner on public.store_contacts (owner_id);
create index if not exists store_contacts_store_owner on public.store_contacts (store_id, owner_id);
create index if not exists visit_photo_tags_tag_owner on public.visit_photo_tags (tag_id, owner_id);
create index if not exists visit_photos_visit_owner on public.visit_photos (visit_id, owner_id);
create index if not exists visits_contact_owner on public.visits (contact_id, owner_id);
create index if not exists visits_route_stop_owner on public.visits (route_stop_id, owner_id);
create index if not exists visits_store_owner on public.visits (store_id, owner_id);

-- Índices que quedan cubiertos por los nuevos compuestos.
drop index if exists public.payment_concepts_brand;
drop index if exists public.payment_records_brand;
drop index if exists public.visit_photo_tags_tag;
