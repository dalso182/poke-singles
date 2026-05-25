-- Optional friendly name for coupons (e.g. "Black Friday 550", "Pokémon Day").
-- The code stays the unique machine identifier; name is a human label shown in
-- the admin coupons list + the Coupons report. Nullable — existing coupons keep
-- a blank name until edited.

alter table public.coupons add column name text;
