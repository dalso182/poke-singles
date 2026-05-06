-- Per-user cart-level state. Currently only holds `coupon_id`; can grow
-- (notes, shipping_method, etc.) without restructuring. Lazy-created on
-- first apply via upsert; auto-cascaded on user delete.
--
-- The existing `cart_items` table is keyed by user_id directly; this is
-- a *companion* table for cross-line metadata, not a replacement.

create table public.carts (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  coupon_id   uuid references public.coupons(id) on delete set null,
  updated_at  timestamptz not null default now()
);

create index carts_coupon_idx on public.carts (coupon_id) where coupon_id is not null;

create trigger carts_set_updated_at
  before update on public.carts
  for each row execute function public.tg_set_updated_at();

alter table public.carts enable row level security;

create policy carts_self_all on public.carts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No admin policy: admins don't manage individual carts. Cart data is
-- ephemeral state, not a record-keeping concern.
