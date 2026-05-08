-- Admin-managed shipping options. Customers see only active rows; admins
-- get full CRUD + soft-delete (mirrors the categories/coupons pattern).

create table public.shipping_methods (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  price       numeric(12, 2) not null check (price >= 0),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index shipping_methods_active_idx
  on public.shipping_methods (sort_order, name)
  where deleted_at is null and is_active = true;

create trigger shipping_methods_set_updated_at
  before update on public.shipping_methods
  for each row execute function public.tg_set_updated_at();

alter table public.shipping_methods enable row level security;

create policy shipping_methods_public_read on public.shipping_methods
  for select to anon, authenticated
  using (is_active = true and deleted_at is null);

create policy shipping_methods_admin_all on public.shipping_methods
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
