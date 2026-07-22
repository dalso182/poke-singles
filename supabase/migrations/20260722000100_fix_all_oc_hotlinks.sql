-- Sweep of 20260722000000: `sobre-nosotros` (edited via the admin Pages editor,
-- so no seed migration to catch it) hot-links the same OpenCart image. Replace
-- it across ALL static pages so no row keeps a reference to the offline OC site.
-- Idempotent: replace() is a no-op once the old URL is gone.

update static_pages
   set content = replace(
     content,
     'https://poke-singles.com/image/catalog/Logo-Borde-400x400.png',
     '/assets/images/poke-singles-logo.png'
   )
 where content like '%https://poke-singles.com/image/catalog/%';
