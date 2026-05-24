-- Category-targeted coupons: scope a coupon to specific product categories.
--
-- `category_ids` is an allow-list of category ids the coupon applies to.
--   NULL or empty  -> applies to ALL categories (preserves prior behavior;
--                     existing coupons keep working untouched).
--   non-empty      -> the discount only applies to the cart's items whose
--                     category_id is in this array; the FIXED_ON_THRESHOLD
--                     minimum is measured against that eligible portion too.
--
-- Stored as an array on the coupon row (not a junction table) because every
-- coupon RPC already loads the full row, so the scope rides along with no
-- extra query or join. Categories are flat and use `on delete restrict` from
-- products, so dangling ids aren't a practical concern.

alter table public.coupons add column category_ids uuid[];

comment on column public.coupons.category_ids is
  'Allow-list of category ids the coupon applies to. NULL/empty = all categories.';
