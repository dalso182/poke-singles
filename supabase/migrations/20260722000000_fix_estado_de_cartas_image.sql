-- The estado-de-cartas seed (20260510000100) hot-linked an image from the old
-- OpenCart site, which is now offline. Swap it for the brand logo that ships
-- with every Angular build (root-relative, so it survives the domain cutover).
-- Idempotent: replace() is a no-op once the old URL is gone.

update static_pages
   set content = replace(
     content,
     'https://poke-singles.com/image/catalog/Logo-Borde-400x400.png',
     '/assets/images/poke-singles-logo.png'
   )
 where slug = 'estado-de-cartas';
