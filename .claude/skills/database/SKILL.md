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
- **Coupons:** `coupons` (soft-delete via `deleted_at`, optional `name` label), `coupon_redemptions`.
- **Raffles:** `raffles` (1:1 with a Rifas-category product).
- **Reporting/analytics:** `customer_activity` (login / order_created / registered events with
  IP), `search_log` (storefront searches: keyword + match count + IP). Both **RLS-enabled with
  no policies** — written only by security-definer fns, read only by admin report RPCs.
- **Price review:** `price_reviews` (one row per flagged product, snapshot of store + market
  + suggested + `tcgplayer_product_id` + signed `diff_pct` + `condition_multiplier` reserved,
  per-row `ignored_at`), `price_check_runs` (small audit log: trigger / counts / error).
  Both admin-only RLS. `products.price_checked_at` is the cursor for oldest-first sweeps.
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

**Active/in-stock filtering is RLS-only.** Neither the view nor `search_products` (which is
`security invoker`) has a WHERE on `active`/`quantity` — they lean entirely on the
`products_public_read` policy (`active AND price>0 AND quantity>0`, raffle exception). For
that to apply through the view, `products_search` **must** be `WITH (security_invoker = on)`;
a plain view runs as its owner (`postgres`) and bypasses RLS, leaking inactive / sold-out
cards into search (fixed in `20260525002400`). Any new customer-facing view needs the same
option, or Supabase's `security_definer_view` advisor will flag it.

**Search logging.** Committed searches from the header box feed the admin Búsquedas report.
`count_search_products(q, p_category_slug)` (`security invoker` — counts visible matches in the
*caller's* RLS context, so the number matches what the shopper sees) gives the match count, then
`log_search(p_term, p_found)` (`security definer`) writes a `search_log` row with `client_ip()`.
Hook: `header.onSearch` → `SearchLogService`; both granted to `anon` + `authenticated` (guests
search too). → Reports section below.

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
The `coupons` table also has an optional `name` label (set on the admin form; shown in the
coupons list + the Cupones report). **Redemption is wired:** `place_order` (currently
`place_order_v8` — sale-price + category-scoped coupons + ascending-`product_id` lock order to
avoid concurrent-checkout deadlocks, **+ logs an `order_created` row to `customer_activity`**)
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
  `pending_orders`, `inventory_value`, and a gap-filled 30-day `series` of `{d, orders, sales}`.
  "Sales" = realized revenue (paid/shipped/completed); counts exclude cancelled.
  `inventory_value` = `sum(price * quantity)` over products where `active = true AND quantity > 0`
  (hidden + out-of-stock SKUs aren't realizable inventory). Day buckets use the
  `America/Costa_Rica` calendar so they line up with the store's local "today".
- `admin_customers(p_search, p_limit, p_offset, p_sort)` → table of registered accounts
  (`profiles` ⨝ `auth.users`) with `last_sign_in_at` (Auth's last-login), `order_count`
  (non-cancelled), `total_spent` (realized), `last_order_at`, plus `count(*) over()` as
  `total_count` for client-side pagination. `p_sort` is `'created'` (default, newest sign-ups)
  or `'active'` (newest `last_sign_in_at`, nulls last). A customer's orders attach by `user_id`
  OR case-insensitive `customer_email` (so guest checkouts still count).
- `admin_customer(p_id)` → `jsonb`: one customer's profile + email + `last_sign_in_at`
  + `default_shipping_address` + the same stats + their 100 most recent orders. Null when no
  profile matches.

Migrations: `20260525002200_admin_dashboard_stats.sql`, `20260525002300_admin_customers.sql`,
`20260525002500_admin_customers_last_sign_in.sql` (adds `last_sign_in_at` + `p_sort`; adding a
`RETURNS TABLE` column forced a drop+recreate of `admin_customers`, recreated 4-arg-with-default
so the existing 3-named-arg call still resolves),
`20260525003400_admin_dashboard_stats_inventory.sql` (adds `inventory_value` — single round trip
preserved by extending the same RPC's payload).
These return `jsonb`/`table`, so the Angular side hand-types the shapes in `catalog.types.ts`
(`DashboardStats`, `CustomerRow`/`CustomerDetail`) and calls them via `(client as any).rpc(...)`
— a `db:types:dev` regen isn't required for them. UI homes → `admin` skill.

## Reports (data side)

The admin **Reportes** hub (`/admin/reports`, 4 tabs) is backed by four `security definer` +
`is_admin()` RPCs (granted to `authenticated`), each returning a `table` with `count(*) over()`
as `total_count` and optional `America/Costa_Rica`-day date filters, hand-typed in
`catalog.types.ts` and called via `(client as any).rpc(...)`:

- `admin_customer_orders_report(p_search, p_date_start, p_date_end, p_limit, p_offset, p_sort)`
  — per-customer order totals (orders ⨝ order_items): `order_count`, `no_products`,
  `total_spent`. Same customer-match (`user_id` OR email) + realized-revenue semantics as
  `admin_customers`; only customers with orders in range, sort `total`/`orders`/`created`.
- `admin_customer_activity(p_search, p_date_start, p_date_end, p_ip, p_limit, p_offset)` — reads
  `customer_activity`; `p_ip` is a prefix match via `host(ip)`.
- `admin_customer_searches(p_search, p_keyword, p_date_start, p_date_end, p_ip, p_customer_type,
  p_limit, p_offset)` — reads `search_log`; `p_customer_type` = `all`/`guest`/`registered`.
- `admin_coupons_report(p_search, p_date_start, p_date_end, p_limit, p_offset, p_sort)` —
  per-coupon usage over **non-cancelled** orders (`coupons` ⨝ `orders` on `coupon_id`):
  `order_count`, `total_discount` (discount given), `total_revenue` (orders' total) — all over
  the same set so the row reconciles; only coupons used in range.

**Data collection + server-side IP.** `client_ip()` reads the client IP from PostgREST's
forwarded `request.headers` (`x-forwarded-for`, first hop), null-safe — only meaningful through
PostgREST, not a direct DB connection. `customer_activity` is written by
`log_activity(p_event_type)` (`login`/`registered`; login deduped within 10 min; fired
fire-and-forget from `AuthService` on `SIGNED_IN` and after `signUp`) and by `place_order`
(`order_created`). `search_log` is written by `log_search` (see Search). Both event tables have
RLS **enabled with no policies** (definer writers + admin readers only). Migrations
`20260525002600`–`20260525003300`. UI homes → `admin` skill.

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

## Price review (data side)

Backs the admin `/admin/price-review` screen + the weekly cron. Compares each active NM single's
store price (CRC) against the TCGplayer market price (USD × `app_settings.exchange_rate_usd_crc`)
and flags rows whose absolute `diff_pct` ≥ the configured threshold. Scope is intentional and
enforced both client- and server-side: `active = true AND card_ref IS NOT NULL AND
category_id = (categories.slug='singles') AND condition = 'NM' AND price >= floor`.
TCGplayer's `marketPrice` is broadly NM by convention; LP/MP/HP/DMG cards are silently skipped
rather than approximated. UI homes → `admin` skill.

**Tables.**
- `price_reviews` (PK `product_id`, FK products `on delete cascade`): snapshots of
  `store_price`, `market_usd`, `exchange_rate`, `market_crc`, `suggested_price` (rounded up to
  nearest ₡100), signed `diff_pct`, `tcgplayer_product_id`, `market_updated_at`, `checked_at`,
  `ignored_at`. Admin-only RLS.
- `price_check_runs` (audit log): `started_at`, `finished_at`, `trigger` (`'manual'`/`'cron'`),
  scanned/priced/flagged counters, optional `error`. Admin-only RLS.
- `products.price_checked_at` (added): cursor for oldest-first sweeps, partial index on
  `(active AND card_ref IS NOT NULL)`.
- `app_settings` gained `price_review_enabled`, `price_review_threshold_pct (default 10)`,
  `price_review_floor_crc (default 5000)`.

**RPCs** (all `security definer` + `is_admin()` guard, granted to `authenticated`).
- `admin_record_price_check(p_product_id, p_store_price, p_market_usd, p_exchange_rate,
  p_threshold_pct, p_market_updated_at, p_tcgplayer_product_id default null) returns boolean`
  — computes `market_crc` / `suggested_price` / `diff_pct`, upserts or deletes the
  `price_reviews` row, and bumps `products.price_checked_at`. Used by **both** the browser
  runner and the edge function so they produce identical rows.
- `admin_price_review_start(p_trigger) returns uuid` — inserts a fresh `price_check_runs`
  row, then **wipes** `price_reviews` and any prior runs (`where true` to satisfy pg-safeupdate
  — see below). The clean-snapshot rule: each new run is the only data that exists.
- `admin_price_review_finish(p_run_id, p_scanned, p_priced, p_flagged, p_error)` — finalizes
  the current run row.
- `admin_price_review_summary()` — pending count + total flagged + latest run row, joined into
  one row via a `right join (select 1)` so it always returns something even pre-first-run.
- `admin_price_review_next()` — highest-`|diff_pct|`, oldest-checked, non-ignored row joined
  with the product/set columns the card UI needs.
- `admin_price_review_ignore(p_product_id)` — sets `ignored_at = now()`; the row reappears on
  the next run because that run wipes the table.
- `admin_price_review_accept(p_product_id, p_new_price)` — atomically updates `products.price`
  and deletes the queue row.

**Edge function** `supabase/functions/price-check/` (Deno). Modeled on `send-raffle-result`:
service-role client, the same `firstTcgplayerVariant` extraction logic mirrored in Deno-TS,
fetches TCGdex REST directly (`https://api.tcgdex.net/v2/en/cards/<card_ref>`), batches of 200,
**self-chains via `fetch(req.url, …)` when a full batch comes back** so one logical cron run
sweeps the whole catalog even if a single invocation hits the wall-clock limit. `verify_jwt =
false` in `config.toml` (cron has no session). Scope filters mirror the browser runner exactly.

**pg_cron schedule.** `cron.schedule('price-check-weekly', '0 10 * * 1', …)` — Mondays 10:00 UTC
(= 04:00 Costa Rica). Body honors `app_settings.price_review_enabled` and reads the function URL
from Vault (`price_check_url` + existing `supabase_anon_key`); failure is swallowed so a missing
secret never breaks the schedule. Migration `20260525003600_price_review_cron.sql`. The Vault
secret is set manually in the dashboard at first deploy — point to
`https://<project-ref>.supabase.co/functions/v1/price-check`.

**Migration trail** (all `20260525*`):
- `003500_price_review` — tables, RPCs, settings columns, cursor on products.
- `003600_price_review_cron` — `create extension if not exists pg_cron` + the weekly schedule.
- `003700_price_review_clear_on_start` — clean-snapshot semantic in `admin_price_review_start`.
- `003800_price_review_tcgplayer_product_id` — snapshot column + plumb productId end-to-end
  (extracted from `pricing.tcgplayer.<variant>.productId` on the same TCGdex payload that
  yields `marketPrice`). Direct deep links to TCGplayer where TCGdex provides the id; the
  client falls back to a search URL composed of name + card_number + set_name when it doesn't.
- `003900_price_review_start_safedelete` — see pg-safeupdate note below.

**pg-safeupdate.** Supabase enables the **pg-safeupdate** extension by default on hosted
projects. It rejects bare `delete from t;` / `update t set …;` at runtime with `"DELETE
requires a WHERE clause"`. This applies inside `security definer` RPCs too (RLS bypass doesn't
help — it's a different hook). For an intentional wipe use `delete from t where true;` —
keeps the intent explicit at the call site, preferred over disabling the extension or reaching
for `truncate` (which has different transactional / trigger semantics).

## Edge functions

`send-order-email`, `send-signup-email`, `send-raffle-result`, and **`price-check`** are live.
DB triggers / cron jobs invoke them via `net.http_post` — **pg_net lives in the `net` schema on
this project, NOT `extensions`** — plus Vault secrets for the function URL +
`supabase_anon_key`. The folder grows as new flows need server-side hooks.
