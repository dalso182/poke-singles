-- Variant of a card printing (normal / holo / reverse / 1st edition / promo).
-- Sourced from TCGdex's `card.variants` object when adding a product via the
-- typeahead; in manual mode the admin picks from the full list. Nullable
-- because non-card products (sealed, accessories) don't have a variant.
--
-- No CHECK constraint: the allowed set lives in the app (`VARIANT_OPTIONS`)
-- so adding a new TCGdex variant later doesn't require a migration.

alter table public.products
  add column variant text;
