-- Consignment sellers. The house (Poke-Singles) has no row: products.seller_id
-- IS NULL means house inventory. Admin-only table — the storefront never reads
-- it, and place_order is SECURITY DEFINER so checkout can join it regardless.

create table public.sellers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text,
  phone       text,
  -- 2-char code, stored uppercase (client normalizes; this is the backstop).
  -- Lowercased only when appended to product slugs.
  code        text not null unique check (code ~ '^[A-Z0-9]{2}$'),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.sellers enable row level security;

-- Admin-only: no public read policy — nothing customer-facing uses sellers.
create policy sellers_admin_all on public.sellers
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Optional consignment owner. RESTRICT: a seller with products can't be
-- deleted (that would silently absorb their inventory into the house).
-- Retiring a seller = active flag; there is no delete UI.
alter table public.products
  add column seller_id uuid references public.sellers(id) on delete restrict;

create index products_seller_idx
  on public.products (seller_id) where seller_id is not null;
