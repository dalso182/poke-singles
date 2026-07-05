-- Seller snapshot on line items so consignment attribution survives product
-- edits/deletion AND seller-row deletion (code + name are the display payload;
-- seller_id is kept for reporting joins while the row exists).
-- No backfill: sellers is brand new — every existing item is house inventory.

alter table public.order_items
  add column seller_id   uuid references public.sellers(id) on delete set null,
  add column seller_code text,
  add column seller_name text;
