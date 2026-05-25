---
name: database
description: >-
  The Supabase / Postgres data layer for Poke-Singles. Use this whenever you touch
  anything below the UI: writing or running migrations, RLS policies, the `is_admin()`
  pattern, RPCs (search_products, validate_coupon, calculate_coupon_discount,
  get_my_applied_coupon, place_order, cancel_order, draw_raffle, admin_dashboard_stats,
  admin_customers), edge functions, the
  schema (products, categories, sets, card_types, profiles, cart_items, carts, coupons,
  coupon_redemptions, raffles, tcgdex_cards, app_settings), regenerating database.types.ts,
  the SupabaseService client, the TCGdex SDK wrapper, or the coupon/raffle business logic.
  Trigger this even when the request sounds UI-shaped ("why does the coupon drop?", "add a
  filter to search") if the answer lives in a view, RPC, or policy. When in doubt about how
  data is stored, queried, or secured, read this first.
---

# Database & data layer (Supabase / Postgres)

The data layer is **Supabase** (Postgres 17). Business logic that must be atomic or
secured lives in Postgres RPCs (`security definer`, `search_path = public, pg_temp`),
not in the Angular client. The client reads through views and calls RPCs.

## Client wiring

- `src/app/core/supabase/supabase.service.ts` exposes a typed `SupabaseClient<Database>`
  singleton (`providedIn: 'root'`). Inject it and use `client.from('<table>')` /
  `client.rpc('<fn>', {...})`.
- `src/app/core/supabase/database.types.ts` is generated. **Re-run `npm run db:types:dev`
  after every migration** — idempotent, ~1s, keeps TS in sync.
- `supabase/config.toml` pinned to `major_version = 17` (matches the hosted project).
- Dev project `dhslfridsjdmhwzrgebv` is linked via `npx supabase link`.

## DB commands

```bash
npm run db:types:dev   # regenerate database.types.ts
npm run db:push:dev    # apply migrations from supabase/migrations/
npm run functions:dev  # deploy edge functions from supabase/functions/
```

`<prod-ref>` placeholders remain in the `:prod` variants until the prod project exists.

## RLS pattern

Mutations are admin-gated by `is_admin()` (reads `auth.jwt → app_metadata.role === 'admin'`).
Customer-self policies cover `profiles`, `cart_items`, `carts`. Public-read predicates on
`products` require `active = true AND quantity > 0 AND price > 0` (so $0 / inactive / out-of-
stock listings are never visible to anon clients on any query path).

## Schema overview

- **Catalog:** `categories`, `sets`, `products`, `card_types` + `product_card_types`
  junction (many-to-many), `tcgdex_cards` (JSONB cache of the TCGdex Card payload),
  `app_settings`.
- **Customer:** `profiles` (1:1 with `auth.users`), `cart_items` (PK `(user_id, product_id)`),
  `carts` (1 row/user; holds `coupon_id`).
- **Coupons:** `coupons` (soft-delete via `deleted_at`), `coupon_redemptions`.
- **Raffles:** `raffles` (1:1 with a Rifas-category product).
- Triggers: `updated_at`, `first_listed_at`, restock tracking, `pokemon_name` normalization.

## Customer auth (DB side)

`profiles(id PK FK auth.users, full_name, phone, default_shipping_address jsonb, created_at,
updated_at)`. The `handle_new_user()` trigger fires on every `auth.users` insert and creates
the profile from `raw_user_meta_data` (`full_name` for password/magic-link, `name` from
Google). RLS self-only; admins read all. Admins are set manually via SQL
(`app_metadata.role = 'admin'`); the `is_admin()` helper reads that.

The trigger also fires a best-effort `pg_net.http_post` to the `send-signup-email` edge
function (admins get a "nuevo cliente" email). Recipients come from
`app_settings.order_notification_recipients`. Function URL + anon key live in Supabase Vault
(`signup_email_url`, `supabase_anon_key`). Missing secret → notification silently skipped,
signup still completes. (Auth UI / sign-in methods → `storefront` skill.)

## Search

`products_search` view joins products + sets + aggregated card types into a `search_text`
column (**`description` is omitted** to avoid flavor-text false positives). Queried via
`search_products(q, sort, limit_n, offset_n, set_ids, card_type_ids)`:

- Sort: `relevance` (name-prefix > pokemon-prefix > name-substring > rest, then recent),
  `price-asc`, `price-desc`, `recent` (default browse).
- `set_ids uuid[]` narrows by set; `card_type_ids uuid[]` filters via array overlap (`&&`).
  Both passed `null` when inactive.
- `/products` routes the same RPC with `q=''`, `sort='recent'` so listings and `/buscar`
  share one data path and row shape (`ProductSearchRow`).

## Coupons (business logic)

Two types: `PERCENTAGE` (capped 100%) and `FIXED_ON_THRESHOLD` (needs `min_purchase_amount`).
Amounts are `numeric(12,2)`. Customers **never read `coupons` directly** (no public-read
policy) — they go through three RPCs:

- `validate_coupon(p_code, p_subtotal)` → `{ ok, ... }` or `{ ok:false, error:<CODE>[, gap] }`.
  Codes: `AUTH_REQUIRED`, `NOT_FOUND`, `INACTIVE`, `EXPIRED`, `LIMIT_REACHED`, `BELOW_MINIMUM`.
  UI maps to Spanish via `src/app/core/catalog/coupon-errors.ts`. `validate_coupon` (currently
  `_v2`) enforces `max_uses_per_user` by counting prior redemptions for the auth `user_id`.
- `calculate_coupon_discount(p_coupon_id, p_subtotal)` → `numeric` capped at subtotal. A TS
  mirror in `cart.service.ts` avoids an RPC round-trip on every cart change.
- `get_my_applied_coupon()` → the cart's attached coupon (silently drops expired/inactive/
  deleted refs).

The chosen coupon id rides on `carts.coupon_id`; the cart re-validates after every mutation.
**Redemption is wired:** `place_order` (currently `place_order_v7` — sale-price + category-
scoped coupons + ascending-`product_id` lock order to avoid concurrent-checkout deadlocks)
atomically inserts a `coupon_redemptions` row after creating the order and decrementing stock;
it also matches `guest_email` so the per-user cap applies to guests. `cancel_order` deletes
the matching redemption inside the same atomic txn that restores stock — the order keeps
`coupon_id` / `coupon_code` / `discount_amount` for audit, but the per-user counter drops so
the coupon can be reused.

## Raffles (data side)

A raffle is a **product in the "Rifas" category** (`categories.slug = 'rifas'`, via the
`raffle_category_id()` stable helper) sold as entries: `quantity` = entries remaining,
`price` = per-entry price. Entries flow through the normal cart → `order_items` → `place_order`
pipeline unchanged. Lifecycle lives in the 1:1 `raffles` table (PK `product_id`): `draw_at`,
`status` (`scheduled`/`drawn`/`void`), winner snapshot (`winner_order_id`/`winner_name`/
`winner_email`/`winning_entry`/`total_entries`), `drawn_by`/`drawn_at`/`notified_at`.
Admin-only RLS.

**Excluded from the normal catalog:** `products_search` filters `category_id <> raffle_category_id()`
(covers `/products`, `/buscar`, facet counts); `set_product_counts`, `card_type_product_counts`,
and `ProductsService.list({ excludeRaffles })` apply the same exclusion. Public-read RLS keeps
raffles visible while `active` (no quantity/date gate) so they stay listed through the draw.

`draw_raffle(product_id)` (security definer, `is_admin`, idempotent) raises `UNPAID_ENTRIES`
if any entry is unpaid, then picks a weighted winner and writes the snapshot. Customer `/rifas`
reads the definer view `rifas_listing` (products ⨝ raffles ⨝ sets, safe columns only — no
`winner_email`; exposes `entries_sold`, `card_number`, `set_printed_total`, `market_price`).
(Admin draw UI + customer view → `admin` / `storefront` skills.)

## Admin dashboard & customers (data side)

Three admin RPCs (all `security definer` + `is_admin()` guard, granted to `authenticated`)
back the back-office reporting screens. The customer ones read **`auth.users`** for email —
which isn't exposed over PostgREST — so they must be RPCs, not view/REST reads.

- `admin_dashboard_stats()` → `jsonb`: `total_orders`, `total_sales`, `total_customers`,
  `pending_orders`, and a gap-filled 30-day `series` of `{d, orders, sales}`. "Sales" =
  realized revenue (paid/shipped/completed); counts exclude cancelled. Day buckets use the
  `America/Costa_Rica` calendar so they line up with the store's local "today".
- `admin_customers(p_search, p_limit, p_offset)` → table of registered accounts (`profiles` ⨝
  `auth.users`) with `order_count` (non-cancelled), `total_spent` (realized), `last_order_at`,
  plus `count(*) over()` as `total_count` for client-side pagination. A customer's orders
  attach by `user_id` OR case-insensitive `customer_email` (so guest checkouts still count).
- `admin_customer(p_id)` → `jsonb`: one customer's profile + email + `default_shipping_address`
  + the same stats + their 100 most recent orders. Null when no profile matches.

Migrations: `20260525002200_admin_dashboard_stats.sql`, `20260525002300_admin_customers.sql`.
These return `jsonb`/`table`, so the Angular side hand-types the shapes in `catalog.types.ts`
(`DashboardStats`, `CustomerRow`/`CustomerDetail`) and calls them via `(client as any).rpc(...)`
— a `db:types:dev` regen isn't required for them. UI homes → `admin` skill.

## Realtime presence ("people online")

The admin dashboard's live visitor count uses **Supabase Realtime presence** — no table, anon
key, nothing in `migrations/`. `PresenceService` (`src/app/core/presence/`) joins one shared
channel (`online`): the storefront `UserShell` calls `joinAsVisitor()` →
`track({ role: 'visitor' })`; the dashboard calls `watchOnlineCount()`, which subscribes
**without** tracking (so the admin isn't counted) and tears the channel down on destroy.
Browser-guarded via `isPlatformBrowser`. UI homes → `admin` / `storefront` skills.

## TCGdex wiring

`TcgdexService` at `src/app/core/tcgdex/tcgdex.service.ts` exposes a `TCGdex` client
(`new TCGdex('en')`, `providedIn: 'root'`). Use `client.fetch('cards', id)`, `client.set.list()`,
`client.random.card()`. Types: `import type { Card, Set } from '@tcgdex/sdk'`. The SDK uses
global `fetch`, caches in localStorage. **Endpoint is per-environment** via
`environment.tcgdex.endpoint`: empty = SDK default (`api.tcgdex.net`); a URL points at a custom
proxy (useful on localhost). Smoke test: `node scripts/tcgdex-smoke.mjs`.

## Edge functions

`send-order-email`, `send-signup-email`, `send-raffle-result` are live. DB triggers invoke them
via `net.http_post` — **pg_net lives in the `net` schema on this project, NOT `extensions`** —
plus Vault secrets for the function URL + `supabase_anon_key`. The folder grows as new flows
need server-side hooks.
