-- Neutralize TCGdex naming in client-visible DB traffic.
--
-- A competitor inspecting the storefront's network tab could see `tcgdex_cards`
-- (detail page table read) and a `tcgdex_id` field on every product/search row,
-- revealing our card-data source. Rename the table + column to neutral names so
-- no "tcgdex" string appears in any REST URL or response body. Pure rename: the
-- external id VALUES (e.g. 'swsh3-136') are unchanged; only the identifiers move.
--
--   tcgdex_cards            -> card_details
--   products.tcgdex_id      -> products.card_ref
--   card_details.tcgdex_id  -> card_details.card_ref  (the PK)
--
-- The two views that expose the column (products_search, available_products) and
-- the search_products function (RETURNS SETOF products_search) are dropped and
-- recreated faithfully with the renamed column. Definitions were captured live.

-- 1. Drop the dependents that block the view drop / column rename.
drop function if exists public.search_products(text,text,integer,integer,uuid[],uuid[],boolean,text);
drop view if exists public.products_search;
drop view if exists public.available_products;

-- 2. Rename the column on products (FK + index follow automatically).
alter table public.products rename column tcgdex_id to card_ref;

-- 3. Rename the cache table and its PK column (FK target follows automatically).
alter table public.tcgdex_cards rename to card_details;
alter table public.card_details rename column tcgdex_id to card_ref;

-- 4. Tidy schema-internal names so "tcgdex" is gone from the schema entirely.
alter table public.products rename constraint products_tcgdex_id_fkey to products_card_ref_fkey;
alter index if exists public.products_tcgdex_id_idx rename to products_card_ref_idx;
alter policy tcgdex_cards_public_read on public.card_details rename to card_details_public_read;
alter policy tcgdex_cards_admin_all  on public.card_details rename to card_details_admin_all;

-- 5. Recreate available_products (identical to prior, card_ref instead of tcgdex_id).
create view public.available_products as
  select
    id, category_id, set_id, name, pokemon_name, slug, description, rarity,
    card_number, language, condition, price, quantity, image_url, active,
    first_listed_at, last_restocked_at, created_at, updated_at, variant,
    card_ref, illustrator, regulation_mark, category, stage, type1, type2,
    legal_standard, legal_expanded
  from public.products
  where active = true and quantity > 0 and price > 0::numeric;

-- 6. Recreate products_search (identical to prior, p.card_ref instead of p.tcgdex_id).
create view public.products_search as
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
  where p.category_id is distinct from raffle_category_id();

-- 7. Recreate search_products verbatim (its body never referenced the renamed
--    column — only the SETOF products_search return type needed re-binding).
create or replace function public.search_products(
  q text,
  sort text default 'relevance'::text,
  limit_n integer default 60,
  offset_n integer default 0,
  set_ids uuid[] default null::uuid[],
  p_card_type_ids uuid[] default null::uuid[],
  p_on_sale_only boolean default false,
  p_category_slug text default null::text
)
returns setof public.products_search
language plpgsql
stable
as $function$
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
$function$;

-- 8. Restore public read on the recreated views (DROP VIEW drops grants).
grant select on public.available_products to anon, authenticated;
grant select on public.products_search  to anon, authenticated;
