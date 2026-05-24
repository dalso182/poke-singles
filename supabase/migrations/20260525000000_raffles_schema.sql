-- Raffles (rifas): a product sold as N entries. A raffle IS a product whose
-- category is "Rifas" (slug = 'rifas'); quantity = entries remaining, price =
-- per-entry price, the name carries the entry count ("Pikachu EX - 10 entries"),
-- and description carries the notes. The only new column is the draw date.
--
-- This migration: adds products.raffle_date, seeds the Rifas category, adds the
-- raffle_category_id() helper, and rewrites products_public_read so raffles stay
-- visible after selling out (until the draw date passes) instead of vanishing at
-- quantity 0 like normal cards.

alter table public.products
  add column raffle_date timestamptz;

comment on column public.products.raffle_date is
  'Draw date/time for raffle products (category slug = rifas). NULL = TBD. Ignored for non-raffle products.';

-- The Rifas category. sort_order 100 keeps it after the normal catalog buckets.
insert into public.categories (slug, name, active, sort_order)
values ('rifas', 'Rifas', true, 100)
on conflict (slug) do nothing;

-- Resolve the Rifas category id once per statement (stable, zero-arg) so it can
-- be used cheaply inside the RLS predicate, the products_search view, and the
-- facet-count functions without a per-row subquery. security definer so anon can
-- resolve it regardless of the categories read policy.
create or replace function public.raffle_category_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id from public.categories where slug = 'rifas' limit 1;
$$;

grant execute on function public.raffle_category_id() to anon, authenticated;

-- Public read: normal products need quantity > 0 (sold-out cards disappear);
-- raffles instead stay visible until their draw date passes, so customers can
-- still see a full raffle as AGOTADA before the sorteo. Both still require
-- active = true and price > 0 (unchanged from the previous predicate).
drop policy products_public_read on public.products;

create policy products_public_read on public.products
  for select to anon, authenticated
  using (
    active = true
    and price > 0
    and (
      case
        when category_id = public.raffle_category_id()
          then (raffle_date is null or raffle_date >= now())
        else quantity > 0
      end
    )
  );
