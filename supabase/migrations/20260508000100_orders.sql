-- Orders + order_items. user_id is nullable because guests can checkout.
-- Customer info, shipping method snapshot, line item snapshots are all
-- denormalised onto the order so it's a stable record.

create table public.orders (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid references auth.users(id) on delete set null,
  status                  text not null default 'pending'
                              check (status in ('pending','paid','shipped','completed','cancelled')),
  customer_email          text not null,
  customer_name           text not null,
  customer_phone          text not null,
  shipping_address        jsonb,
  shipping_method_id      uuid references public.shipping_methods(id) on delete set null,
  shipping_method_name    text not null,
  shipping_amount         numeric(12, 2) not null default 0,
  payment_method          text not null
                              check (payment_method in ('sinpe_or_transfer','payment_link')),
  payment_proof_url       text,
  subtotal                numeric(12, 2) not null,
  discount_amount         numeric(12, 2) not null default 0,
  coupon_id               uuid references public.coupons(id) on delete set null,
  coupon_code             text,
  total                   numeric(12, 2) not null,
  customer_notes          text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index orders_user_idx
  on public.orders (user_id, created_at desc) where user_id is not null;
create index orders_status_idx
  on public.orders (status, created_at desc);
create index orders_email_idx on public.orders (customer_email);

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.tg_set_updated_at();

-- Line items, snapshot-only (so historical orders survive product edits).
create table public.order_items (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete cascade,
  product_id          uuid references public.products(id) on delete set null,
  product_slug        text not null,
  product_name        text not null,
  product_image_url   text,
  product_condition   text,
  unit_price          numeric(12, 2) not null,
  quantity            integer not null check (quantity > 0),
  line_total          numeric(12, 2) not null,
  created_at          timestamptz not null default now()
);

create index order_items_order_idx on public.order_items (order_id);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Authenticated customers see their own orders. Anon access goes through
-- the get_guest_order RPC (id + email match) — no public read policy.
create policy orders_self_read on public.orders
  for select to authenticated
  using (user_id = auth.uid());

create policy order_items_self_read on public.order_items
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and o.user_id = auth.uid()
    )
  );

-- Admins see and manage everything.
create policy orders_admin_all on public.orders
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy order_items_admin_all on public.order_items
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- No insert policy for non-admin users — order creation goes exclusively
-- through the place_order RPC (security definer).
