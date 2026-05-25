-- Fix the typo'd slug on the shipping-policy static page:
-- 'politica-peiddos-envios' -> 'politica-pedidos-envios'.
-- The footer already links to the correct spelling (currently a dead link), and
-- the new Información nav section links there too, so this both un-breaks the
-- footer and lets the nav resolve. The clean slug does not exist yet, so there's
-- no unique-slug conflict; re-running is a harmless 0-row update.

update public.static_pages
   set slug = 'politica-pedidos-envios'
 where slug = 'politica-peiddos-envios';
