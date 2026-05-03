-- Card types: a many-to-many taxonomy on products. A card can belong to
-- several at once (e.g. "Mega Pokémon" + "Full Art Pokémon"). Mirrors the
-- `categories` shape so the admin CRUD can be a copy-paste.
--
-- Seeded with the 26 facets the legacy OpenCart store used; some overlap
-- with `products.variant` ("Reverse-Holo") and `products.language`
-- ("Japanese"), which is intentional for parity with the old store.

create table public.card_types (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table public.product_card_types (
  product_id     uuid not null references public.products(id)   on delete cascade,
  card_type_id   uuid not null references public.card_types(id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (product_id, card_type_id)
);

create index product_card_types_card_type_idx
  on public.product_card_types (card_type_id);

alter table public.card_types         enable row level security;
alter table public.product_card_types enable row level security;

create policy card_types_public_read on public.card_types
  for select to anon, authenticated using (active = true);

create policy product_card_types_public_read on public.product_card_types
  for select to anon, authenticated using (true);

create policy card_types_admin_all on public.card_types
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy product_card_types_admin_all on public.product_card_types
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.card_types (slug, name, sort_order) values
  ('ace-rare',                  'Ace Rare',                   10),
  ('special-illustration-rare', 'Special Illustration Rare',  20),
  ('illustration-rare',         'Illustration Rare',          30),
  ('secret-rare',               'Secret Rare',                40),
  ('alternate-arts',            'Alternate Arts',             50),
  ('rainbow-secret',            'Rainbow Secret',             60),
  ('full-art-pokemon',          'Full Art Pokémon',           70),
  ('full-art-trainers',         'Full Art Trainers',          80),
  ('pokemon-vstar',             'Pokémon VSTAR',              90),
  ('pokemon-vmax',              'Pokémon VMAX',              100),
  ('pokemon-v',                 'Pokémon V',                 110),
  ('trainer-galarian-gallery',  'Trainer/Galarian Gallery',  120),
  ('mega-pokemon',              'Mega Pokémon',              130),
  ('scarlet-violet-ex',         'Scarlet & Violet ex',       140),
  ('pokemon-ex',                'Pokémon EX',                150),
  ('x-series-ex',               'X-Series ex',               160),
  ('pokemon-tag-team',          'Pokémon Tag Team',          170),
  ('pokemon-gx',                'Pokémon GX',                180),
  ('shiny-pokemon',             'Shiny Pokémon',             190),
  ('amazing-rare',              'Amazing Rare',              200),
  ('holograficas',              'Holográficas',              210),
  ('reverse-holo',              'Reverse-Holo',              220),
  ('trainers',                  'Trainers',                  230),
  ('promos',                    'Promos',                    240),
  ('japanese',                  'Japanese',                  250),
  ('topps',                     'Topps',                     260);
