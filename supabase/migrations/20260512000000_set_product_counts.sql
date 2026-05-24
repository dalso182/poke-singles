-- Per-set in-stock product counts for the /products page Set filter.
-- One call returns the whole map; client merges with SetsService.list()
-- to render checkboxes with "(N)" counts. Sets with 0 in-stock products
-- are absent from the result (the filter hides them entirely).

create or replace function public.set_product_counts()
returns table (set_id uuid, in_stock_count bigint)
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
  group by p.set_id;
$$;

grant execute on function public.set_product_counts() to anon, authenticated;
