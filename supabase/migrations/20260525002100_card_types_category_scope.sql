-- Scope card_types to a category so the admin "Filtros" screen can manage one
-- classification list per category. Existing rows stay category_id = NULL =
-- global (the singles/graded "Rareza" tags, multi-select). New rows are scoped
-- to a single category (sealed / accessories) and are single-select per product
-- (enforced in the admin UI; they still ride the product_card_types junction so
-- products_search.card_type_ids and the existing filter plumbing are reused).

alter table public.card_types
  add column category_id uuid references public.categories(id) on delete cascade;

create index card_types_category_idx on public.card_types (category_id);

-- Sealed (sellado) sub-types.
insert into public.card_types (slug, name, sort_order, category_id) values
  ('sellado-etb',         'ETB',          10, (select id from public.categories where slug = 'sellado')),
  ('sellado-booster',     'Booster',      20, (select id from public.categories where slug = 'sellado')),
  ('sellado-booster-box', 'Booster Box',  30, (select id from public.categories where slug = 'sellado')),
  ('sellado-deck',        'Deck',         40, (select id from public.categories where slug = 'sellado')),
  ('sellado-collection',  'Collection',   50, (select id from public.categories where slug = 'sellado')),
  ('sellado-upc',         'UPC',          60, (select id from public.categories where slug = 'sellado'));

-- Accessories (accesorios) sub-types.
insert into public.card_types (slug, name, sort_order, category_id) values
  ('acc-protectores', 'Protectores', 10, (select id from public.categories where slug = 'accesorios')),
  ('acc-sleeves',     'Sleeves',     20, (select id from public.categories where slug = 'accesorios')),
  ('acc-dados',       'Dados',       30, (select id from public.categories where slug = 'accesorios')),
  ('acc-pines',       'Pines',       40, (select id from public.categories where slug = 'accesorios')),
  ('acc-figuras',     'Figuras',     50, (select id from public.categories where slug = 'accesorios')),
  ('acc-monedas',     'Monedas',     60, (select id from public.categories where slug = 'accesorios')),
  ('acc-deckboxes',   'Deckboxes',   70, (select id from public.categories where slug = 'accesorios')),
  ('acc-playmats',    'Playmats',    80, (select id from public.categories where slug = 'accesorios')),
  ('acc-otros',       'Otros',       90, (select id from public.categories where slug = 'accesorios'));
