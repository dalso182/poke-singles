-- Add a category filter to the customer search + facet-count RPCs so the
-- storefront can browse a single category (/categoria/:slug) by reusing the
-- same grid + filter pipeline as /products and /ofertas.
--
-- Builds on 20260525001200_search_on_sale_filter.sql: each function gains a
-- trailing `p_category_slug text default null` parameter and the predicate
-- `(p_category_slug is null or category_id = category_id_by_slug(p_category_slug))`.
-- The default keeps every existing caller (incl. /products and /ofertas, which
-- omit the new arg) working unchanged.
--
-- Same drop-before-recreate + re-grant gotcha as the on-sale migration: adding a
-- parameter changes the argument signature, so a plain create-or-replace would
-- leave the prior overload in place. Bodies are the 20260525001200 definitions
-- with only the category resolver + predicate added.

-- ---------------------------------------------------------------------------
-- Slug -> category id resolver. Mirrors raffle_category_id(): security definer
-- so anon can resolve without categories read perms; stable so the planner can
-- treat it as a constant inside WHERE. Unknown / inactive slug -> null -> the
-- equality predicate matches no rows (empty page). Rifas rows are already kept
-- out of products_search, so /categoria/rifas is harmlessly empty.
-- ---------------------------------------------------------------------------
create or replace function public.category_id_by_slug(p_slug text)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id from public.categories where slug = p_slug and active = true limit 1;
$$;

grant execute on function public.category_id_by_slug(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- search_products: scope to one category when p_category_slug is provided.
-- ---------------------------------------------------------------------------
drop function if exists public.search_products(text, text, int, int, uuid[], uuid[], boolean);

create function public.search_products(
  q                text,
  sort             text default 'relevance',
  limit_n          int  default 60,
  offset_n         int  default 0,
  set_ids          uuid[] default null,
  p_card_type_ids  uuid[] default null,
  p_on_sale_only   boolean default false,
  p_category_slug  text default null
) returns setof public.products_search
language plpgsql stable security invoker as $$
declare
  qtrim     text := btrim(coalesce(q, ''));
  qpat      text := '%' || btrim(coalesce(q, '')) || '%';
  qprefix   text := btrim(coalesce(q, '')) || '%';
  qempty    bool := btrim(coalesce(q, '')) = '';
  has_sets  bool := set_ids is not null and array_length(set_ids, 1) > 0;
  has_types bool := p_card_type_ids is not null and array_length(p_card_type_ids, 1) > 0;
  v_cat_id  uuid := case when p_category_slug is null then null
                         else public.category_id_by_slug(p_category_slug) end;
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
        and (p_category_slug is null or ps.category_id = v_cat_id)
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
        and (p_category_slug is null or ps.category_id = v_cat_id)
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
        and (p_category_slug is null or ps.category_id = v_cat_id)
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
        and (p_category_slug is null or ps.category_id = v_cat_id)
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
  public.search_products(text, text, int, int, uuid[], uuid[], boolean, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- search_set_counts: per-set facet counts, optionally scoped to a category.
-- ---------------------------------------------------------------------------
drop function if exists public.search_set_counts(text, boolean);

create function public.search_set_counts(
  q text,
  p_on_sale_only boolean default false,
  p_category_slug text default null
)
returns table (set_id uuid, in_stock_count bigint)
language sql stable security invoker as $$
  with matches as (
    select set_id
    from public.products_search
    where (coalesce(q, '') = '' or search_text ilike '%' || coalesce(q, '') || '%')
      and (not p_on_sale_only or sale_price is not null)
      and (p_category_slug is null or category_id = public.category_id_by_slug(p_category_slug))
  )
  select set_id, count(*)::bigint as in_stock_count
  from matches
  where set_id is not null
  group by set_id;
$$;

grant execute on function public.search_set_counts(text, boolean, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- search_card_type_counts: per-card-type facet counts, optionally by category.
-- ---------------------------------------------------------------------------
drop function if exists public.search_card_type_counts(text, boolean);

create function public.search_card_type_counts(
  q text,
  p_on_sale_only boolean default false,
  p_category_slug text default null
)
returns table (card_type_id uuid, in_stock_count bigint)
language sql stable security invoker as $$
  with matches as (
    select card_type_ids
    from public.products_search
    where (coalesce(q, '') = '' or search_text ilike '%' || coalesce(q, '') || '%')
      and (not p_on_sale_only or sale_price is not null)
      and (p_category_slug is null or category_id = public.category_id_by_slug(p_category_slug))
  )
  select ct_id, count(*)::bigint as in_stock_count
  from matches, unnest(matches.card_type_ids) as ct_id
  group by ct_id;
$$;

grant execute on function public.search_card_type_counts(text, boolean, text) to anon, authenticated;
