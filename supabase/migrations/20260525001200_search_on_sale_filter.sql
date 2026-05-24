-- Add an `on sale only` filter to the customer search + facet-count RPCs so the
-- /ofertas page can list only discounted products (sale_price is not null) while
-- reusing the exact same grid + filter pipeline as /products and /buscar.
--
-- All three functions gain a trailing `p_on_sale_only boolean default false`
-- parameter and the predicate `(not p_on_sale_only or sale_price is not null)`.
-- The default keeps every existing caller (which passes the original arg list)
-- working unchanged.
--
-- Adding a parameter changes a function's argument signature, so a plain
-- `create or replace` would leave the old overload in place (two functions →
-- call ambiguity). We drop the prior signature first, then recreate, then
-- re-grant execute (drop discards grants).
--
-- Bodies recreated verbatim from the current definitions (pulled from the dev
-- DB) with only the new predicate added; products_search already excludes
-- raffles and exposes sale_price.

-- ---------------------------------------------------------------------------
-- search_products: list discounted products only when p_on_sale_only.
-- ---------------------------------------------------------------------------
drop function if exists public.search_products(text, text, int, int, uuid[], uuid[]);

create function public.search_products(
  q                text,
  sort             text default 'relevance',
  limit_n          int  default 60,
  offset_n         int  default 0,
  set_ids          uuid[] default null,
  p_card_type_ids  uuid[] default null,
  p_on_sale_only   boolean default false
) returns setof public.products_search
language plpgsql stable security invoker as $$
declare
  qtrim     text := btrim(coalesce(q, ''));
  qpat      text := '%' || btrim(coalesce(q, '')) || '%';
  qprefix   text := btrim(coalesce(q, '')) || '%';
  qempty    bool := btrim(coalesce(q, '')) = '';
  has_sets  bool := set_ids is not null and array_length(set_ids, 1) > 0;
  has_types bool := p_card_type_ids is not null and array_length(p_card_type_ids, 1) > 0;
  m         text[];
  q_num     text;
  q_total   int;
  is_nm     bool := false;
begin
  m := regexp_match(qtrim, '^(\S+)\s*/\s*(\d+)$');
  if m is not null then
    if m[1] ~ '^\d+$' then
      q_num := regexp_replace(m[1], '^0+(?=\d)', '');
    else
      q_num := m[1];
    end if;
    q_total := m[2]::int;
    is_nm   := true;
  end if;

  if sort = 'price-asc' then
    return query
      select * from public.products_search ps
      where (
        case
          when is_nm then
            regexp_replace(coalesce(ps.card_number, ''), '^0+(?=\d)', '') = q_num
            and ps.set_printed_total = q_total
          else qempty or ps.search_text ilike qpat
        end
      )
        and (not has_sets or ps.set_id = any(set_ids))
        and (not has_types or ps.card_type_ids && p_card_type_ids)
        and (not p_on_sale_only or ps.sale_price is not null)
      order by coalesce(ps.sale_price, ps.price) asc, ps.id asc
      limit limit_n offset offset_n;
  elsif sort = 'price-desc' then
    return query
      select * from public.products_search ps
      where (
        case
          when is_nm then
            regexp_replace(coalesce(ps.card_number, ''), '^0+(?=\d)', '') = q_num
            and ps.set_printed_total = q_total
          else qempty or ps.search_text ilike qpat
        end
      )
        and (not has_sets or ps.set_id = any(set_ids))
        and (not has_types or ps.card_type_ids && p_card_type_ids)
        and (not p_on_sale_only or ps.sale_price is not null)
      order by coalesce(ps.sale_price, ps.price) desc, ps.id asc
      limit limit_n offset offset_n;
  elsif sort = 'recent' then
    return query
      select * from public.products_search ps
      where (
        case
          when is_nm then
            regexp_replace(coalesce(ps.card_number, ''), '^0+(?=\d)', '') = q_num
            and ps.set_printed_total = q_total
          else qempty or ps.search_text ilike qpat
        end
      )
        and (not has_sets or ps.set_id = any(set_ids))
        and (not has_types or ps.card_type_ids && p_card_type_ids)
        and (not p_on_sale_only or ps.sale_price is not null)
      order by ps.last_restocked_at desc nulls last, ps.created_at desc, ps.id asc
      limit limit_n offset offset_n;
  else
    return query
      select * from public.products_search ps
      where (
        case
          when is_nm then
            regexp_replace(coalesce(ps.card_number, ''), '^0+(?=\d)', '') = q_num
            and ps.set_printed_total = q_total
          else qempty or ps.search_text ilike qpat
        end
      )
        and (not has_sets or ps.set_id = any(set_ids))
        and (not has_types or ps.card_type_ids && p_card_type_ids)
        and (not p_on_sale_only or ps.sale_price is not null)
      order by
        case
          when is_nm or qempty               then 99
          when ps.name ilike qprefix         then 0
          when ps.pokemon_name ilike qprefix then 1
          when ps.name ilike qpat            then 2
          else 3
        end asc,
        ps.last_restocked_at desc nulls last,
        ps.id asc
      limit limit_n offset offset_n;
  end if;
end;
$$;

grant execute on function
  public.search_products(text, text, int, int, uuid[], uuid[], boolean)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- search_set_counts: per-set facet counts, optionally on-sale only.
-- ---------------------------------------------------------------------------
drop function if exists public.search_set_counts(text);

create function public.search_set_counts(q text, p_on_sale_only boolean default false)
returns table (set_id uuid, in_stock_count bigint)
language sql stable security invoker as $$
  with matches as (
    select set_id
    from public.products_search
    where (coalesce(q, '') = '' or search_text ilike '%' || coalesce(q, '') || '%')
      and (not p_on_sale_only or sale_price is not null)
  )
  select set_id, count(*)::bigint as in_stock_count
  from matches
  where set_id is not null
  group by set_id;
$$;

grant execute on function public.search_set_counts(text, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- search_card_type_counts: per-card-type facet counts, optionally on-sale only.
-- ---------------------------------------------------------------------------
drop function if exists public.search_card_type_counts(text);

create function public.search_card_type_counts(q text, p_on_sale_only boolean default false)
returns table (card_type_id uuid, in_stock_count bigint)
language sql stable security invoker as $$
  with matches as (
    select card_type_ids
    from public.products_search
    where (coalesce(q, '') = '' or search_text ilike '%' || coalesce(q, '') || '%')
      and (not p_on_sale_only or sale_price is not null)
  )
  select ct_id, count(*)::bigint as in_stock_count
  from matches, unnest(matches.card_type_ids) as ct_id
  group by ct_id;
$$;

grant execute on function public.search_card_type_counts(text, boolean) to anon, authenticated;
