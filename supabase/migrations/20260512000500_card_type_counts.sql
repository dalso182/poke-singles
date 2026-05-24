-- Facet counts for the card-type filter.
--   * card_type_product_counts() — global, used by /products.
--   * search_card_type_counts(q) — query-aware, used by /buscar.
-- Both group by card-type id (unnested from products_search.card_type_ids
-- in the query-aware case, joined through product_card_types in the
-- global case). The faceted-search rule applies: counts are computed
-- WITHOUT the card-type filter itself so other types stay meaningful
-- options when one is already checked.

create or replace function public.card_type_product_counts()
returns table (card_type_id uuid, in_stock_count bigint)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select pct.card_type_id, count(*)::bigint
  from public.products p
  join public.product_card_types pct on pct.product_id = p.id
  where p.active = true and p.quantity > 0 and p.price > 0
  group by pct.card_type_id;
$$;

grant execute on function public.card_type_product_counts() to anon, authenticated;

create or replace function public.search_card_type_counts(q text)
returns table (card_type_id uuid, in_stock_count bigint)
language sql stable security invoker as $$
  with matches as (
    select card_type_ids
    from public.products_search
    where coalesce(q, '') = '' or search_text ilike '%' || coalesce(q, '') || '%'
  )
  select ct_id, count(*)::bigint as in_stock_count
  from matches, unnest(matches.card_type_ids) as ct_id
  group by ct_id;
$$;
