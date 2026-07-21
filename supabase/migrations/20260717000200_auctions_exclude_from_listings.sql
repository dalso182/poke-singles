-- Keep auctions out of the normal catalog, exactly as 20260525000100 did for
-- raffles: /subastas is the only place they surface. products_search feeds
-- /products, /buscar, /ofertas and the query-aware facet counts; the two
-- global count functions feed the sets/card-types facets. The home rails are
-- excluded client-side via ProductsService.list({ excludeAuctions }).
--
-- products_search: recreated verbatim from the CURRENT definition
-- (20260714120000_products_soft_delete.sql — deleted_at guard included) with
-- one extra WHERE term. Columns + order unchanged, so CREATE OR REPLACE keeps
-- the view's grants and the search_products() dependency intact;
-- security_invoker re-asserted to be explicit.

create or replace view public.products_search with (security_invoker = on) as
  select
    p.id, p.slug, p.name, p.pokemon_name, p.card_number, p.rarity,
    p.illustrator, p.regulation_mark, p.category, p.stage, p.type1, p.type2,
    p.legal_standard, p.legal_expanded, p.language, p.condition, p.variant,
    p.price, p.sale_price, p.quantity, p.image_url, p.set_id, p.category_id,
    p.card_ref, p.last_restocked_at, p.created_at,
    s.name as set_name,
    s.code as set_code,
    coalesce(ct.names_concat, ''::text) as card_type_names,
    concat_ws(' '::text, p.name, p.pokemon_name, p.slug, p.card_number,
      p.illustrator, p.type1, p.type2, p.regulation_mark, p.stage, p.category,
      s.name, s.code, ct.names_concat) as search_text,
    coalesce(ct.ids_array, '{}'::uuid[]) as card_type_ids,
    s.printed_total as set_printed_total
  from public.products p
    left join public.sets s on s.id = p.set_id
    left join (
      select pct.product_id,
             string_agg(c.name, ' '::text) as names_concat,
             array_agg(c.id) as ids_array
        from public.product_card_types pct
        join public.card_types c on c.id = pct.card_type_id
       group by pct.product_id
    ) ct on ct.product_id = p.id
  where p.category_id is distinct from raffle_category_id()
    and p.category_id is distinct from auction_category_id()
    and p.active = true
    and p.quantity > 0
    and p.price > 0
    and p.deleted_at is null;

-- Global facet counts read products directly (not the view), so they need the
-- same exclusion. Recreated from their current definitions (20260525000100).
create or replace function public.set_product_counts()
returns table(set_id uuid, in_stock_count bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p.set_id,
    count(*)::bigint as in_stock_count
  from public.products p
  where p.active = true
    and p.quantity > 0
    and p.price > 0
    and p.set_id is not null
    and p.category_id is distinct from public.raffle_category_id()
    and p.category_id is distinct from public.auction_category_id()
  group by p.set_id;
$$;

create or replace function public.card_type_product_counts()
returns table(card_type_id uuid, in_stock_count bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select pct.card_type_id, count(*)::bigint
  from public.products p
  join public.product_card_types pct on pct.product_id = p.id
  where p.active = true
    and p.quantity > 0
    and p.price > 0
    and p.category_id is distinct from public.raffle_category_id()
    and p.category_id is distinct from public.auction_category_id()
  group by pct.card_type_id;
$$;
