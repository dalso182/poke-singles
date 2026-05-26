-- products: respect caller-provided `last_restocked_at` on INSERT
--
-- The original trigger (20260501205916_initial_catalog_schema.sql) always
-- overwrote `last_restocked_at` with `now()` on INSERT whenever quantity > 0,
-- so any value the caller passed was lost. `scripts/prepare-for-prod.mjs`
-- needs to seed real historical restock dates from OpenCart's `date_modified`,
-- which only works if a caller-supplied value sticks.
--
-- Change: on INSERT only set `now()` when `new.last_restocked_at is null`.
-- The UPDATE-of-quantity branch (0 → >0 → bump to now) is unchanged, so
-- admin restock actions keep working the same way.
--
-- Backward-compatible: existing inserts that don't pass `last_restocked_at`
-- (e.g. add-product form, dev seeder) still get `now()` because the column
-- default is null.

create or replace function public.tg_products_track_restock()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.quantity > 0 and new.last_restocked_at is null then
      new.last_restocked_at := now();
    end if;
  elsif tg_op = 'UPDATE' then
    if coalesce(old.quantity, 0) = 0 and new.quantity > 0 then
      new.last_restocked_at := now();
    end if;
  end if;
  return new;
end;
$$;
