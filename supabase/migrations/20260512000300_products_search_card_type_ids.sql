-- Extend products_search view to expose the card-type ids per product as
-- a uuid[] alongside the existing concatenated names. This is the hook
-- for the /products and /buscar card-type filter (array overlap with the
-- user's selected ids).
--
-- IMPORTANT: PostgreSQL's `create or replace view` only allows appending
-- new columns at the END of the column list — reordering or renaming
-- existing columns is rejected (42P16). So `card_type_ids` lives at the
-- tail of the SELECT here, not next to `card_type_names`. Functionally
-- identical for callers (column order is irrelevant when accessed by
-- name).

create or replace view public.products_search as
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
    coalesce(ct.ids_array, '{}'::uuid[]) as card_type_ids
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
