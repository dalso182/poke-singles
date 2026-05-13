-- Seed the welcome static page. Empty content on purpose: the welcome
-- modal silently skips opening while content is empty, so the deploy
-- ships without any modal until the admin writes copy in /admin/pages.

insert into public.static_pages (slug, title, content, sort_order)
values ('bienvenida', 'Bienvenido a Poke-Singles', '', 5)
on conflict (slug) do nothing;
