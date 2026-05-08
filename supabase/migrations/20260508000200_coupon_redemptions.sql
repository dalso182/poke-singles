-- Coupon redemption ledger. One row per (coupon, order). Per-user limit
-- counts go through user_id when available, guest_email when not.

create table public.coupon_redemptions (
  id                       uuid primary key default gen_random_uuid(),
  coupon_id                uuid not null references public.coupons(id),
  user_id                  uuid references auth.users(id) on delete set null,
  guest_email              text,
  order_id                 uuid not null references public.orders(id) on delete cascade,
  discount_amount_applied  numeric(12, 2) not null check (discount_amount_applied >= 0),
  redeemed_at              timestamptz not null default now()
);

create index coupon_redemptions_user_idx
  on public.coupon_redemptions (coupon_id, user_id) where user_id is not null;
create index coupon_redemptions_guest_idx
  on public.coupon_redemptions (coupon_id, guest_email) where guest_email is not null;
create index coupon_redemptions_order_idx
  on public.coupon_redemptions (order_id);

alter table public.coupon_redemptions enable row level security;

-- Customers see their own redemptions (order history → coupon used).
create policy coupon_redemptions_self_read on public.coupon_redemptions
  for select to authenticated
  using (user_id = auth.uid());

create policy coupon_redemptions_admin_all on public.coupon_redemptions
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Inserts only via the place_order RPC (security definer). No insert policy.
