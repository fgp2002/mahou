alter table public.payment_brands add column if not exists logo_path text check (logo_path is null or length(logo_path) between 1 and 300);
