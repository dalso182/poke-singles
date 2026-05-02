# Supabase migrations

Migrations land in this directory as `<UTC>_<tag>.sql` (Supabase CLI convention).
Apply with `npm run db:push:dev` from the repo root, then regenerate TypeScript
types with `npm run db:types` so `src/app/core/supabase/database.types.ts` stays
in sync.

## Migration log

### `20260501205916_initial_catalog_schema.sql`

Initial catalog: `categories`, `sets`, `products`, the `available_products` view,
partial indexes, and RLS. Below is what each non-obvious bit is doing.

#### Tables

- **`categories`** — top-level taxonomy (`singles`, `sealed`, `accessories`).
  `active` flag for soft-disable; `sort_order` for nav ordering.
- **`sets`** — TCG expansions (joinable to TCGdex by `code`). Populated lazily
  by the new-product flow when an admin picks a card via the typeahead;
  manual entries are also possible via the admin panel.
- **`products`** — storefront SKUs. `category_id` is `on delete restrict` so a
  category can't be deleted while products reference it. `set_id` is
  `on delete set null` (accessories already have null) so losing a set strips
  the linkage instead of cascading to inventory loss.

#### Triggers

Four trigger functions on `products`. The non-obvious one is the restock
tracker — read carefully.

1. **`products_set_updated_at`** — bumps `updated_at = now()` on any update.
   Standard.
2. **`products_track_restock`** — fires `BEFORE INSERT OR UPDATE OF quantity`.
   Sets `last_restocked_at = now()` only when stock crosses *zero → positive*:
   - On INSERT with `quantity > 0`: sets the timestamp.
   - On UPDATE: only when `old.quantity = 0 AND new.quantity > 0`.

   Editing a product that already has stock to a higher quantity does **not**
   update the timestamp — that's an existing-stock adjustment, not a restock.
   This is the metric the storefront uses to surface "recently restocked"
   inventory.
3. **`products_normalize_pokemon_name`** — fires `BEFORE INSERT OR UPDATE OF
   pokemon_name`. Lowercases and trims so search is case- and whitespace-
   insensitive without callers having to remember.
4. **`products_pin_first_listed_at`** — fires `BEFORE UPDATE`. Forces
   `new.first_listed_at = old.first_listed_at` on every update so the column
   is effectively write-once. Beyond the original spec but added because the
   column is documented as immutable and a `default now()` alone doesn't
   prevent later overrides.

#### View

`available_products` is a plain view (not materialized) of products where
`active = true AND quantity > 0`. PostgREST exposes it directly. Writes are
infrequent enough that real-time correctness beats matview staleness.

#### Indexes

All four product indexes are **partial**, gated on `active = true AND quantity
> 0`. The vast majority of queries are storefront reads against available
inventory; partial indexes keep them small and fast. The unique constraint on
`products.slug` already creates a btree, so no separate slug index.

#### RLS

Enabled on `categories`, `sets`, `products`. Two layers:

- **Public read (anon + authenticated):** SELECT only, scoped to "what a
  shopper would see" — active categories, all sets, available products.
- **Admin full access (authenticated only):** gated by `public.is_admin()`,
  which returns true when `auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'`.

The bare `auth.jwt() ->> 'role'` claim contains the Postgres role (always
`authenticated` for logged-in users), which is why we read from
`app_metadata.role` instead. To make a user admin:

```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb
where email = '<admin email>';
```

The user must sign out and back in for the new claim to land in the JWT.
There's no Supabase dashboard UI for this — it's a one-off SQL bootstrap or
an admin Edge Function in the future.
