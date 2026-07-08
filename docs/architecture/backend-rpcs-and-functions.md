# Backend RPCs, edge functions & PHP endpoints

> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose

Catalogue every callable backend surface at its FINAL version: all Postgres RPCs (signature, security mode, who calls it from the Angular app, exact behavior), the four Supabase edge functions and how each is invoked (client call, pg_net trigger, pg_cron), and the three PHP image-picker endpoints on SiteGround with their auth gate. RPC bodies were read from the last migration that defines each function and cross-checked against the live dev DB's `pg_proc` (they match; identity signatures below are verbatim from the DB).

## Scope

- All `public.*` functions except pure trigger functions already covered in [data-model.md](./data-model.md) (`tg_*`, `handle_new_user`, `award_or_reverse_loyalty_points`, `notify_raffle_result` — trigger wiring lives there; invocation side-effects are cross-referenced here).
- `supabase/functions/*` (Deno) + `supabase/config.toml` function settings.
- `server/*.php` image endpoints.
- NOT covered: the schema/RLS itself → [data-model.md](./data-model.md); screen-level UX → screen docs.

## Key files

| File | Role |
|---|---|
| `supabase/migrations/*.sql` | RPC truth. Final versions: `place_order` → `20260704100200` (v10); `cancel_order` → `20260523000100`; `validate_coupon`/`calculate_coupon_discount`/`get_my_applied_coupon` → `20260524000300`; `search_products` → `20260525002000`; `draw_raffle` → `20260525000600`; `admin_customer` → `20260704120000`; `admin_price_review_start` → `20260525003900`; `admin_record_price_check`/`admin_price_review_next` → `20260525003800`. |
| `supabase/functions/{price-check,send-order-email,send-raffle-result,send-signup-email}/index.ts` | Edge functions. |
| `supabase/config.toml` | `verify_jwt = false` for all four functions. |
| `server/{_supabase-auth.php,auth-config.php,list-images.php,upload-image.php,create-folder.php}` | Image-picker endpoints + admin gate. |
| Angular callers | `src/app/core/catalog/products.service.ts`, `sets.service.ts`, `card-types.service.ts`, `categories.service.ts`, `raffles.service.ts`; `core/cart/cart.service.ts`; `core/orders/orders.service.ts`; `core/customers/customers.service.ts`; `core/dashboard/dashboard.service.ts`; `core/reports/reports.service.ts`; `core/loyalty/loyalty.service.ts`; `core/search-log/search-log.service.ts`; `core/auth/auth.service.ts`. |

Conventions shared by nearly every RPC: SECURITY DEFINER + `set search_path = public, pg_temp`; admin RPCs guard with `if not public.is_admin() then raise exception 'NOT_AUTHORIZED'`; customer-flow RPCs return in-band jsonb `{ok: false, error: 'CODE'}` instead of raising; report RPCs return `count(*) over() as total_count` on every row for pagination and filter dates at Costa-Rica-local day boundaries.

## How it works

### Search & catalog counts (storefront)

#### `search_products(q text, sort text = 'relevance', limit_n int = 60, offset_n int = 0, set_ids uuid[] = null, p_card_type_ids uuid[] = null, p_on_sale_only boolean = false, p_category_slug text = null) returns setof products_search`

SECURITY INVOKER (plpgsql). Caller: `ProductsService.searchProducts` (`products.service.ts:253`) — powers `/buscar`, `/products`, `/ofertas`, `/categoria/:slug`. Behavior:

- **Query matching**: trims `q`. If `q` matches `^(\S+)\s*/\s*(\d+)$` (e.g. `15/151`, `TG12/TG30`), it switches to the structural **card-number/printed-total branch**: `regexp_replace(card_number, '^0+(?=\d)', '') = q_num AND set_printed_total = q_total`, where a purely numeric numerator also has its **leading zeros stripped** on both sides (so `015/151` = `15/151`). Otherwise: empty query matches everything; non-empty does `search_text ILIKE '%q%'`.
- **Filters (AND-composed)**: `set_id = any(set_ids)` when non-empty; `card_type_ids && p_card_type_ids` (array overlap) when non-empty; `sale_price is not null` when `p_on_sale_only`; `category_id = category_id_by_slug(p_category_slug)` when a slug is passed (unknown/inactive slug resolves NULL → zero rows).
- **Sorts**: `price-asc` / `price-desc` order by `coalesce(sale_price, price)` (what the customer pays); `recent` orders by `last_restocked_at desc nulls last, created_at desc`; default `relevance` ranks name-prefix (0) > pokemon-name-prefix (1) > name-substring (2) > other match (3), then most recently restocked. The N/M branch and empty queries rank everything 99 (i.e. pure recency).
- **Self-filtering**: since `20260618000000` the underlying `products_search` view already excludes raffles and non-visible products for every role including admins.

Granted to `anon, authenticated`.

#### Facet-count functions (all return `(… , in_stock_count bigint)` rows)

| Function | Security | Caller | Notes |
|---|---|---|---|
| `set_product_counts()` | DEFINER | `SetsService.productCounts` (`sets.service.ts:67`) | Whole-catalog per-set counts for the /products Set filter; excludes raffles; predicate `active AND quantity>0 AND price>0 AND set_id is not null`. |
| `card_type_product_counts()` | DEFINER | `CardTypesService` (`card-types.service.ts:64`) | Whole-catalog per-card-type counts; same predicate via `product_card_types` join. |
| `search_set_counts(q text, p_on_sale_only boolean = false, p_category_slug text = null)` | INVOKER | `SetsService.searchCounts` (`sets.service.ts:86`) | Query-scoped counts over `products_search` for /buscar; counts computed WITHOUT the set filter itself (faceted-search rule). |
| `search_card_type_counts(q, p_on_sale_only, p_category_slug)` | INVOKER | `CardTypesService.searchCounts` (`card-types.service.ts:80`) | Same, unnesting `card_type_ids`. |
| `search_category_counts(q text, p_on_sale_only boolean = false)` | INVOKER | `CategoriesService` (`categories.service.ts:33`) | Per-category counts for the /products "Categoría" facet. **No `p_category_slug` param** (2-arg — verified live). |

#### Helpers

- `category_id_by_slug(p_slug text) returns uuid` — DEFINER, STABLE; resolves active category slug → id (NULL if unknown); granted to anon.
- `raffle_category_id() returns uuid` — DEFINER, STABLE, zero-arg; the `rifas` category id, used in RLS predicates and views.
- `count_search_products(q text, p_category_slug text = null) returns int` — INVOKER; lean count with the same base ILIKE predicate (the N/M branch is intentionally not replicated — analytics-grade). Caller: `SearchLogService` before `log_search`.

### Coupons

#### `validate_coupon(p_code text, p_subtotal numeric) returns jsonb` — v2 category-scoped (`20260524000300`)

DEFINER. Callers: `CartService.applyCoupon` (`cart.service.ts:321`) and the silent revalidation pass (`cart.service.ts:401`). Granted to `authenticated` only. Steps: requires auth (`AUTH_REQUIRED`); uppercases/trims the code; loads the non-deleted coupon (`NOT_FOUND` / `INACTIVE` / `EXPIRED`); counts the caller's `coupon_redemptions` vs `max_uses_per_user` (`LIMIT_REACHED`); computes the **eligible subtotal from the caller's DB cart** (`cart_items ⨝ products`, priced at `coalesce(sale_price, price)`, restricted to `coupons.category_ids` when non-empty — `p_subtotal` is advisory only, kept for signature stability); errors `NO_ELIGIBLE_ITEMS` (targeted coupon, nothing in scope) and `BELOW_MINIMUM` (returns the `gap`). Success payload: `{ok, coupon_id, type, discount_value, min_purchase_amount, category_ids, expires_at}`.

#### `calculate_coupon_discount(p_coupon_id uuid, p_subtotal numeric) returns numeric`

DEFINER, granted to `authenticated`. **No Angular caller today** — the cart mirrors the formula client-side (`computeDiscountClientSide` in `cart.service.ts`, documented as mirroring this RPC) to avoid a round-trip per subtotal change; `place_order` recomputes authoritatively. Logic: eligible subtotal from the caller's cart as above; PERCENTAGE → `round(eligible * discount_value / 100, 2)`; FIXED_ON_THRESHOLD → `discount_value` only when `eligible >= min_purchase_amount`; capped at the eligible amount; 0 for invalid/inactive/deleted coupons.

#### `get_my_applied_coupon() returns jsonb`

DEFINER, `authenticated`. Caller: `CartService` hydration (`cart.service.ts:364`). Reads `carts.coupon_id` for `auth.uid()`, re-verifies the coupon is live (not deleted, active, unexpired) and returns `{coupon_id, code, type, discount_value, min_purchase_amount, category_ids}` or NULL.

### Orders

#### `place_order(p_input jsonb) returns jsonb` — v10 (`20260704100200_place_order_v10_seller_snapshot.sql`)

DEFINER; the ONLY insert path into `orders` (no customer INSERT policy). Caller: `OrdersService.placeOrder` (`orders.service.ts:60`), invoked by the checkout screen (`src/app/user/checkout/checkout.ts`); on success the service fire-and-forgets `functions.invoke('send-order-email', {body: {order_id, email}})`.

Input shape: `{buyer: {email, name, phone, address: {line1, line2?, city, province, notes?}}, items: [{product_id, quantity}], shipping_method_id, payment_method, coupon_code?, customer_notes?}`.

Full transaction walk (each numbered step can end with an in-band error):

1. **Buyer validation** — `EMAIL_REQUIRED`, `BUYER_INFO_REQUIRED`; `EMPTY_CART` if no items; `INVALID_PAYMENT` unless `sinpe_or_transfer` | `payment_link`.
2. **Shipping method** — loads active, non-deleted method `FOR SHARE` (`INVALID_SHIPPING`).
3. **Shipping category allow-list (v9)** — if `allowed_category_ids` is non-empty, every distinct `category_id` in the cart must be contained in it (`v_cart_cats <@ allowed_category_ids`), else `SHIPPING_NOT_ALLOWED_FOR_CART`.
4. **Address** — required fields `line1`/`city`/`province` when `requires_address` (`ADDRESS_REQUIRED`); address **nulled out** when the method doesn't require one.
5. **Coupon preload** — non-empty `coupon_code` loads the live coupon `FOR UPDATE` (serializes redemption counting across concurrent checkouts; `COUPON_INVALID`), and notes whether it's category-targeted.
6. **Order lock + stock check (v7 deadlock fix)** — iterates items **ordered by ascending `product_id`** so concurrent overlapping carts always lock products in the same global order (no lock cycles). Per item: `INVALID_QTY`; `SELECT ... FOR UPDATE` on the product (`PRODUCT_GONE`); `PRODUCT_UNAVAILABLE` if inactive or `price <= 0`; `INSUFFICIENT_STOCK` (returns `available`). Accumulates `v_subtotal` and the coupon-`v_eligible` portion, both at **effective price `coalesce(sale_price, price)` (v5)**.
7. **Coupon enforcement (v6)** — `COUPON_NO_ELIGIBLE` (targeted, zero eligible); `COUPON_BELOW_MINIMUM` against the eligible subtotal; per-user cap checked twice — by `user_id` when signed in AND by `guest_email` match (`COUPON_LIMIT`); discount = percentage of eligible or fixed value, capped at eligible.
8. **Totals + header insert** — `total = subtotal − discount + shipping.price`; inserts `orders` (snapshots shipping name/price, coupon id+code); `order_number` comes from the sequence default.
9. **Line items + stock decrement (v10)** — second pass over items: re-reads the product (still locked), resolves `set_name`, and resolves the **consignment seller snapshot** — when `products.seller_id` is set, copies `sellers.code`/`name` into `order_items.seller_code`/`seller_name` alongside `seller_id`; house items write NULLs. Inserts the `order_items` snapshot row and `UPDATE products SET quantity = quantity - v_qty`.
10. **Coupon redemption** — inserts `coupon_redemptions` (`guest_email` only when anonymous) with `discount_amount_applied`.
11. **Signed-in cleanup** — deletes the user's `cart_items`, clears `carts.coupon_id`, and backfills empty `profiles.full_name`/`phone`/`default_shipping_address` from the buyer form (never overwrites non-empty values).
12. **Activity log (v8)** — inserts `customer_activity (event_type = 'order_created')` with `client_ip()`; same transaction, so a rollback leaves no orphan row.
13. Returns `{ok: true, order_id, total}`.

**Loyalty earn is NOT in `place_order`.** Points are awarded by the `orders_loyalty_points` trigger when an admin later flips the order to `'paid'` (see data-model doc) — placing an order never grants points.

#### `cancel_order(p_order_id uuid, p_notes text = null) returns jsonb` — final `20260523000100`

DEFINER, granted to `authenticated`, but self-guards with `is_admin()` (`NOT_ADMIN`). Caller: `OrdersService.cancelOrder` (`orders.service.ts:330`) from the admin order detail. Locks the order `FOR UPDATE` (`NOT_FOUND`); refuses terminal states (`ALREADY_TERMINAL` for cancelled/completed); **restores stock** for each item whose `product_id` still exists (this UPDATE runs through `tg_products_track_restock`, so a 0→N restock bumps `last_restocked_at` — restock semantics apply to the cancel path too); **deletes the order's `coupon_redemptions`** so the customer's usage cap is released; sets `status = 'cancelled'` and `cancellation_notes` (trimmed, empty→NULL). The status flip fires the loyalty-reversal trigger if the order had been paid. Forward transitions don't use an RPC — admins UPDATE `orders.status` directly under `orders_admin_all` (`OrdersService.updateOrderStatus` explicitly throws if asked to set `cancelled`).

#### Guest lookup & payment proof

- `get_guest_order(p_order_id uuid, p_email text) returns jsonb` — DEFINER, STABLE, granted anon+auth. Returns `{order, items}` only when the id AND a case-insensitive email match (leaked order id alone is useless). Caller: `OrdersService.getGuestOrder` (order-confirmation screen).
- `attach_payment_proof(p_order_id uuid, p_email text, p_file_path text) returns jsonb` — DEFINER, anon+auth. Verifies email match (`NOT_FOUND`), `status = 'pending'` (`NOT_PENDING`), `payment_method = 'sinpe_or_transfer'` (`WRONG_PAYMENT_METHOD`), then writes `payment_proof_url` (a Storage path or the sentinel `'__whatsapp__'`). Caller: `OrdersService.attachPaymentProof` after `uploadPaymentProof` (plain insert to the `payment-proofs` bucket — see data-model Storage section for why not upsert).
- `order_accepts_proof(p_prefix text) returns boolean` — DEFINER helper used *inside the Storage RLS policies*, not called by the app; returns whether the path's first segment is a pending sinpe order.

### Raffles

#### `draw_raffle(p_product_id uuid) returns raffles` — final `20260525000600` (paid gate)

DEFINER; raises `NOT_AUTHORIZED` (non-admin) / `NOT_A_RAFFLE` (product not in rifas category) / `UNPAID_ENTRIES`. Caller: `RafflesService.draw` (`raffles.service.ts:63`) from the admin raffle detail. Ensures a `raffles` row exists, locks it `FOR UPDATE`; **idempotent** — returns the row unchanged unless `status = 'scheduled'`. **Paid gate**: refuses while any non-cancelled entry order is still `'pending'`. Winner selection: expands `order_items × generate_series(1, quantity)` into one row per entry over orders in `('paid','shipped','completed')`, then `ORDER BY random() LIMIT 1` (uniform over entries = weighted by quantity). Writes `status` (`'drawn'`, or `'void'` when zero eligible entries), `winner_order_id/name/email`, `winning_entry`, `total_entries`, `drawn_by = auth.uid()`, `drawn_at`. The status flip fires `raffles_notify_result` → pg_net → `send-raffle-result`.

#### `admin_raffles_summary() returns table(...)`

DEFINER + is_admin guard. Caller: `RafflesService.adminSummary` (`raffles.service.ts:17`) — the admin Activas/Completadas list. One row per rifas-category product (including inactive): product fields + `draw_at`, `status` (coalesced `'scheduled'`), `winner_name`, `drawn_at`, and lateral aggregates `entries_sold` (non-cancelled), `entries_pending` (pending orders), `participants` (distinct lowercased buyer emails, non-cancelled). Ordered: scheduled first, then `draw_at asc nulls last`.

Public raffle listing is NOT an RPC — it's the `rifas_listing` definer view (see data-model). Raffle buyers in admin come from a direct `order_items ⨝ orders` select (`OrdersService.listRaffleBuyers`).

### Admin dashboard & customers

#### `admin_dashboard_stats() returns jsonb` — final `20260525003400` (adds inventory value)

DEFINER + guard. Caller: `DashboardService` (`dashboard.service.ts:22`). Single payload: `total_orders` (non-cancelled), `total_sales` (realized revenue: paid/shipped/completed only), `total_customers` (profiles count), `pending_orders`, **`inventory_value`** = `sum(price * quantity)` over `active = true and quantity > 0` products (note: uses `price`, not `coalesce(sale_price, price)`), and `series` — 30 CR-local days of `{d, orders, sales}` for the sparklines.

#### `admin_customers(p_search text = '', p_limit int = 25, p_offset int = 0, p_sort text = 'created') returns table(...)` — final `20260525002500`

DEFINER + guard (reads `auth.users`, which PostgREST never exposes). Caller: `CustomersService.list` (`customers.service.ts:30`) for `/admin/customers`. Per profile: `full_name, email, phone, created_at`, **`last_sign_in_at`** (Supabase Auth's last login), lateral order aggregate — `order_count` (non-cancelled), `total_spent` (realized), `last_order_at` — matched by `user_id` **OR case-insensitive email** (logged-out checkouts still attach), plus `total_count` window count. `p_sort`: `'created'` (signup desc) | `'active'` (last_sign_in desc nulls last). Search hits name/email/phone.

#### `admin_customer(p_id uuid) returns jsonb` — final `20260704120000`

DEFINER + guard. Caller: `CustomersService.get` (`customers.service.ts:60`) for `/admin/customers/:id`. Note: the migrations named `admin_customer_loyalty` (`20260704110000`) and `admin_customer_pokedex` (`20260704120000`) are **revisions of this one function**, not separate RPCs. Payload: profile + email + `last_sign_in_at` + `default_shipping_address` + the same order aggregates + `orders` (100 most recent, including cancelled) + **`loyalty_balance`** (SUM of the user's ledger — user_id only, no email fallback) + **`loyalty_transactions`** (100 most recent, field-compatible with the storefront's `LoyaltyTransactionRow`) + **`caught_pokemon_numbers`** (the Pokédex array via `to_jsonb`).

#### `admin_pokedex_leaderboard(p_limit int = 10) returns table(id, full_name, email, caught_count)`

DEFINER + guard (`20260704130000`). Caller: `CustomersService.pokedexLeaderboard` (`customers.service.ts:89`) — the dashboard "Top Pokédex" panel. `cardinality(caught_pokemon_numbers)` desc, empty dexes excluded, ties by earliest signup.

### Admin reports (all DEFINER + guard, all return `total_count` window column, CR-day date filters; caller: `ReportsService`, `/admin/reports`)

| RPC | Signature (defaults) | Behavior highlights |
|---|---|---|
| `admin_customer_orders_report` | `(p_search '', p_date_start null, p_date_end null, p_limit 25, p_offset 0, p_sort 'total')` | Per-customer: `order_count` (non-cancelled), `no_products` (sum of item quantities), `total_spent` (realized). Same user-id-OR-email matching as `admin_customers`; only customers with ≥1 order in range; sorts `'total'` \| `'orders'` \| `'created'`. |
| `admin_customer_activity` | `(p_search '', p_date_start, p_date_end, p_ip '', p_limit 50, p_offset 0)` | Feed of `customer_activity`; `ip` returned as `host(ip)` text; `p_ip` is a prefix match (subnet narrowing); search over snapshot name/email. |
| `admin_customer_searches` | `(p_search '', p_keyword '', p_date_start, p_date_end, p_ip '', p_customer_type 'all', p_limit 50, p_offset 0)` | Feed of `search_log` joined to `auth.users` (email) + `categories` (name). `p_customer_type`: `'all' \| 'guest' \| 'registered'`. |
| `admin_coupons_report` | `(p_search '', p_date_start, p_date_end, p_limit 50, p_offset 0, p_sort 'discount')` | Per-coupon usage read from **orders** (not redemptions): `order_count`, `total_discount`, `total_revenue` over the same non-cancelled set; soft-deleted coupons included; only coupons used in range; sorts `'discount' \| 'revenue' \| 'orders'`. |
| `admin_loyalty_transactions_report` | `(p_search '', p_date_start, p_date_end, p_limit 50, p_offset 0, p_sort 'created')` | Ledger feed with customer + `order_number` context; sorts `'created' \| 'amount'`. |

### Activity & search logging (client fire-and-forget)

- `log_activity(p_event_type text) returns void` — DEFINER, `authenticated`. Caller: `AuthService` (`auth.service.ts:130`) on sign-in/registration. Accepts only `'login'`/`'registered'` (`'order_created'` is rejected — logged server-side in `place_order` so clients can't forge purchases). Login events dedupe within a 10-minute window (Supabase fires SIGNED_IN on token refresh/multi-tab). Snapshots name/email; captures `client_ip()`.
- `log_search(p_term text, p_found int = 0, p_category_slug text = null) returns void` — DEFINER, **anon**+auth (guests are logged). Caller: `SearchLogService.logSearch` (`search-log.service.ts:18-19`), which first calls `count_search_products(q)` in the caller's RLS context and passes the count. Blank terms ignored; `p_found` clamped ≥ 0.
- `client_ip() returns inet` — INVOKER helper; parses the first hop of `x-forwarded-for` from PostgREST's `request.headers` GUC; returns NULL on any failure. Only meaningful for browser→PostgREST calls.

### Price review

Two runners converge on the same RPCs so the queue is identical regardless of trigger:
- **Manual**: `ReportsService.runPriceReviewNow` (`reports.service.ts:395`) runs entirely in the browser — counts qualifying products, `admin_price_review_start('manual')`, pages products with `range(0, 49)` repeatedly (each processed row's `price_checked_at` bump sinks it below the NULLS-FIRST cursor), fetches each card via the TCGdex SDK with concurrency 4, calls `admin_record_price_check` per card, then `admin_price_review_finish`. Supports per-run threshold/floor overrides without persisting.
- **Cron**: the `price-check` edge function (below), same RPC sequence with `p_trigger: 'cron'`.

Scope for both: `active = true AND card_ref IS NOT NULL AND condition = 'NM' AND category_id = <singles> AND price >= floor` — **only NM singles are ever reviewed**.

| RPC | Signature | Behavior |
|---|---|---|
| `admin_price_review_start(p_trigger text) returns uuid` | `'manual'\|'cron'` | Inserts a `price_check_runs` row, then **clean-snapshot wipe**: `delete from price_reviews where true;` (the `where true` satisfies pg-safeupdate) and deletes all other run rows. Called once per logical run — edge-function self-chained batches reuse the `run_id` and skip it. |
| `admin_record_price_check(p_product_id uuid, p_store_price numeric, p_market_usd numeric, p_exchange_rate numeric, p_threshold_pct numeric, p_market_updated_at timestamptz, p_tcgplayer_product_id integer = null) returns boolean` | | Computes `market_crc = round(usd × rate, 2)`, `suggested_price = ceil(market_crc/100)*100`, signed `diff_pct`. `market_crc <= 0` = "no signal": clears any review row, bumps the cursor, returns false. Otherwise upserts (flagged, `ignored_at = NULL` — a fresh check un-ignores) or deletes (back in band) the `price_reviews` row; always `update products set price_checked_at = now()`. Returns whether flagged. Raises `PRODUCT_HAS_NO_CARD_REF`. |
| `admin_price_review_finish(p_run_id, p_scanned, p_priced, p_flagged, p_error text = null) returns void` | | Stamps `finished_at` + counters on the run row. |
| `admin_price_review_summary() returns table(...)` | | Header: `pending_count` (not-ignored), `total_flagged`, latest run's id/trigger/timestamps/counters (RIGHT JOIN trick returns one row even with zero runs). Caller: `ReportsService` (`reports.service.ts:274`). |
| `admin_price_review_next() returns table(...)` | | The single next card to triage: highest `abs(diff_pct)`, then oldest `checked_at`; joins product + set display fields and `tcgplayer_product_id`. Caller: `reports.service.ts:297`. |
| `admin_price_review_ignore(p_product_id uuid)` | | Sets `ignored_at = now()` — hidden until the next run re-flags it (`ignored_at < checked_at` resurfaces). |
| `admin_price_review_accept(p_product_id uuid, p_new_price numeric)` | | `INVALID_PRICE` guard; writes `products.price`, deletes the review row. The new price may still be out of band — next weekly check simply re-flags. |

### Loyalty redemption

#### `open_pokeball(p_tier text) returns jsonb` (`20260704000000`)

DEFINER, `authenticated`. Caller: `LoyaltyService.openPokeball` (`loyalty.service.ts:104`) from the /account Pokédex pokeball dialog. Atomic: validates the tier against `app_settings.pokeball_tiers` (`UNKNOWN_TIER`); **locks the caller's `profiles` row `FOR UPDATE`** (serializes concurrent opens — two tabs can't both pass the balance check); computes balance = `SUM(loyalty_transactions.amount)` (`INSUFFICIENT_POINTS`); picks `award` random dex numbers from `generate_series(1, 1025)` not already in `caught_pokemon_numbers` (`POKEDEX_COMPLETE` when none left; near-complete dex may award fewer than the tier promises at full cost — accepted); inserts a `kind='redeem'` negative ledger row (`Pokébola: <label>`); appends to `caught_pokemon_numbers`. Returns `{ok, awarded: [n...], new_balance}`. Other errors: `NOT_AUTHENTICATED`, `NO_PROFILE`. This RPC is the only writer of `caught_pokemon_numbers` (column grants exclude it — see data-model).

### Edge functions (Deno, `supabase/functions/`)

All four have `verify_jwt = false` in `supabase/config.toml` and use the auto-injected `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.

#### `price-check`

- **Invoked by**: the `price-check-weekly` pg_cron job (`0 10 * * 1` = Monday 04:00 CR) via `net.http_post` using Vault secrets `price_check_url` + `supabase_anon_key`; body `{trigger: 'cron'}`. NOT called by the admin's "Ejecutar revisión ahora" button (that's the browser runner).
- **Behavior**: reads `app_settings` (skips when `price_review_enabled` false or no exchange rate); starts/continues a run; processes up to `batch_size` (default 200, max 500) qualifying NM singles oldest-first with concurrency 4, fetching each card from `https://api.tcgdex.net/v2/en/cards/<card_ref>` REST (mirrors `src/app/core/catalog/tcgplayer-pricing.ts` variant-picking by hand — kept in sync manually); records via `admin_record_price_check`. If the batch was full it accumulates counters and **self-chains** (fetch to its own URL with the same `run_id`); otherwise finalizes with `admin_price_review_finish`.
- **Env**: only the auto-injected pair.

#### `send-order-email`

- **Invoked by**: the browser — `OrdersService.placeOrder` fire-and-forgets `functions.invoke('send-order-email', {body: {order_id, email}})` after a successful `place_order`. Anon-callable; the **order_id + customer_email match is the spam guard** (`EMAIL_MISMATCH` 403 otherwise).
- **Behavior**: loads the order + items via service role; loads `app_settings` payment fields; sends via **Resend** (`https://api.resend.com/emails`): (1) customer confirmation — items table, totals, SINPE/transfer instructions with a prefilled WhatsApp link when applicable; (2) one admin notification to all `order_notification_recipients` (parsed, validated, lowercased; reply-to = the customer) with a deep link `STORE_PUBLIC_URL/admin/orders/<id>`. Empty recipients ⇒ no admin mail.
- **Env**: `RESEND_API_KEY`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME` (default "Poke-Singles"), `STORE_PUBLIC_URL` (default `https://new.poke-singles.com`).

#### `send-raffle-result`

- **Invoked by**: the `raffles_notify_result` DB trigger via pg_net (Vault: `raffle_result_url` + `supabase_anon_key`); body `{product_id}`.
- **Behavior**: reads raffle + product + participants via service role; emails each participant individually through Resend (winner gets a congrats variant), plus an admin summary; stamps `raffles.notified_at`.
- **Env**: same Resend quartet as send-order-email.

#### `send-signup-email`

- **Invoked by**: the `on_auth_user_created` trigger (`handle_new_user()`) via pg_net (Vault: `signup_email_url` + `supabase_anon_key`); body `{user_id}`. Notification failure never blocks account creation (exception swallowed in the trigger).
- **Behavior**: loads the user + profile via service role, resolves the auth provider label (Email/Magic link, Google, …), sends ONE admin notification to `order_notification_recipients` (same recipient list as orders).
- **Env**: same Resend quartet.

### PHP image endpoints (`server/`, deployed to the card-images root on SiteGround)

These exist because product images are self-hosted static files on SiteGround (no Supabase Storage involved). Deployed by `npm run images:upload` (globs `server/*.php`). All three are consumed by `src/app/core/images/image-browser.service.ts` for the admin image-picker dialog.

**Auth gate — `_supabase-auth.php` + `auth-config.php`**: every endpoint `require`s the gate and calls `require_admin()` after the OPTIONS short-circuit. The Angular admin sends its Supabase access token in the **`X-Supabase-Token`** header (custom header because `Authorization` is occupied by the dev proxy's HTTP Basic Auth on localhost). The gate validates by calling `GET {SUPABASE_URL}/auth/v1/user` with the token + the publishable key and requires `app_metadata.role === 'admin'` — signature-algorithm-agnostic, no server-side secret. `auth-config.php` holds the two **public** constants `SUPABASE_URL` (`https://dhslfridsjdmhwzrgebv.supabase.co` — dev project; edit at prod cutover) and `SUPABASE_ANON_KEY`. Failures: 401 `no_token`/`invalid_token`, 403 `not_admin`.

| Endpoint | Method / params | Behavior |
|---|---|---|
| `list-images.php` | GET `?path=<rel>` | JSON directory listing scoped strictly below the script's own directory (`realpath` bound — `?path=..` fails 404). Returns `{path, parent, dirs: [{name, path}], files: [{name, path, url, size, mtime}]}` with **absolute** URLs (the SPA runs on a different origin). Filters to image extensions (jpg/jpeg/png/gif/webp/avif); hides dotfiles and itself. |
| `upload-image.php` | POST multipart `file`, `path` | Same realpath bound; 8 MB cap; MIME sniffed via `finfo` (never trusts client name/type) with an allow-list `webp/png/jpg/gif/avif` — the **saved extension is derived from the detected MIME**, so a disguised `.php` can never land executable; filename slugified + de-duplicated (never overwrites); `chmod 0644`. Responds with the same shape as a list file entry. |
| `create-folder.php` | POST `path`, `name` | Same bound; name slugified to a single safe segment (no slashes/dots); idempotent (existing folder returned, not an error). Responds `{name, path}`. |

## Contracts & conventions

- **Error style split**: customer-flow RPCs (`place_order`, `open_pokeball`, `validate_coupon`, `attach_payment_proof`, `cancel_order`) return `{ok: false, error: 'CODE'}` jsonb so the UI maps friendly messages; admin/report RPCs `raise exception 'NOT_AUTHORIZED'` and let the client treat any thrown error as fatal. Angular services map transport errors to `{ok:false, error:'RPC_ERROR'}`.
- **Changing a signature**: `CREATE OR REPLACE` cannot change parameter lists or `RETURNS TABLE` shapes — DROP the old signature first (and re-`GRANT`), otherwise PostgREST hits overload ambiguity (precedent: `admin_customers`, `search_products`, `admin_record_price_check`).
- **Adding params**: append with defaults at the tail so existing named-arg callers keep resolving (precedent: `p_on_sale_only`, `p_category_slug`, `p_sort`).
- **Grants are explicit**: every new function needs `grant execute ... to authenticated` (and `anon` only when guests genuinely call it: `search_*`, counts, `get_guest_order`, `attach_payment_proof`, `log_search`, `order_accepts_proof`, `category_id_by_slug`, `raffle_category_id`, `count_search_products`).
- **pg_net calls use the `net` schema** (`net.http_post`) — `extensions.http_post` does not exist on this project and the exception guards will silently eat the mistake.
- **Vault secrets are per-environment setup**, created manually in the SQL editor: `signup_email_url`, `raffle_result_url`, `price_check_url`, `supabase_anon_key`. Missing secrets = notifications silently skipped (by design).
- **Resend is the only mail provider**; sender identity comes from `MAIL_FROM_ADDRESS`/`MAIL_FROM_NAME` env vars on the functions, recipients from `app_settings.order_notification_recipients`.
- The TCGplayer variant-picking logic exists **twice** (client `tcgplayer-pricing.ts` and `price-check/index.ts`) and is kept in sync by hand — change both.

## Gotchas / invariants

- **`place_order` grants points never** — loyalty earn fires on the pending→paid transition trigger. If the mission is "why didn't the customer get points", look at `orders_loyalty_points` + `loyalty_enabled`, not the checkout RPC.
- `validate_coupon`/`calculate_coupon_discount` take `p_subtotal` but **ignore it** — the eligible amount is recomputed from the caller's DB cart. Guests can't validate coupons at all (`AUTH_REQUIRED`); guest coupon enforcement happens only inside `place_order` via `guest_email`.
- `place_order` locks products in ascending-uuid order (v7). Any new multi-product locking RPC must use the same global order or it can deadlock against checkout.
- The coupon row is locked `FOR UPDATE` during checkout — a long-running admin coupon edit can briefly block checkouts using that code (and vice versa).
- `admin_price_review_start` wipes the whole queue (`where true`) — calling it casually destroys the current triage state. Self-chained edge batches deliberately skip it by passing `run_id`.
- `cancel_order` restores stock through the restock trigger — see the data-model gotcha about the lost featured-reset branch; restocked-by-cancellation products currently keep/regain `featured`.
- `draw_raffle` is idempotent but **`UNPAID_ENTRIES` blocks the draw entirely** while any entry order is pending — the admin must resolve (mark paid or cancel) every pending entry order first.
- `search_category_counts` has NO category-slug param (it counts per-category); don't copy the 3-arg pattern from the other two facet counters blindly.
- The `price-check` edge function's self-chain is fire-and-forget: if a chained call dies, the run row keeps `finished_at = NULL` forever — the summary shows a permanently "running" run until the next `admin_price_review_start` wipes it.
- `admin_dashboard_stats.inventory_value` values stock at full `price`, ignoring `sale_price` — intentional so far, but don't reconcile it against realized-revenue math.
- `send-order-email` is invoked from the browser post-checkout; if the tab closes immediately the email may never fire (accepted risk — "admin can re-send manually").
- PHP endpoints trust `X-Supabase-Token` + a live round-trip to Supabase Auth per request — they go down if Supabase Auth is unreachable, independent of the SPA.
- `log_search`'s `found_count` and `log_activity` dedup are analytics conveniences, not security controls.

## Related docs

- [data-model.md](./data-model.md) — the tables, views, RLS, triggers, and storage these functions operate on.
- [commerce-flow.md](./commerce-flow.md) — the cart/checkout/confirmation UX sequence around `place_order`.
- [loyalty-and-pokedex.md](./loyalty-and-pokedex.md) — the points economy around `open_pokeball` and the earn/reversal trigger.
- [auth-and-roles.md](./auth-and-roles.md) — `is_admin()`, guards, and session flow.
- [environments-and-deploy.md](./environments-and-deploy.md) — where the PHP endpoints and edge functions get deployed, env tiers, Vault setup per environment.
- Screen docs: [../screens/storefront/checkout.md](../screens/storefront/checkout.md), [../screens/storefront/order-confirmation.md](../screens/storefront/order-confirmation.md), [../screens/admin/price-review.md](../screens/admin/price-review.md), [../screens/admin/raffle-detail.md](../screens/admin/raffle-detail.md), [../screens/admin/reports.md](../screens/admin/reports.md), [../screens/admin/customers.md](../screens/admin/customers.md).
