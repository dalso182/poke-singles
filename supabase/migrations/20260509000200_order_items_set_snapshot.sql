-- Order items need set name + card number snapshots so the admin picking
-- grid can show "Twilight Masquerade · #181/167" without joining back to
-- products (which may have been deleted by the time the order is fulfilled).

alter table public.order_items
  add column product_set_name text,
  add column product_card_number text;

-- Backfill where the product link still exists. Rows whose product was
-- already deleted keep NULL; the UI falls back to nothing.
update public.order_items oi
set
  product_set_name    = s.name,
  product_card_number = p.card_number
from public.products p
left join public.sets s on s.id = p.set_id
where oi.product_id = p.id;
