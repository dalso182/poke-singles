-- Legacy OpenCart store totals, preserved through the 2026-07 prod promotion.
-- The new store started fresh (no order import), so the lifetime numbers of the
-- old store live here for future dashboard/reporting use. `if not exists` keeps
-- this idempotent: prod gets the columns via the one-off cleanup script first,
-- and the first `db:push:prod` reconciles migration history cleanly.

alter table public.app_settings
  add column if not exists legacy_order_count integer not null default 0,
  add column if not exists legacy_sales_total_crc numeric not null default 0;

comment on column public.app_settings.legacy_order_count is
  'Lifetime order count of the OpenCart store at cutover (orders up to #7303).';
comment on column public.app_settings.legacy_sales_total_crc is
  'Lifetime sales total in colones of the OpenCart store at cutover.';
