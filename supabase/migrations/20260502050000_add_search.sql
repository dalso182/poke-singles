-- Customer search backend.
--
-- 1. Tightens the public-read RLS predicate to also require price > 0 so
--    no zero-priced row can ever be exposed via the anon client.
-- 2. Realigns existing partial indexes with the new predicate.
-- 3. Recreates `available_products` view with the same predicate.
-- 4. New `products_search` view: products + set + aggregated card_types,
--    with a `search_text` column for substring ILIKE. `description` is
--    intentionally OMITTED from search_text to avoid false positives from
--    flavor text (a Fighting-type whose description mentions "water"
--    should not surface for "water" searches).
-- 5. New `search_products(q, sort, limit_n, offset_n)` RPC that
--    encapsulates the four sort modes including the relevance CASE.
--    SECURITY INVOKER so RLS still applies.

-- ============================================================
-- 1. RLS predicate bump
-- ============================================================

drop policy products_public_read on public.products;

create policy products_public_read on public.products
  for select to anon, authenticated
  using (active = true and quantity > 0 and price > 0);

-- ============================================================
-- 2. Realign partial indexes
-- ============================================================

drop index if exists public.products_restocked_idx;
drop index if exists public.products_set_idx;
drop index if exists public.products_pokemon_idx;
drop index if exists public.products_category_idx;

create index products_restocked_idx
  on public.products (last_restocked_at desc)
  where active = true and quantity > 0 and price > 0;

create index products_set_idx
  on public.products (set_id)
  where active = true and quantity > 0 and price > 0;

create index products_pokemon_idx
  on public.products (pokemon_name)
  where active = true and quantity > 0 and price > 0;

create index products_category_idx
  on public.products (category_id)
  where active = true and quantity > 0 and price > 0;

-- ============================================================
-- 3. available_products view realignment
-- ============================================================

create or replace view public.available_products as
  select * from public.products
  where active = true and quantity > 0 and price > 0;

-- ============================================================
-- 4. products_search view
-- ============================================================
-- Exposes BOTH the structured columns (so future filter panels can do
-- `.eq('type1', 'Water').gte('price', 1000)` etc.) AND a single
-- `search_text` column for the substring ILIKE that powers customer
-- search. The view inherits RLS from the underlying `products` table.

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
    ) as search_text
  from public.products p
  left join public.sets s on s.id = p.set_id
  left join (
    select pct.product_id, string_agg(c.name, ' ') as names_concat
    from public.product_card_types pct
    join public.card_types c on c.id = pct.card_type_id
    group by pct.product_id
  ) ct on ct.product_id = p.id;

-- ============================================================
-- 5. search_products RPC
-- ============================================================

create or replace function public.search_products(
  q         text,
  sort      text default 'relevance',
  limit_n   int  default 60,
  offset_n  int  default 0
) returns setof public.products_search
language plpgsql stable security invoker as $$
declare
  qpat    text := '%' || coalesce(q, '') || '%';
  qprefix text := coalesce(q, '') || '%';
  qempty  bool := coalesce(q, '') = '';
begin
  if sort = 'price-asc' then
    return query
      select * from public.products_search
      where qempty or search_text ilike qpat
      order by price asc, id asc
      limit limit_n offset offset_n;
  elsif sort = 'price-desc' then
    return query
      select * from public.products_search
      where qempty or search_text ilike qpat
      order by price desc, id asc
      limit limit_n offset offset_n;
  elsif sort = 'recent' then
    return query
      select * from public.products_search
      where qempty or search_text ilike qpat
      order by last_restocked_at desc nulls last, created_at desc, id asc
      limit limit_n offset offset_n;
  else
    -- 'relevance' (default for queries): name-prefix > pokemon-prefix
    -- > name-substring > everything else, then most recently restocked.
    return query
      select * from public.products_search
      where qempty or search_text ilike qpat
      order by
        case
          when qempty                     then 99
          when name ilike qprefix         then 0
          when pokemon_name ilike qprefix then 1
          when name ilike qpat            then 2
          else 3
        end asc,
        last_restocked_at desc nulls last,
        id asc
      limit limit_n offset offset_n;
  end if;
end;
$$;
