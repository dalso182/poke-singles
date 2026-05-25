-- Per-category in-stock product counts, for the "Categoría" facet on the
-- all-products (/products) listing. Mirrors search_set_counts: reads
-- products_search (which already excludes rifas and applies the active/in-stock/
-- priced RLS), optionally scoped by the on-sale flag.

create or replace function public.search_category_counts(
  q text,
  p_on_sale_only boolean default false
)
returns table (category_id uuid, in_stock_count bigint)
language sql stable security invoker as $$
  select category_id, count(*)::bigint as in_stock_count
  from public.products_search
  where (coalesce(q, '') = '' or search_text ilike '%' || coalesce(q, '') || '%')
    and (not p_on_sale_only or sale_price is not null)
    and category_id is not null
  group by category_id;
$$;

grant execute on function public.search_category_counts(text, boolean) to anon, authenticated;
