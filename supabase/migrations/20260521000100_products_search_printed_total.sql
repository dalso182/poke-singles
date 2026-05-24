-- Expose sets.printed_total on products_search as set_printed_total so the
-- card grid can render "#15/151" and search_products() can filter by it.
--
-- `create or replace view` cannot reorder columns (see
-- 20260512000300_products_search_card_type_ids.sql), so set_printed_total
-- goes at the tail of the SELECT.
--
-- We deliberately do NOT mix card_number/printed_total into search_text:
-- substring ILIKE would match "115/151" for a "15/151" query. The RPC
-- handles the N/M case structurally instead.

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
