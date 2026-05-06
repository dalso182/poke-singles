-- Customer cart. Composite PK (user_id, product_id) enforces "one line per
-- SKU per user" — adding the same product just bumps quantity via upsert.
-- FK cascades take care of cleanup: deleting a product (admin) auto-clears
-- it from all carts; deleting a user wipes their cart.
--
-- Anonymous carts live in localStorage on the client; on sign-in the
-- CartService merges them into this table and clears localStorage.

create table public.cart_items (
  user_id     uuid not null references auth.users(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,
  quantity    integer not null check (quantity > 0),
  added_at    timestamptz not null default now(),
  primary key (user_id, product_id)
);

create index cart_items_user_idx
  on public.cart_items (user_id, added_at desc);

alter table public.cart_items enable row level security;

-- Self-only access. Admins don't get a policy here — they have no need to
-- read other users' carts. (Orders will get their own table later with
-- separate admin visibility for fulfilment.)
create policy cart_items_self_all on public.cart_items
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
