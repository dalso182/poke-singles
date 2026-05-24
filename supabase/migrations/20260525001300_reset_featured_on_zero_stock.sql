-- Sell-out clears the `featured` flag so a later restock doesn't silently
-- resurface the product on the home "Destacadas" rail. Extends the existing
-- restock trigger function — the `products_track_restock` trigger already fires
-- `before insert or update of quantity`, so no trigger change is needed, and as a
-- BEFORE trigger mutating `new.featured` is free. Covers every path that drives
-- stock to 0, including the `place_order` RPC's quantity decrement.

create or replace function public.tg_products_track_restock()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.quantity > 0 then
      new.last_restocked_at := now();
    end if;
  elsif tg_op = 'UPDATE' then
    if coalesce(old.quantity, 0) = 0 and new.quantity > 0 then
      new.last_restocked_at := now();
    end if;
    if coalesce(old.quantity, 0) > 0 and new.quantity = 0 and new.featured then
      new.featured := false;
    end if;
  end if;
  return new;
end;
$$;

-- One-time cleanup of any rows already in the inconsistent state.
update public.products set featured = false where featured = true and quantity = 0;
