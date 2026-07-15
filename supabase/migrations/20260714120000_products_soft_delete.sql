-- Soft delete for products, mirroring coupons/announcements/shipping_methods.
--
-- Deleted => inactive: the client sets active=false alongside deleted_at, so
-- every storefront path that already filters on `active` (public RLS,
-- products_search, place_order's PRODUCT_UNAVAILABLE, price-review scans,
-- dashboard inventory_value) is covered without touching it. Rows are kept —
-- never hard-deleted — because sealed-payout detection and the consignment
-- reports join order_items -> products -> categories; a hard delete would
-- strand pending payout lines as NOT_SEALED.

alter table public.products
  add column deleted_at timestamptz;

comment on column public.products.deleted_at is
  'Soft-delete timestamp. NULL = live. Deleted products are also set inactive; the row survives so order_items joins (sealed payout detection, historical reports) keep working.';

-- Belt-and-braces: hide deleted rows from the public even if `active` is ever
-- flipped back on without clearing deleted_at. Same predicate as
-- 20260525000200_raffles_table.sql plus the new guard.
drop policy products_public_read on public.products;

create policy products_public_read on public.products
  for select to anon, authenticated
  using (
    deleted_at is null
    and active = true
    and price > 0
    and (
      case
        when category_id = public.raffle_category_id() then true
        else quantity > 0
      end
    )
  );

-- products_search self-filters visibility (see 20260618000000) because admin
-- sessions bypass products_public_read via products_admin_all; add the same
-- deleted_at guard there. Columns + order unchanged, so CREATE OR REPLACE
-- keeps the view's grants; security_invoker re-asserted to be explicit.
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
    and p.price > 0
    and p.deleted_at is null;
