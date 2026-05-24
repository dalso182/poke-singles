-- Per-set counts of products matching the customer search query, for
-- faceted filtering on /buscar. Unlike set_product_counts() (which counts
-- the whole catalog), this groups only the rows that match the current
-- search and is the right input for the Set filter on the results page.
-- Mirrors the search predicate used by search_products() so the counts
-- match what the grid is showing.

create or replace function public.search_set_counts(q text)
returns table (set_id uuid, in_stock_count bigint)
language sql stable security invoker as $$
  with matches as (
    select set_id
    from public.products_search
    where coalesce(q, '') = '' or search_text ilike '%' || coalesce(q, '') || '%'
  )
  select set_id, count(*)::bigint as in_stock_count
  from matches
  where set_id is not null
  group by set_id;
$$;
