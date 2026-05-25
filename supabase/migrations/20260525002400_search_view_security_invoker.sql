-- products_search is a plain (owner = postgres) view, so it ran with the
-- table-owner's rights and bypassed the products_public_read RLS policy --
-- leaking inactive / out-of-stock rows into /buscar, /products, category and
-- /ofertas (all read it via the search_products RPC). search_products is
-- already SECURITY INVOKER, so making the view security_invoker lets the
-- existing policy (active AND price>0 AND quantity>0, raffle exception) apply
-- as the calling user. Also clears advisor 0010_security_definer_view.
alter view public.products_search set (security_invoker = on);

-- Same footgun on available_products (self-filters in its own WHERE, so no
-- behaviour change, but it clears the same advisor ERROR and keeps the pattern
-- consistent for any future consumer).
alter view public.available_products set (security_invoker = on);
