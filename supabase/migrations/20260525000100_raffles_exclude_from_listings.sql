-- Keep raffles out of the normal catalog. Everything customer-facing except the
-- dedicated /rifas page reads either products_search (the /products + /buscar
-- grid and the query-aware facet counts search_set_counts / search_card_type_counts)
-- or the two global count functions. Excluding the Rifas category in those three
-- places hides raffles from search, listings, and every "(N)" facet count. The
-- home rails are excluded client-side via ProductsService.list({ excludeRaffles }).

-- products_search: recreated verbatim from the current definition with a single
-- WHERE excluding the raffle category. The column list/order is unchanged, so the
-- search_products() dependency (RETURNS SETOF products_search) stays intact.
create or replace view public.products_search as
  select p.id,
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
    coalesce(ct.names_concat, ''::text) as card_type_names,
    concat_ws(' '::text, p.name, p.pokemon_name, p.slug, p.card_number, p.illustrator, p.type1, p.type2, p.regulation_mark, p.stage, p.category, s.name, s.code, ct.names_concat) as search_text,
    coalesce(ct.ids_array, '{}'::uuid[]) as card_type_ids,
    s.printed_total as set_printed_total
   from products p
     left join sets s on s.id = p.set_id
     left join ( select pct.product_id,
            string_agg(c.name, ' '::text) as names_concat,
            array_agg(c.id) as ids_array
           from product_card_types pct
             join card_types c on c.id = pct.card_type_id
          group by pct.product_id) ct on ct.product_id = p.id
  where p.category_id is distinct from public.raffle_category_id();

-- Global facet counts read products directly (not the view), so they need the
-- same exclusion added to their WHERE.
create or replace function public.set_product_counts()
returns table(set_id uuid, in_stock_count bigint)
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
    and p.category_id is distinct from public.raffle_category_id()
  group by p.set_id;
$$;

create or replace function public.card_type_product_counts()
returns table(card_type_id uuid, in_stock_count bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select pct.card_type_id, count(*)::bigint
  from public.products p
  join public.product_card_types pct on pct.product_id = p.id
  where p.active = true
    and p.quantity > 0
    and p.price > 0
    and p.category_id is distinct from public.raffle_category_id()
  group by pct.card_type_id;
$$;
