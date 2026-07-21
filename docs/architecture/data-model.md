# Data model (Supabase Postgres schema, RLS, views, storage)

> Part of the Poke-Singles docs set. Verified against source on 2026-07-20. Load together with /CLAUDE.md.

## Purpose

Give a future session a complete, source-verified map of the Postgres schema behind Poke-Singles: every table and view, its purpose, key columns, its RLS posture (public read / admin-only / owner-scoped / locked down), and the constraints, triggers, and sequences that enforce business rules below the app layer. Column names and policy names here are exact — copied from `supabase/migrations/*.sql` and cross-checked against the generated types and the live dev DB.

## Scope

- Every table in `public`, plus the `payment-proofs` Storage bucket and its policies.
- Every view (`available_products`, `products_search`, `rifas_listing`, `subastas_listing`, `subastas_bids`) and why each has the `security_invoker` setting it has.
- Triggers and trigger functions attached to tables, and the `orders_number_seq` sequence.
- The `is_admin()` role check that nearly every policy leans on.
- NOT covered here: RPC bodies, edge functions, and the PHP image endpoints — see [backend-rpcs-and-functions.md](./backend-rpcs-and-functions.md). Checkout mechanics end-to-end — see [commerce-flow.md](./commerce-flow.md).

## Key files

| File | Role |
|---|---|
| `supabase/migrations/*.sql` | Schema truth. **Later migrations supersede earlier ones** — this doc describes the FINAL state after `20260704130000_admin_pokedex_leaderboard.sql`. |
| `src/app/core/supabase/database.types.ts` | Generated TypeScript types — the quickest way to confirm current column lists. Currently in sync with the migrations (verified: `products.seller_id`, `profiles.caught_pokemon_numbers`, `card_details` all present). |
| `src/app/core/supabase/supabase.service.ts` | The single browser client (`SupabaseService.client`) every Angular service goes through. |
| `supabase/migrations/README.md` | Project-local migration conventions. |

Migration workflow reminder: apply with `npm run db:push:dev`, sequential timestamps, never MCP `apply_migration` (drifts history).

## How it works

### `is_admin()` — the role check everything uses

```sql
create or replace function public.is_admin()
returns boolean language sql stable as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;
```

Admin status lives in the JWT's `app_metadata.role` (set server-side in Supabase Auth, not editable by the user). Every `*_admin_all` policy below is `for all to authenticated using (public.is_admin()) with check (public.is_admin())`. Because permissive policies OR together, an admin session satisfies both the public-read policy and the admin policy on the same table — which is why `products_search` had to self-filter (see Views).

### Catalog tables

#### `products` (created `20260501205916`, heavily extended since)

One row per SKU (~5k on cutover). Key columns:

- Identity/taxonomy: `id uuid PK`, `category_id uuid NOT NULL → categories ON DELETE RESTRICT`, `set_id uuid → sets ON DELETE SET NULL`, `name`, `pokemon_name` (normalized lowercase by trigger), `slug UNIQUE`, `description`, `rarity`, `card_number`, `language` (default `'EN'`), `condition` (NM/LP/MP/HP/DMG — free text, app-enforced), `variant` (normal/holo/reverse/… — no CHECK; allowed set lives in app `VARIANT_OPTIONS`).
- TCGdex-promoted metadata (all nullable): `card_ref` (**renamed from `tcgdex_id`** in `20260525002000_neutralize_card_source_names.sql`, FK → `card_details.card_ref` ON DELETE SET NULL), `illustrator`, `regulation_mark`, `category` (TCGdex card category text — Pokemon/Trainer/Energy — *not* the store category), `stage`, `type1`, `type2`, `legal_standard`, `legal_expanded`.
- Commerce: `price numeric(10,2) CHECK (price >= 0)`, `sale_price numeric(10,2) CHECK (sale_price is null or (sale_price > 0 and sale_price < price))` — NULL means no sale; effective price everywhere is `coalesce(sale_price, price)`. `quantity integer CHECK (quantity >= 0)`, `active boolean default true`, `featured boolean NOT NULL default false` (home "Destacadas" rail).
- Consignment: `seller_id uuid → sellers ON DELETE RESTRICT` (`20260704100000`). NULL = house inventory. RESTRICT means a seller with products can't be deleted.
- Bookkeeping: `first_listed_at` (pinned immutable by trigger), `last_restocked_at`, `price_checked_at` (price-review cursor, `20260525003500`), `created_at`, `updated_at`, `image_url`.
- Soft delete: `deleted_at timestamptz` (`20260714120000`). NULL = live. `ProductsService.softDelete()` sets it **and** flips `active = false` in one update (deleted ⇒ inactive, so every `active`-filtering storefront path is covered); `restore(id, active = false)` clears it. Products are **never hard-deleted**: sealed-payout detection and consignment reports join `order_items → products → categories` live, so a missing row would strand pending payout lines as `NOT_SEALED`.

Triggers on `products`:

| Trigger | Function | Behavior (final version) |
|---|---|---|
| `products_set_updated_at` | `tg_set_updated_at` | `updated_at := now()` before update. |
| `products_track_restock` | `tg_products_track_restock` | BEFORE INSERT OR UPDATE OF quantity. INSERT: sets `last_restocked_at := now()` only when quantity > 0 **and the caller didn't supply a value** (`20260526000000_products_restock_respect_caller.sql` — lets `prepare-for-prod.mjs` seed historical dates). UPDATE: bumps it on a 0 → >0 transition. **See Gotchas: the featured-reset-on-sell-out branch was lost.** |
| `products_normalize_pokemon_name` | `tg_products_normalize_pokemon_name` | Lowercase + trim; empty → NULL. |
| `products_pin_first_listed_at` | `tg_products_pin_first_listed_at` | BEFORE UPDATE: `new.first_listed_at := old.first_listed_at` — immutable after insert. |

RLS (final policy from `20260714120000_products_soft_delete.sql`):

```sql
create policy products_public_read on public.products
  for select to anon, authenticated
  using (
    deleted_at is null
    and active = true and price > 0
    and (case when category_id = public.raffle_category_id() then true
              else quantity > 0 end)
  );
```

i.e. normal products must be live (not soft-deleted), in stock, and priced; **raffle products stay publicly visible at quantity 0** (sold-out rifas show as AGOTADA until drawn). Plus `products_admin_all` (full CRUD for admins). Note the `price > 0` invariant: a zero-priced row can never leak to shoppers. The `deleted_at is null` guard is belt-and-braces — deleted rows are also `active = false` — so a stray `active = true` flip can't resurrect a deleted product.

Partial indexes (`products_restocked_idx`, `products_set_idx`, `products_pokemon_idx`, `products_category_idx`, `products_featured_idx`, `products_regulation_mark_idx`, `products_illustrator_idx`, `products_type1_idx`) all carry the predicate `active = true and quantity > 0 and price > 0` to match the customer-visible set; plus `products_card_ref_idx`, `products_seller_idx` (partial `seller_id is not null`), `products_price_checked_at_idx` (partial `active and card_ref is not null`, NULLS FIRST ordering for the price-review cursor).

#### `categories`

`id`, `slug UNIQUE`, `name`, `active`, `sort_order`, `created_at`. RLS: `categories_public_read` (only `active = true`), `categories_admin_all`. The `rifas` category (slug `'rifas'`, seeded `20260525000000`) is special — resolved by `raffle_category_id()` and excluded from all normal listings. Products FK with ON DELETE RESTRICT, so a category with products can't be deleted.

#### `sets`

`id`, `code UNIQUE`, `name`, `series`, `release_date`, `symbol_image_url`, `printed_total int CHECK (null or > 0)` (`20260521000000` — enables "#15/151" rendering and the `N/M` search branch; backfilled from cached TCGdex `set.cardCount.official`), `created_at`. RLS: `sets_public_read` (`using (true)` — no active column), `sets_admin_all`. `20260502010000` one-shot deleted all `series = 'Pokémon TCG Pocket'` sets.

#### `card_types` + `product_card_types`

Many-to-many taxonomy ("Full Art Pokémon", "Secret Rare", …; 26 legacy facets seeded in `20260502030000`). `card_types`: `id`, `slug UNIQUE`, `name`, `active`, `sort_order`, `created_at`, plus `category_id uuid → categories ON DELETE CASCADE` (`20260525002100`): NULL = global (the singles "Rareza" tags, multi-select in admin), non-NULL = scoped to one category (sealed/accessories sub-types, seeded slugs `sellado-*` and `acc-*`, single-select **enforced only in the admin UI**). Junction `product_card_types (product_id, card_type_id) PK`, both FKs CASCADE. RLS: `card_types_public_read` (active only) / `product_card_types_public_read` (`true`) / both have `*_admin_all`.

#### `card_details` (renamed from `tcgdex_cards`)

TCGdex card-payload cache: `card_ref text PK` (the TCGdex id value, e.g. `'swsh3-136'` — values unchanged by the rename), `data jsonb`, `fetched_at`. Renamed table+column in `20260525002000` so the string "tcgdex" never appears in client-visible REST traffic (competitor-inspection defense). Policies renamed to `card_details_public_read` (`true`) and `card_details_admin_all`.

### Customer/account tables

#### `profiles`

1:1 with `auth.users` (`id uuid PK → auth.users ON DELETE CASCADE`), auto-created by the `on_auth_user_created` trigger (`handle_new_user()` — see backend doc). Columns: `full_name`, `phone`, `default_shipping_address jsonb`, `avatar_pokemon_number integer CHECK (1..1025)` (`20260610000000`; artwork is a static asset `assets/images/avatars/{n}.png`), `caught_pokemon_numbers integer[] NOT NULL DEFAULT '{}'` (`20260630000000` — the customer Pokédex; a plain array, not a junction table), `auction_banned_at timestamptz` + `auction_ban_reason text` (`20260717000000` — the auctions-only ban: NULL = not banned; set/cleared by `admin_set_auction_ban`; checked by `place_bid` and the auction winner pick; NOT in the client-update grant lists — admin RPC only), `created_at`, `updated_at` (trigger `profiles_set_updated_at`).

RLS: `profiles_self_read` / `profiles_self_insert` / `profiles_self_update` (all `id = auth.uid()`), `profiles_admin_all`. **Crucially**, `20260704000000_pokeball_redemption.sql` narrowed table grants to column lists:

```sql
revoke update on public.profiles from authenticated;
grant  update (full_name, phone, default_shipping_address, avatar_pokemon_number)
  on public.profiles to authenticated;
-- same for INSERT (plus id)
```

so customers **cannot** write `caught_pokemon_numbers` directly — only the `open_pokeball()` SECURITY DEFINER RPC can. Any future client-editable profile column must be added to both grant lists or client PATCHes will 403.

#### `cart_items` + `carts`

`cart_items`: `(user_id → auth.users CASCADE, product_id → products CASCADE) PK`, `quantity CHECK (> 0)`, `added_at`. One line per SKU per user. Anonymous carts live in localStorage; `CartService` merges them into this table on sign-in. RLS: `cart_items_self_all` only — **no admin policy on purpose** (admins have no business reading carts).

`carts`: companion per-user cart-level state — `user_id PK → auth.users CASCADE`, `coupon_id → coupons ON DELETE SET NULL`, `updated_at`. Lazily upserted when a coupon is applied. RLS: `carts_self_all` only.

#### `customer_activity` (`20260525002700`)

Event log behind the admin Actividad report: `id`, `user_id → auth.users SET NULL`, `customer_name`/`customer_email` (snapshots), `event_type CHECK IN ('login','order_created','registered')`, `order_id → orders SET NULL`, `ip inet`, `created_at`. **RLS enabled with NO policies** — completely locked; writes only via SECURITY DEFINER (`log_activity`, `place_order`), reads only via `admin_customer_activity`.

#### `search_log` (`20260525003000`)

One row per committed storefront search: `id`, `user_id SET NULL` (NULL = guest), `customer_name` snapshot, `keyword NOT NULL`, `found_count int default 0`, `category_id → categories SET NULL` (reserved — always NULL today), `ip inet`, `created_at`. Same lockdown as `customer_activity`: **RLS with no policies**; write via `log_search`, read via `admin_customer_searches`.

#### `loyalty_transactions` (`20260528000000`, kinds extended `20260704000000`)

The Poke-Monedas ledger. `id`, `user_id NOT NULL → auth.users CASCADE` (no guest path), `order_id → orders SET NULL`, `amount integer` (+ earn, − reversal/redeem), `kind CHECK IN ('earn','reversal','adjust','redeem')`, `description`, `created_at`. Balance is always `SUM(amount)` — derived, **can legitimately go negative** (reversal after points were spent). RLS: `loyalty_self_read` (`user_id = auth.uid()`), `loyalty_admin_all`. No customer INSERT path — writes come from the `orders_loyalty_points` trigger and `open_pokeball()`.

### Commerce tables

#### `coupons`

`id`, `code text UNIQUE CHECK (code = upper(code) and length >= 3)`, `name text` (friendly label, `20260525003200`, nullable), `type CHECK IN ('PERCENTAGE','FIXED_ON_THRESHOLD')`, `discount_value CHECK (> 0)` (≤ 100 for PERCENTAGE via `coupons_percentage_value_capped`), `min_purchase_amount` (required > 0 for FIXED_ON_THRESHOLD via `coupons_fixed_requires_minimum`), `expires_at NOT NULL`, `max_uses_per_user CHECK (>= 1) default 1`, `is_active`, `deleted_at` (**soft delete** — admin list filters on it; report keeps deleted coupons for history), `category_ids uuid[]` (`20260524000200`: NULL/empty = whole cart; non-empty = discount applies only to eligible categories), `created_at`, `updated_at` (trigger).

RLS: `coupons_admin_all` **only** — customers never read this table; all customer access goes through `validate_coupon` / `calculate_coupon_discount` / `get_my_applied_coupon` (SECURITY DEFINER).

#### `coupon_redemptions`

One row per (coupon, order): `id`, `coupon_id NOT NULL → coupons`, `user_id → auth.users SET NULL`, `guest_email` (per-user cap for guests), `order_id NOT NULL → orders CASCADE`, `discount_amount_applied CHECK (>= 0)`, `redeemed_at`. RLS: `coupon_redemptions_self_read` (`user_id = auth.uid()`), `coupon_redemptions_admin_all`. Inserted only by `place_order`; **deleted by `cancel_order`** so cancellation releases the per-user usage count.

#### `shipping_methods`

`id`, `name`, `description`, `price CHECK (>= 0)`, `sort_order`, `is_active`, `deleted_at` (soft delete), `requires_address boolean NOT NULL default true` (`20260509000700` — pickup methods flip false; checkout hides address fields and `place_order` nulls the address), `allowed_category_ids uuid[] NOT NULL default '{}'` (`20260526120000` — empty = all carts; non-empty = every distinct cart category must appear in it, enforced client-side AND in `place_order` v9+), `created_at`, `updated_at` (trigger). RLS: `shipping_methods_public_read` (active + not deleted), `shipping_methods_admin_all`.

#### `orders`

Denormalized, snapshot-heavy order header. Columns: `id uuid PK`, `order_number integer NOT NULL UNIQUE default nextval('orders_number_seq')` (**sequence starts at 7300**, continuing OpenCart's numbering; `20260509000100`), `user_id → auth.users SET NULL` (**nullable — guests checkout**), `status CHECK IN ('pending','paid','shipped','completed','cancelled')` default `'pending'`, `customer_email/name/phone NOT NULL`, `shipping_address jsonb` (shape: `{line1, line2?, city, province, notes?}`), `shipping_method_id → shipping_methods SET NULL` + `shipping_method_name NOT NULL` + `shipping_amount` (snapshots), `payment_method CHECK IN ('sinpe_or_transfer','payment_link')`, `payment_proof_url` (Storage path or the sentinel `'__whatsapp__'` — `WHATSAPP_PROOF_SENTINEL` in `orders.service.ts`), `subtotal`, `discount_amount default 0`, `coupon_id SET NULL` + `coupon_code` (snapshot), `total`, `customer_notes`, `cancellation_notes` (`20260523000000`), `payment_reminder_at` (last "Recordar pago" email, stamped by the `send-payment-reminder` edge function; `20260708000000`), `created_at`, `updated_at` (trigger `orders_set_updated_at`).

RLS: `orders_self_read` (`user_id = auth.uid()`), `orders_admin_all`. **No customer INSERT/UPDATE policies** — creation only via `place_order`, guest reads only via `get_guest_order` (id + email match), proof attach via `attach_payment_proof`. Admins flip forward statuses (pending→paid→shipped→completed) with a plain PostgREST UPDATE (allowed by `orders_admin_all`); cancellation must go through `cancel_order` for stock/coupon restitution.

Triggers on `orders`: `orders_set_updated_at`; `orders_loyalty_points` — `AFTER UPDATE OF status`, runs `award_or_reverse_loyalty_points()`: on first entry into `'paid'`, if `app_settings.loyalty_enabled`, awards `floor((subtotal − discount_amount) / loyalty_colones_per_point)` points (`kind='earn'`, description `Compra #<order_number>`, once per order); on first entry into `'cancelled'`, claws back exactly the earned amount (`kind='reversal'`, fires even if loyalty is now disabled, may push balance negative). Guests (`user_id IS NULL`) are skipped.

#### `order_items`

Pure snapshots so history survives product edits/deletion: `id`, `order_id NOT NULL → orders CASCADE`, `product_id → products SET NULL`, `product_slug`, `product_name`, `product_image_url`, `product_condition`, `product_set_name` + `product_card_number` (`20260509000200`), `seller_id → sellers SET NULL` + `seller_code` + `seller_name` (`20260704100100` — consignment attribution; house inventory leaves all three NULL), `unit_price`, `quantity CHECK (> 0)`, `line_total`, `seller_payout_id → seller_payouts SET NULL` (`20260714100000` — NULL = seller not yet paid; the SET NULL is the payout-undo path), `created_at`. Partial indexes `order_items_pending_payout_idx` (`seller_id` where consigned + unpaid) and `order_items_payout_idx` (`seller_payout_id` where set). RLS: `order_items_self_read` (EXISTS parent order owned by caller), `order_items_admin_all`.

#### `sellers` (`20260704100000`)

Consignment sellers; the house has no row. `id`, `name`, `email`, `phone`, `code text UNIQUE CHECK (code ~ '^[A-Z0-9]{2}$')` (2-char uppercase; lowercased only when appended to product slugs), `active` (retirement = flag, no delete UI), `created_at`. RLS: `sellers_admin_all` **only** — nothing customer-facing reads it (`place_order` is SECURITY DEFINER so checkout can join it regardless).

#### `seller_payouts` (`20260714100000`)

Consignment payout batches (seller detail, `/admin/sellers/:id`): one row per bulk "Marcar pagado". `id`, `seller_id NOT NULL → sellers ON DELETE RESTRICT` (payout history makes a seller undeletable), `seller_code` + `seller_name` (display snapshots), `total_sold` / `cuanto_fees` / `store_fees` / `total` (breakdown **frozen at creation** by `create_seller_payout` via `sealed_payout_fees()` — authoritative even if fee rules change later), `item_count`, `notes`, `created_by → auth.users SET NULL`, `created_at`. Items link via `order_items.seller_payout_id`; deleting a batch reverts them to pending (FK SET NULL). RLS: `seller_payouts_admin_all` only. Fee rules + RPCs → [backend-rpcs-and-functions.md](./backend-rpcs-and-functions.md).

### Raffles

A raffle IS a product in the `rifas` category: `products.quantity` = entries remaining, `price` = per-entry price, `description` = notes. The 1:1 companion table:

#### `raffles` (`20260525000200`)

`product_id PK → products CASCADE`, `draw_at`, `status CHECK IN ('scheduled','drawn','void')` default `'scheduled'` (void = drawn with zero paid participants), `winner_order_id → orders SET NULL`, `winner_name`, `winner_email`, `winning_entry int`, `total_entries int default 0`, `market_price numeric(12,2) CHECK (>= 0)` (`20260525001000` — the card's real market value shown on /rifas), `drawn_by → auth.users SET NULL`, `drawn_at`, `notified_at` (stamped by the send-raffle-result edge function), `created_at`, `updated_at` (trigger). An earlier `products.raffle_date` column was added (`20260525000000`) then **dropped** (`20260525000200`) in favor of `raffles.draw_at`.

RLS: `raffles_admin_all` **only**. Public access goes exclusively through the `rifas_listing` definer view (below) — `winner_email` is never exposed.

Trigger: `raffles_notify_result` — AFTER UPDATE OF status, `WHEN (new.status in ('drawn','void') and old.status = 'scheduled')`, runs `notify_raffle_result()` which fires a best-effort `net.http_post` (pg_net) to the `send-raffle-result` edge function using Vault secrets `raffle_result_url` + `supabase_anon_key`; failures are swallowed so the draw never rolls back.

### Auction tables (`20260717000100`)

An auction IS a product in the `subastas` category (sort_order 101): `products.price` = starting bid, `quantity` = 1 while live (0 once the winner order lands), `description` = notes. Helper `auction_category_id()` mirrors `raffle_category_id()`; `products_public_read` special-cases the category so closed auctions stay visible (`20260717000000`, which also carries the current policy text incl. the `deleted_at` guard).

#### `auctions`

`product_id PK → products CASCADE`, `ends_at timestamptz` (NULL = not scheduled, bidding blocked), `min_increment numeric(12,2) NOT NULL DEFAULT 1000 CHECK (> 0)`, `anti_snipe_minutes int NOT NULL DEFAULT 1 CHECK (0..60)` (default was 5 until `20260720000100`), `status CHECK IN ('active','ended','void')` default `'active'`, denormalized live state `current_bid` / `bid_count` / `leader_user_id` (owned by `place_bid`), winner block `winner_user_id` / `winner_bid_id → bids SET NULL` / `winner_order_id → orders SET NULL` / `winner_name` / `winner_email` (owned by `process_auctions` / `reassign_auction_winner`), `reminder_sent_at` (30-min reminder once-guard), `notified_at` (stamped by send-auction-result), `closed_at`, `relist_count int default 0`, `created_at`, `updated_at` (trigger).

RLS: `auctions_admin_all` **only** — public access via `subastas_listing` (never exposes `winner_email` or user ids).

Triggers: `auctions_broadcast` — AFTER UPDATE OF `current_bid, bid_count, ends_at, status` → `tg_auction_broadcast()` → `realtime.send()` on public topic `auction:<product_id>` (masked payload, failures swallowed). `auctions_notify_result` — AFTER UPDATE OF `winner_order_id`, `WHEN (new IS NOT NULL AND IS DISTINCT FROM old)` → `notify_auction_result()` → pg_net to `send-auction-result` (Vault `auction_result_url`).

#### `bids`

Append-only; inserted ONLY by `place_bid`. `id uuid PK`, `product_id → auctions(product_id) CASCADE`, `user_id → auth.users SET NULL`, snapshot `bidder_name` / `bidder_email` (survive profile edits + account deletion), `amount numeric(12,2) CHECK (> 0)`, `invalidated_at timestamptz` (stamped by `relist_auction` — archived rounds; every live read filters `IS NULL`), `created_at`. Indexes: partial `(product_id, amount desc, created_at asc) WHERE invalidated_at IS NULL` (top-bid picks), `(product_id, created_at desc)`, `(user_id)`. RLS: `bids_admin_all` only; public history via `subastas_bids`.

#### `subastas_listing` + `subastas_bids` — definer views

Both `security_invoker = false` (deliberate, same rationale as `rifas_listing`), granted to `anon, authenticated`. `subastas_listing`: products ⨝ auctions ⨝ sets, safe columns only (`starting_price` = `products.price`, `winner_masked` via `mask_bidder_name()`), WHERE `category_id = auction_category_id() AND active AND deleted_at IS NULL AND price > 0`, actives-first. `subastas_bids`: live bids with `bidder_masked`, `avatar_pokemon_number` (profiles join), and `is_mine` (`user_id IS NOT DISTINCT FROM auth.uid()` — auth.uid() still resolves to the caller inside a definer view). Column changes to either = drop + recreate + re-grant.

### Ops/config tables

#### `app_settings` — singleton

Single row enforced by `id boolean PRIMARY KEY DEFAULT true CHECK (id)`; seeded once, UPDATE-only. RLS: `app_settings_public_read` (`true` — no customer-private data), `app_settings_admin_update`. Trigger `app_settings_set_updated_at`. **All columns** (verified against migrations and `database.types.ts`):

| Column | Added in | Meaning |
|---|---|---|
| `id boolean PK` | `20260502002700` | Always `true`. |
| `exchange_rate_usd_crc numeric(12,4)` | initial | USD→CRC rate for TCGdex market prices. |
| `maintenance_mode boolean` / `maintenance_message text` | initial | Storefront maintenance gate. |
| `sinpe_phone`, `whatsapp_number`, `bank_account_info` | `20260508000700` | Payment instructions shown on order confirmation. |
| `order_notification_recipients text NOT NULL default ''` | `20260509000500` | Comma-separated admin emails for order + signup notifications. |
| `price_review_threshold_pct numeric(5,2) default 10 CHECK (0<x<=100)` | `20260525003500` | Flag when \|diff\| ≥ this %. |
| `price_review_floor_crc numeric(12,2) default 5000 CHECK (>=0)` | `20260525003500` | Only review products priced ≥ this. |
| `price_review_enabled boolean default true` | `20260525003500` | Cron honors this flag. |
| `loyalty_enabled boolean default false` | `20260528000000` | Gate for earning points. |
| `loyalty_colones_per_point numeric(12,2) default 1000` | `20260528000000` | ₡ of net merchandise per point. |
| `pokeball_tiers jsonb` | `20260704000000` | `[{key,label,cost,award}×4]` — poke/super/ultra/master tier economy; UI and `open_pokeball()` both read it. |
| `legacy_order_count integer NOT NULL default 0` | `20260713000000` | Lifetime order count of the OpenCart store at the 2026-07 cutover (5953; orders up to #7303 — `orders_number_seq` continues at 7304). Not surfaced in UI yet. |
| `legacy_sales_total_crc numeric NOT NULL default 0` | `20260713000000` | Lifetime OpenCart sales total in colones at cutover (₡64.6M). Not surfaced in UI yet. |
| `updated_at` | initial | Trigger-maintained. |

#### `static_pages` (`20260510000000`)

Admin-managed info pages (`/info/:slug`): `id`, `slug UNIQUE`, `title`, `content` (HTML), `meta_description`, `is_published default true`, `sort_order`, `deleted_at` (soft delete), timestamps + trigger. RLS: `static_pages_public_read` (published + not deleted), `static_pages_admin_all`. Live seeded slugs: `sobre-nosotros`, `estado-de-cartas` (full condition guide), `politica-pedidos-envios` (slug typo fixed in `20260525001500`). `bienvenida` (the old welcome modal) was copied into an inactive `announcements` row and soft-deleted by `20260714000000`.

#### `announcements` + `announcement_reads` (`20260714000000`)

`announcements` — admin-authored modals shown once per visitor (see the storefront dialogs + admin announcements docs): `id`, `title`, `body_html` (constrained rich text), `image_url` (root-relative `/card-images/...`), `link_path` + `link_label` (optional internal CTA), `is_active`, `view_count integer default 0` (impressions incl. guests), `deleted_at` (soft delete), timestamps + trigger. Partial unique index `announcements_single_active_idx ON (is_active) WHERE is_active AND deleted_at IS NULL` — at most one live active row, ever. RLS: `announcements_public_read_active` (anon/authenticated see ONLY the active, non-deleted row), `announcements_admin_all`.

`announcement_reads` — per-user seen flags: `announcement_id → announcements CASCADE`, `user_id → auth.users CASCADE`, `seen_at`, `PK(announcement_id, user_id)`. Row present = that user never sees that announcement again (re-activation does not reset). RLS: `announcement_reads_self` (`for all`, `cart_items` pattern — covers the client upsert) + `announcement_reads_admin_read`.

RPC `increment_announcement_views(p_id uuid)` — `SECURITY DEFINER`, granted to anon+authenticated; bumps `view_count` only where `is_active AND deleted_at IS NULL` so guests can't inflate arbitrary ids. Fired by the storefront when the modal opens (admin previews excluded).

#### `price_reviews` + `price_check_runs` (`20260525003500`, extended `20260525003800`)

`price_reviews` — one row per flagged product: `product_id PK → products CASCADE`, `card_ref NOT NULL`, snapshots `store_price`, `market_usd`, `exchange_rate`, `market_crc`, `suggested_price` (= `ceil(market_crc/100)*100`), `diff_pct` (signed; + = store over market), `market_updated_at`, `tcgplayer_product_id integer` (deep-link to tcgplayer.com), `checked_at`, `ignored_at`. Ignore semantics: hidden when `ignored_at >= checked_at`; the next run's upsert resets `ignored_at = NULL` so still-off-band cards resurface. Index `price_reviews_abs_diff_idx` on `abs(diff_pct) desc`.

`price_check_runs` — audit rows: `id`, `started_at`, `finished_at`, `trigger CHECK IN ('manual','cron')`, `scanned_count`, `priced_count`, `flagged_count`, `error`. Clean-snapshot rule: `admin_price_review_start` wipes both tables except the new run row.

RLS on both: `*_admin_all` only — the queue would leak the store's whole pricing posture.

### Views

#### `products_search` — the storefront read model

Final definition in `20260714120000_products_soft_delete.sql` (body from `20260618000000_products_search_self_filter.sql` + the `deleted_at` guard): `products` ⨝ `sets` ⨝ aggregated card types, `WITH (security_invoker = on)`. Columns: all customer-relevant product columns (incl. `sale_price`, `card_ref`) plus `set_name`, `set_code`, `card_type_names` (space-joined), `search_text` (concat of name/pokemon_name/slug/card_number/illustrator/types/regulation_mark/stage/category/set name+code/card-type names — **description deliberately excluded** to avoid flavor-text false positives; **card_number/printed_total also excluded** so "115/151" can't substring-match "15/151"), `card_type_ids uuid[]`, `set_printed_total`.

Its own `WHERE` now enforces visibility directly:

```sql
where p.category_id is distinct from raffle_category_id()
  and p.active = true and p.quantity > 0 and p.price > 0
  and p.deleted_at is null
```

Two-step history that a future session must understand:
1. `20260525002400`: the view originally ran as owner (`postgres`), **bypassing products RLS** and leaking inactive/out-of-stock rows into /buscar. Fix: `security_invoker = on` so the caller's RLS applies. **Rule: every storefront-facing view must be `security_invoker = on`** — or it silently bypasses products RLS.
2. `20260618000000`: with invoker semantics, an *admin* session still saw sold-out rows (the permissive `products_admin_all` policy ORs in). Since visibility here is merchandising, not security, the view self-filters in its own WHERE (raffles are already excluded by the category predicate, so the `quantity > 0` guard never hides a sold-out raffle).

Grants: `select` to `anon, authenticated` (re-granted after each DROP/recreate — dropping a view drops its grants).

#### `available_products`

`select <explicit column list> from products where active and quantity > 0 and price > 0`, `security_invoker = on`. Self-filtering convenience view; includes `card_ref` post-rename. Excludes nothing raffle-specific (raffle rows fail `quantity > 0` once sold out but appear while stocked).

#### `rifas_listing` — a definer view (no longer the only one — see the auction views above)

Final definition in `20260528000100_rifas_listing_condition.sql`: `WITH (security_invoker = false)` **on purpose** — it must read the admin-only `raffles` table for anon shoppers. It enforces its own visibility (`category = rifas`, `active`, `price > 0`) and exposes only safe columns: `id, slug, name, image_url, price, sale_price, quantity, notes (= products.description), set_name, draw_at, status (coalesced 'scheduled'), winner_name, total_entries, entries_sold (non-cancelled entries bought), card_number, set_printed_total, market_price, condition`. Never `winner_email`. Granted to `anon, authenticated`. Ordered `draw_at asc nulls last, created_at desc`.

#### "Count views" are not views

The set/category/card-type counts (`set_product_counts`, `card_type_product_counts`, `search_set_counts`, `search_card_type_counts`, `search_category_counts`) are **functions**, not views — documented in [backend-rpcs-and-functions.md](./backend-rpcs-and-functions.md).

### Storage: the `payment-proofs` bucket

Created `20260508000600`: private (`public = false`), `file_size_limit 5242880` (5 MB), `allowed_mime_types ['image/jpeg','image/png','image/webp','application/pdf']`. Object path convention: `{order_id}/proof.{ext}`.

Policies on `storage.objects` (final state after `20260629000000`):

| Policy | Op / roles | Predicate |
|---|---|---|
| `payment_proofs_upload_pending_order` | INSERT to anon, authenticated | `bucket_id = 'payment-proofs' and public.order_accepts_proof(split_part(name,'/',1))` |
| `payment_proofs_update_pending_order` | UPDATE to anon, authenticated | same gate (both USING and WITH CHECK) |
| `payment_proofs_admin_read` | SELECT to authenticated | bucket + `is_admin()` (kept for backward compat) |
| `payment_proofs_admin_all` | ALL to authenticated | bucket + `is_admin()` (`20260509000400` — admin can attach proofs at any status) |

`order_accepts_proof(p_prefix text)` is SECURITY DEFINER: the original policy did the orders EXISTS inline, but **the inline subquery ran under orders RLS**, where anon sees nothing — so valid guest uploads failed. The definer function bypasses orders RLS and returns only a boolean. Related client-side trap: `upsert: true` on this private bucket issues `INSERT ... ON CONFLICT DO UPDATE`, whose conflict path needs visibility customers don't have — `OrdersService.uploadPaymentProof` therefore does a **plain insert** and treats a 409 as success.

### Sequences and extensions

- `orders_number_seq` — starts 7300 (legacy OpenCart continuation), owned by `orders.order_number`.
- `pg_net` (schema `net` — **not** `extensions`; two fix migrations `20260525000400`/`20260525000500` exist because `extensions.http_post` didn't exist and the exception guards silently ate every notification) — used by `handle_new_user`, `notify_raffle_result`, and the cron job.
- `pg_cron` — one job: `price-check-weekly`, `0 10 * * 1` (Mon 04:00 Costa Rica). Body honors `app_settings.price_review_enabled` and posts to the Vault-stored `price_check_url`.
- Vault secrets expected per environment: `signup_email_url`, `raffle_result_url`, `price_check_url`, `supabase_anon_key`.

## Contracts & conventions

- **RLS posture summary**: public-read = `categories` (active), `sets`, `card_types` (active), `product_card_types`, `card_details`, `products` (visibility predicate above), `shipping_methods` (active+not deleted), `static_pages` (published), `app_settings`. Owner-scoped = `profiles`, `cart_items`, `carts`, `orders`/`order_items` (read), `coupon_redemptions` (read), `loyalty_transactions` (read). Admin-only = `coupons`, `raffles`, `sellers`, `price_reviews`, `price_check_runs`. Locked (RLS on, zero policies) = `customer_activity`, `search_log`.
- **Effective price is `coalesce(sale_price, price)`** — cart, search sort, coupon eligibility, and `place_order` all use it.
- **Snapshots over joins**: orders/order_items copy every display field at purchase time (names, set, condition, seller code/name, shipping method name/price, coupon code). Never "fix" an old order by re-joining products.
- **Soft deletes** (`deleted_at`): coupons, shipping_methods, static_pages. Products/categories/card_types use `active` flags instead. Sellers use `active` only.
- **CR-local day boundaries**: every report and the dashboard bucket dates with `at time zone 'America/Costa_Rica'` (UTC-6, no DST).
- **pg-safeupdate is active**: bare `delete from t;` / `update t set …;` fail at runtime with "requires a WHERE clause" — **including inside SECURITY DEFINER RPCs**. Intentional full-table writes must say `where true` (see `admin_price_review_start`, fixed in `20260525003900`).
- **View evolution**: `CREATE OR REPLACE VIEW` can only append columns at the tail (42P16 otherwise); new columns go last or the view is dropped+recreated — and a drop loses grants, so re-`GRANT SELECT ... to anon, authenticated`.
- **Schema-change workflow**: types regen after migrations keeps `database.types.ts` the source of truth for column shapes; app-visible renames must land migration + code together (never edit live-reloaded code ahead of an unapplied rename).
- **No "tcgdex" in client-visible identifiers** — the neutral names are `card_details` / `card_ref`; keep it that way in any new column/view.

## Gotchas / invariants

- **`featured` reset on sell-out was silently reverted.** `20260525001300_reset_featured_on_zero_stock.sql` added a branch to `tg_products_track_restock` clearing `featured` when quantity hits 0; `20260526000000_products_restock_respect_caller.sql` rewrote the same function from the *original* body and **dropped that branch**. Verified against the live dev DB: the current function has no featured-clearing logic, so a sold-out featured product will resurface on the home rail when restocked (and stays flagged while sold out — the one-time cleanup UPDATE in 001300 no longer has a guard). Not fixed here; a future migration should re-merge the two behaviors.
- `products.category` (TCGdex text: Pokemon/Trainer/Energy) vs `products.category_id` (store category FK) — easy to confuse; the search view exposes both.
- The raffle-visibility RLS means `quantity > 0` is NOT a safe proxy for "buyable" on raffle rows fetched via the base table; conversely `products_search` never contains raffles at all.
- `coupon_redemptions` deletion in `cancel_order` means the redemption ledger is *not* append-only — the Coupons report reads usage from `orders` (which keeps `coupon_id`/`discount_amount` but is filtered to non-cancelled), so numbers stay consistent.
- `carts.coupon_id` can point at a coupon that has since expired/deactivated — `get_my_applied_coupon` re-checks and returns NULL; UIs must not trust the raw row.
- `loyalty_transactions.amount` balance can be negative by design; don't "fix" with a floor.
- `profiles` column-grant lists (see above) are the *only* thing stopping free Pokédex fills; adding a client-editable profile column requires editing **both** grant statements.
- `customer_activity` / `search_log` have RLS with no policies — a naive PostgREST select returns empty, which is correct, not a bug.
- `search_log.found_count` is client-supplied (`count_search_products` runs in the caller's RLS context first) — analytics-grade, not tamper-proof.
- Sequence gap: dev orders were backfilled 1..N while the sequence starts at 7300 — the visual gap marks where production numbering begins.
- The shared dev DB (`dhslfridsjdmhwzrgebv`) can run ahead of the migrations folder — pull current function/view definitions before editing them.

## Related docs

- [backend-rpcs-and-functions.md](./backend-rpcs-and-functions.md) — every RPC body, edge function, and the PHP image endpoints.
- [auth-and-roles.md](./auth-and-roles.md) — how `app_metadata.role` gets set, guards, session handling.
- [commerce-flow.md](./commerce-flow.md) — cart → checkout → order lifecycle end-to-end.
- [loyalty-and-pokedex.md](./loyalty-and-pokedex.md) — points economy + Pokédex UX on top of `loyalty_transactions` / `profiles`.
- Screen docs that read this schema directly: [../screens/storefront/search-results.md](../screens/storefront/search-results.md), [../screens/storefront/rifas.md](../screens/storefront/rifas.md), [../screens/admin/orders.md](../screens/admin/orders.md), [../screens/admin/price-review.md](../screens/admin/price-review.md), [../screens/admin/sellers.md](../screens/admin/sellers.md).
