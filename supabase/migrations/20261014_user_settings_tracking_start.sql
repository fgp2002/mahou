alter table public.user_settings add column if not exists tracking_start date not null default current_date;
