-- shipping_methods.allowed_category_ids: optional allow-list of category ids
-- this method serves. Empty array (the default) means "available for every
-- cart" — admins opt in to restrict. Used by both the checkout filter and the
-- place_order RPC's server-side guard.

alter table public.shipping_methods
  add column allowed_category_ids uuid[] not null default '{}';

comment on column public.shipping_methods.allowed_category_ids is
  'Empty = available for all categories; otherwise the method is only offered when every distinct category in the cart appears in this list.';
