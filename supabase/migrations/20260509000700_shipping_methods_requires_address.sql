-- Per-method flag for whether the customer must supply a shipping address.
-- Default true keeps existing methods strict; admin flips pickup-style
-- methods (e.g. "Retiro Show Room") to false from /admin/shipping-methods.
-- The checkout UI hides the address fields and the place_order RPC nulls
-- out the address column when the chosen method has requires_address = false.

alter table public.shipping_methods
  add column requires_address boolean not null default true;
