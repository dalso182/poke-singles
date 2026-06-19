-- Make products_search self-filter for storefront visibility.
--
-- products_search is security_invoker=on, so it relies on the products RLS to
-- hide inactive / out-of-stock rows. That works for anon + customer sessions,
-- but `products` also has the permissive `products_admin_all` policy
-- (FOR ALL USING is_admin()) which ORs in -- so an admin session reads every
-- row and sees sold-out products on /buscar, /products, /ofertas, /categoria
-- and in the scoped facet counts (search_set_counts / search_card_type_counts /
-- search_category_counts).
--
-- Visibility is merchandising, not security: enforce it in the view itself, the
-- same way available_products already does (active AND quantity>0 AND price>0).
-- Nothing admin-facing reads products_search (the admin product table uses the
-- base `products` table via ProductsService.list), so this is safe. Raffles are
-- already excluded by the existing category predicate, so the quantity>0 guard
-- never hides a sold-out raffle.
--
-- CREATE OR REPLACE: columns + order are unchanged (only the WHERE grows), so
-- this neither drops the view nor touches its grants; security_invoker is
-- re-asserted to be explicit. Definition captured live before editing.

create or replace view public.products_search with (security_invoker = on) as
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
  where p.category_id is distinct from raffle_category_id()
    and p.active = true
    and p.quantity > 0
    and p.price > 0;
