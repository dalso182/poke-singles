# Initial schema: categories, sets, products (+ triggers, view, RLS)

## Context

The Poke-Singles Supabase project (`dhslfridsjdmhwzrgebv`) is linked but has an empty schema — `supabase/migrations/` only contains `.gitkeep`, and `database.types.ts` reflects no tables. This plan lands the foundational catalog: a category taxonomy (singles / sealed / accessories), the Pokémon TCG set dimension, and the product table that powers the storefront. It also encodes two non-trivial behaviors the user wants enforced at the DB level: a **restock timestamp** that only fires when stock returns from zero, and **public-vs-admin RLS** that exposes only available products to anonymous browsers.

User asked for a working migration, regenerated TS types, a README explaining the trigger logic, and a walkthrough flagging anything ambiguous.

## Approach

**One migration file**, not split. The objects are tightly interconnected (FKs, the view depends on the table, RLS depends on the columns it references) and there's no existing schema to coexist with — splitting into multiple files buys nothing here and complicates the README. Use Supabase's CLI naming (`YYYYMMDDHHMMSS_<tag>.sql`) so `db:push:dev` picks it up cleanly. Generate types via the existing `db:types` script (the `--linked` variant) after the push succeeds.

For admin RLS, use `auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'` rather than the bare `auth.jwt() ->> 'role'` form. **Flag for the user:** the bare form reads the Postgres role (always `authenticated` for logged-in users), which is not what we want. The `app_metadata.role` form reads a custom claim that Supabase auto-includes in the JWT once you set it on the user via the service-role admin API. No Auth Hook required.

## Steps

### 1. Create the migration file

Run from the repo root to scaffold with the right timestamp:

```bash
npx supabase migration new initial_catalog_schema
```

This creates `supabase/migrations/<UTC>_initial_catalog_schema.sql`. Open it and write the SQL described in steps 2–7.

### 2. Tables

```sql
-- categories: 'singles', 'sealed', 'accessories'
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- sets: TCG expansions (joinable to TCGdex by code)
create table public.sets (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  name              text not null,
  series            text,
  release_date      date,
  symbol_image_url  text,
  created_at        timestamptz not null default now()
);

-- products: the storefront SKUs
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
```

FK choices:
- `category_id` is `on delete restrict` — you don't accidentally orphan products by deleting a category.
- `set_id` is `on delete set null` — accessories are already null, and if a set ever needs to disappear we'd rather keep the product row than cascade-delete inventory.

### 3. Triggers

Three trigger functions, then bind them.

```sql
-- (a) updated_at: bump on any row change
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger products_set_updated_at
before update on public.products
for each row execute function public.tg_set_updated_at();

-- (b) restock timestamp: only fires when stock crosses 0 → positive
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

create trigger products_track_restock
before insert or update of quantity on public.products
for each row execute function public.tg_products_track_restock();

-- (c) pokemon_name normalization: lowercase + trim for consistent search
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

create trigger products_normalize_pokemon_name
before insert or update of pokemon_name on public.products
for each row execute function public.tg_products_normalize_pokemon_name();
```

**Optional but recommended:** also pin `first_listed_at` against accidental updates. The user said "never changes after insert" — enforce it:

```sql
create or replace function public.tg_products_pin_first_listed_at()
returns trigger language plpgsql as $$
begin
  new.first_listed_at := old.first_listed_at;
  return new;
end;
$$;

create trigger products_pin_first_listed_at
before update on public.products
for each row execute function public.tg_products_pin_first_listed_at();
```

I'll include this in the migration but flag it as the one piece I added beyond the spec.

### 4. View

```sql
create or replace view public.available_products as
select * from public.products
where active = true and quantity > 0;
```

Plain view (not materialized) — Supabase's PostgREST exposes it directly, and product writes are infrequent enough that real-time correctness beats the staleness window of a matview.

### 5. Indexes (partial)

```sql
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
```

`slug` is already a unique btree from the column constraint — skip an explicit index.

### 6. RLS policies

```sql
alter table public.categories enable row level security;
alter table public.sets       enable row level security;
alter table public.products   enable row level security;

-- helper: is the current JWT an admin?
create or replace function public.is_admin()
returns boolean language sql stable as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

-- public read: only active categories
create policy categories_public_read on public.categories
for select to anon, authenticated
using (active = true);

-- public read: all sets (no `active` column on sets)
create policy sets_public_read on public.sets
for select to anon, authenticated
using (true);

-- public read: only available products
create policy products_public_read on public.products
for select to anon, authenticated
using (active = true and quantity > 0);

-- admin: full access on all three tables
create policy categories_admin_all on public.categories
for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy sets_admin_all on public.sets
for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy products_admin_all on public.products
for all to authenticated
using (public.is_admin()) with check (public.is_admin());
```

**Important caveat to flag:** `is_admin()` reads `app_metadata.role`. Supabase's JWT exposes `app_metadata` automatically, but the role only gets there if you set it via the service-role admin API — e.g., `supabase.auth.admin.updateUserById(id, { app_metadata: { role: 'admin' } })`. There's no UI for this in the Supabase dashboard for custom claims; an admin bootstrap script or one-off SQL on `auth.users.raw_app_meta_data` is the practical path. We're not building auth in this plan — just leaving the door open.

### 7. Push and regenerate types

```bash
npm run db:push:dev   # applies the migration to dhslfridsjdmhwzrgebv
npm run db:types      # regenerates database.types.ts from the linked project
```

Then commit both the migration file and the regenerated types together.

### 8. Migration README

Create `supabase/migrations/README.md` with:

- One paragraph per table (purpose, key columns)
- A **Triggers** section explaining especially the restock logic: *"`last_restocked_at` only fires when stock crosses 0 → positive. Editing a product that already has quantity > 0 to a higher quantity does NOT update the timestamp — that's an existing-stock adjustment, not a restock."*
- A **RLS** section documenting the `is_admin()` helper and the `app_metadata.role = 'admin'` requirement
- A note that `first_listed_at` is pinned by a trigger and cannot be modified after insert

## Files to create

- `supabase/migrations/<UTC>_initial_catalog_schema.sql` — the migration above
- `supabase/migrations/README.md` — explains the schema + non-obvious triggers
- `src/app/core/supabase/database.types.ts` — regenerated by `npm run db:types`, not hand-edited

## Reused utilities

Nothing reusable in the codebase yet — schema is empty. The migration introduces project-wide primitives (`is_admin()`, `tg_set_updated_at()`) that future migrations should reuse instead of redefining.

## Verification

1. **Migration applies cleanly:**
   ```bash
   npm run db:push:dev
   ```
   Should report the new migration applied. If it fails, fix the SQL — don't `--no-verify` past it.

2. **Types regenerate:**
   ```bash
   npm run db:types
   ```
   `database.types.ts` should now contain `categories`, `sets`, `products`, and the `available_products` view, replacing the empty `[_ in never]: never` stubs.

3. **Restock trigger sanity check** (run in Supabase SQL editor):
   ```sql
   insert into categories (slug, name) values ('singles', 'Singles');
   insert into products (category_id, name, slug, price, quantity)
     select id, 'Test Card', 'test-card', 5.00, 0 from categories where slug = 'singles';
   -- last_restocked_at should be NULL (inserted with quantity 0)
   update products set quantity = 3 where slug = 'test-card';
   -- last_restocked_at should now be set (0 → positive)
   update products set quantity = 5 where slug = 'test-card';
   -- last_restocked_at should be UNCHANGED (positive → positive)
   update products set quantity = 0 where slug = 'test-card';
   update products set quantity = 2 where slug = 'test-card';
   -- last_restocked_at should be a NEW timestamp (back to the 0 → positive case)
   ```

4. **RLS sanity check:**
   - With anon key from the Supabase JS client: `select` on `products` returns only rows where `active = true and quantity > 0`.
   - With anon key: `insert/update/delete` on any of the three tables fails with RLS violation.
   - Bootstrap an admin user via SQL (`update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb where id = '<uuid>'`), sign in as them, confirm full CRUD.

5. **Pokemon name normalization:**
   ```sql
   insert into products (..., pokemon_name) values (..., '  Charizard  ');
   select pokemon_name from products where slug = '...';
   -- should return 'charizard' (trimmed and lowercased)
   ```

6. **first_listed_at pinning:**
   ```sql
   update products set first_listed_at = '2020-01-01' where slug = 'test-card';
   select first_listed_at from products where slug = 'test-card';
   -- should be unchanged
   ```

## Out of scope

- **Seeding** — user said they'll handle data load separately.
- **Auth flow / admin bootstrap UX** — RLS is wired but the path to "make a user an admin" is left as a manual SQL step or future Edge Function. Not blocking the schema.
- **OpenCart import / slug-preservation map** — separate work. The `slug` column is unique-text and ready to receive the existing OpenCart aliases when that import lands.
- **Prod migration** — `db:push:prod` still has `<prod-ref>` placeholder. This plan only covers the dev project (`dhslfridsjdmhwzrgebv`). Prod gets the same migration once that project exists.
- **Edge functions, realtime, storage buckets for product images** — image hosting / upload pipeline is its own decision (Supabase Storage vs SiteGround static folder).

## Things I'd flag for the user

1. **`auth.jwt() ->> 'role'` vs `app_metadata ->> 'role'`** — I deviated from the user's literal suggestion because the bare form reads the Postgres role, not a custom user role. The plan uses `app_metadata.role` which is the working pattern. If the user wants a different mechanism (e.g., a separate `admins` table keyed on `auth.uid()`), say the word and I'll swap.
2. **`first_listed_at` pin trigger** — added beyond the spec because the user said "never changes after insert" and a comment-only constraint won't enforce it. Easy to drop if the user prefers application-level discipline.
3. **`set_id on delete set null`** — judgment call. Could be `restrict` instead if losing a set should never silently strip the linkage. Defaulting to `set null` to favor data preservation.
4. **No `currency` column on `products`** — the spec didn't mention it. Costa Rica store, presumably CRC; flag if multi-currency is ever needed.
5. **No `tcgdex_card_id` column** — the project has TCGdex SDK wired but the spec doesn't ask for the join key. If you want metadata hydration via `client.fetch('cards', id)`, you'll need this column eventually.
