-- PENDIENTE (no aplicada): requiere tu aprobación porque borra tablas.
-- Comprobado: sin referencias en el código, sin claves foráneas entrantes, sin triggers ni funciones que las usen.
drop table if exists public.change_log;
drop table if exists public.profiles;
-- Índices sustituidos por los compuestos de 20261015_fk_indexes.sql
drop index if exists public.payment_concepts_brand;
drop index if exists public.payment_records_brand;
drop index if exists public.visit_photo_tags_tag;
