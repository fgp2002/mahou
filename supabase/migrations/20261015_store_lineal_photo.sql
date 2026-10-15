alter table public.stores add column if not exists lineal_path text check (lineal_path is null or length(lineal_path) between 1 and 300), add column if not exists lineal_updated_at timestamptz;
