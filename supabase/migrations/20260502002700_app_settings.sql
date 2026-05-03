-- App-wide singleton settings: exchange rate, maintenance flag/message, etc.
-- Single-row enforced via the `id boolean check (id)` trick — only `true` is
-- a legal value, so a second row would conflict on the primary key.

create table public.app_settings (
  id                       boolean primary key default true check (id),
  exchange_rate_usd_crc    numeric(12,4),
  maintenance_mode         boolean not null default false,
  maintenance_message      text,
  updated_at               timestamptz not null default now()
);

create trigger app_settings_set_updated_at
before update on public.app_settings
for each row execute function public.tg_set_updated_at();

-- Seed the only row. Subsequent inserts are blocked by the PK constraint.
insert into public.app_settings (id) values (true);

alter table public.app_settings enable row level security;

-- Public read so the storefront can read maintenance_mode / exchange_rate
-- without requiring auth. No customer-private data lives here.
create policy app_settings_public_read on public.app_settings
for select to anon, authenticated
using (true);

-- Admin-only writes (no insert path needed — the singleton is seeded above
-- and the PK constraint prevents creating a second row). Update only.
create policy app_settings_admin_update on public.app_settings
for update to authenticated
using (public.is_admin()) with check (public.is_admin());
