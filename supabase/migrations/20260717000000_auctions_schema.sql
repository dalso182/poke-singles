-- Auctions (subastas): a single card sold to the highest bidder. An auction IS
-- a product whose category is "Subastas" (slug = 'subastas'), mirroring the
-- raffles pattern (20260525000000): price = starting price, quantity = 1 while
-- live (0 once the winner order is created), description = notes. All
-- auction-specific lifecycle data lives in the 1:1 `auctions` table added in
-- the next migration.
--
-- This migration: seeds the Subastas category, adds the auction_category_id()
-- helper, rewrites products_public_read so auctions stay visible at quantity 0
-- (like raffles), and adds the auctions-only ban columns to profiles (checked
-- by place_bid; set manually by admin via admin_set_auction_ban).

-- The Subastas category. sort_order 101 keeps it right after Rifas (100).
insert into public.categories (slug, name, active, sort_order)
values ('subastas', 'Subastas', true, 101)
on conflict (slug) do nothing;

-- Resolve the Subastas category id once per statement (stable, zero-arg) so it
-- can be used cheaply inside the RLS predicate, products_search, and the
-- facet-count functions without a per-row subquery. security definer so anon
-- can resolve it regardless of the categories read policy. Mirror of
-- raffle_category_id().
create or replace function public.auction_category_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id from public.categories where slug = 'subastas' limit 1;
$$;

grant execute on function public.auction_category_id() to anon, authenticated;

-- Public read: same predicate as 20260714120000 (deleted_at guard included)
-- plus the auction case — auctions stay visible after the winner order zeroes
-- the stock, so /subastas can keep showing them under "Finalizadas".
drop policy products_public_read on public.products;

create policy products_public_read on public.products
  for select to anon, authenticated
  using (
    deleted_at is null
    and active = true
    and price > 0
    and (
      case
        when category_id = public.raffle_category_id() then true
        when category_id = public.auction_category_id() then true
        else quantity > 0
      end
    )
  );

-- Auctions-only ban: a banned user can still shop, checkout, and join raffles;
-- place_bid rejects them with AUCTION_BANNED. NULL = not banned.
alter table public.profiles
  add column auction_banned_at timestamptz,
  add column auction_ban_reason text;

comment on column public.profiles.auction_banned_at is
  'When set, the user cannot bid in auctions (place_bid rejects with AUCTION_BANNED). Everything else — shopping, raffles — is unaffected. Set/cleared by admin via admin_set_auction_ban().';
comment on column public.profiles.auction_ban_reason is
  'Optional admin note for why the auctions ban was applied (e.g. won and never paid).';
