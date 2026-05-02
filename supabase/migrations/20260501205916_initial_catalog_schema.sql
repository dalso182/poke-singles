-- Initial catalog schema: categories, sets, products
-- See ./README.md for explanation of triggers + RLS.

-- ============================================================
-- Tables
-- ============================================================

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table public.sets (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  name              text not null,
  series            text,
  release_date      date,
  symbol_image_url  text,
  created_at        timestamptz not null default now()
);

create table public.products (
  id                  uuid primary key default gen_random_uuid(),
  category_id         uuid not null references public.categories(id) on delete restrict,
  set_id              uuid references public.sets(id) on delete set null,
  name                text not null,
  pokemon_name        text,
  slug                text not null unique,
  description         text,
  rarity              text,
  card_number         text,
  language            text not null default 'EN',
  condition           text,
  price               numeric(10,2) not null check (price >= 0),
  quantity            integer not null default 0 check (quantity >= 0),
  image_url           text,
  active              boolean not null default true,
  first_listed_at     timestamptz not null default now(),
  last_restocked_at   timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ============================================================
-- Trigger functions
-- ============================================================

create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.tg_products_track_restock()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.quantity > 0 then
      new.last_restocked_at := now();
    end if;
  elsif tg_op = 'UPDATE' then
    if coalesce(old.quantity, 0) = 0 and new.quantity > 0 then
      new.last_restocked_at := now();
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.tg_products_normalize_pokemon_name()
returns trigger language plpgsql as $$
begin
  if new.pokemon_name is not null then
    new.pokemon_name := lower(trim(new.pokemon_name));
    if new.pokemon_name = '' then
      new.pokemon_name := null;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.tg_products_pin_first_listed_at()
returns trigger language plpgsql as $$
begin
  new.first_listed_at := old.first_listed_at;
  return new;
end;
$$;

-- ============================================================
-- Triggers
-- ============================================================

create trigger products_set_updated_at
before update on public.products
for each row execute function public.tg_set_updated_at();

create trigger products_track_restock
before insert or update of quantity on public.products
for each row execute function public.tg_products_track_restock();

create trigger products_normalize_pokemon_name
before insert or update of pokemon_name on public.products
for each row execute function public.tg_products_normalize_pokemon_name();

create trigger products_pin_first_listed_at
before update on public.products
for each row execute function public.tg_products_pin_first_listed_at();

-- ============================================================
-- View
-- ============================================================

create or replace view public.available_products as
select * from public.products
where active = true and quantity > 0;

-- ============================================================
-- Indexes (partial — only on rows actually shown to shoppers)
-- ============================================================

create index products_restocked_idx
  on public.products (last_restocked_at desc)
  where active = true and quantity > 0;

create index products_set_idx
  on public.products (set_id)
  where active = true and quantity > 0;

create index products_pokemon_idx
  on public.products (pokemon_name)
  where active = true and quantity > 0;

create index products_category_idx
  on public.products (category_id)
  where active = true and quantity > 0;

-- ============================================================
-- RLS
-- ============================================================

alter table public.categories enable row level security;
alter table public.sets       enable row level security;
alter table public.products   enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

-- Public read: only active categories
create policy categories_public_read on public.categories
for select to anon, authenticated
using (active = true);

-- Public read: all sets (no `active` column on sets)
create policy sets_public_read on public.sets
for select to anon, authenticated
using (true);

-- Public read: only available products
create policy products_public_read on public.products
for select to anon, authenticated
using (active = true and quantity > 0);

-- Admin: full access on all three tables
create policy categories_admin_all on public.categories
for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy sets_admin_all on public.sets
for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy products_admin_all on public.products
for all to authenticated
using (public.is_admin()) with check (public.is_admin());
