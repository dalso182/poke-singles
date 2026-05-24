-- Optional per-product discounted price. NULL means no sale.
-- Constraint enforces:
--   * sale_price either NULL or > 0 (matches the RLS `price > 0` invariant —
--     a sale_price of 0 would still be a free listing visible to customers).
--   * sale_price strictly below `price` (a "discount" that doesn't undercut
--     the regular price is a bug; reject at write-time).
-- The cart, listings, and search-sort all treat coalesce(sale_price, price)
-- as the effective price. A future /offers page can query
-- `sale_price is not null` directly.

alter table public.products
  add column sale_price numeric(10,2)
  check (sale_price is null or (sale_price > 0 and sale_price < price));

-- ---------------------------------------------------------------------------
-- Recreate products_search to expose sale_price.
-- `create or replace view` cannot reorder columns, and the previous version
-- (20260521000100_products_search_printed_total.sql) already added trailing
-- columns at the tail. Drop-and-recreate keeps the column list tidy.
-- search_products() depends on this view; we recreate it below as well, so
-- the drop cascade in postgres doesn't matter — we re-emit both.
-- ---------------------------------------------------------------------------

drop view if exists public.products_search cascade;

create view public.products_search as
  select
    p.id,
    p.slug,
    p.name,
    p.pokemon_name,
    p.card_number,
    p.rarity,
    p.illustrator,
    p.regulation_mark,
    p.category,
    p.stage,
    p.type1,
    p.type2,
    p.legal_standard,
    p.legal_expanded,
    p.language,
    p.condition,
    p.variant,
    p.price,
    p.sale_price,
    p.quantity,
    p.image_url,
    p.set_id,
    p.category_id,
    p.tcgdex_id,
    p.last_restocked_at,
    p.created_at,
    s.name as set_name,
    s.code as set_code,
    coalesce(ct.names_concat, '') as card_type_names,
    concat_ws(' ',
      p.name,
      p.pokemon_name,
      p.slug,
      p.card_number,
      p.illustrator,
      p.type1,
      p.type2,
      p.regulation_mark,
      p.stage,
      p.category,
      s.name,
      s.code,
      ct.names_concat
    ) as search_text,
    coalesce(ct.ids_array, '{}'::uuid[]) as card_type_ids,
    s.printed_total as set_printed_total
  from public.products p
  left join public.sets s on s.id = p.set_id
  left join (
    select
      pct.product_id,
      string_agg(c.name, ' ') as names_concat,
      array_agg(c.id) as ids_array
    from public.product_card_types pct
    join public.card_types c on c.id = pct.card_type_id
    group by pct.product_id
  ) ct on ct.product_id = p.id;

-- ---------------------------------------------------------------------------
-- Recreate search_products(): sort by coalesce(sale_price, price) for
-- price-asc / price-desc so customers see what they'd actually pay. All other
-- branches mirror 20260521000300_search_products_strip_leading_zeros.sql.
-- ---------------------------------------------------------------------------

create or replace function public.search_products(
  q                text,
  sort             text default 'relevance',
  limit_n          int  default 60,
  offset_n         int  default 0,
  set_ids          uuid[] default null,
  p_card_type_ids  uuid[] default null
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
