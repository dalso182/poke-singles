-- Coupons. Two types only: PERCENTAGE (e.g. 15% off subtotal) and
-- FIXED_ON_THRESHOLD (e.g. ₡10 000 off when subtotal >= ₡50 000). Customers
-- never read this table directly — their access is mediated by the
-- validate_coupon / calculate_coupon_discount RPCs (security definer) which
-- return only the fields the cart needs.

create table public.coupons (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null unique check (code = upper(code) and length(code) >= 3),
  type                 text not null check (type in ('PERCENTAGE', 'FIXED_ON_THRESHOLD')),
  discount_value       numeric(12, 2) not null check (discount_value > 0),
  min_purchase_amount  numeric(12, 2),
  expires_at           timestamptz not null,
  max_uses_per_user    integer not null default 1 check (max_uses_per_user >= 1),
  is_active            boolean not null default true,
  deleted_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- Type-specific guards.
  constraint coupons_percentage_value_capped
    check (type <> 'PERCENTAGE' or discount_value <= 100),
  constraint coupons_fixed_requires_minimum
    check (type <> 'FIXED_ON_THRESHOLD'
           or (min_purchase_amount is not null and min_purchase_amount > 0))
);

create index coupons_active_idx
  on public.coupons (is_active, expires_at)
  where deleted_at is null;

create trigger coupons_set_updated_at
  before update on public.coupons
  for each row execute function public.tg_set_updated_at();

alter table public.coupons enable row level security;

-- Admins manage everything.
create policy coupons_admin_all on public.coupons
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No public/customer read policy on purpose. Customers go through the
-- validate_coupon RPC.
