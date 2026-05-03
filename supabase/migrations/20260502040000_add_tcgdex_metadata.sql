-- TCGdex card-data cache. Keyed by TCGdex's stable card id (e.g. "sv05-001").
-- Many products can reference one card row (different variant/condition/
-- language SKUs of the same card share metadata), so deduping here keeps
-- the products table lean and lets a future "refresh TCGdex cache" admin
-- button rehydrate every variant from a single fetch.

create table public.tcgdex_cards (
  tcgdex_id    text primary key,
  data         jsonb not null,
  fetched_at   timestamptz not null default now()
);

alter table public.tcgdex_cards enable row level security;

create policy tcgdex_cards_public_read on public.tcgdex_cards
  for select to anon, authenticated using (true);

create policy tcgdex_cards_admin_all on public.tcgdex_cards
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Promoted columns on products. All nullable: manual entries (sealed,
-- accessories) won't have any of them, and older TCGdex cards may be missing
-- some fields too. App-side validation only -- no CHECK constraints because
-- TCGdex can introduce new values without a migration.
alter table public.products
  add column tcgdex_id        text references public.tcgdex_cards(tcgdex_id) on delete set null,
  add column illustrator      text,
  add column regulation_mark  text,
  add column category         text,
  add column stage            text,
  add column type1            text,
  add column type2            text,
  add column legal_standard   boolean,
  add column legal_expanded   boolean;

-- Filter indexes on the high-value facets, scoped to the rows the public
-- store can actually see (matches the products_public_read RLS predicate).
create index products_regulation_mark_idx on public.products (regulation_mark)
  where active = true and quantity > 0;
create index products_illustrator_idx     on public.products (illustrator)
  where active = true and quantity > 0;
create index products_type1_idx           on public.products (type1)
  where active = true and quantity > 0;
create index products_tcgdex_id_idx       on public.products (tcgdex_id);
