# Commerce flow

> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose

Narrates the end-to-end purchase lifecycle — cart → coupon → checkout → `place_order` → payment proof → admin status transitions / cancellation → emails — across all layers (Angular services, Postgres RPCs/triggers/RLS, Storage, Edge Functions). This is the cross-cutting flow document; per-screen UI detail lives in the screen docs linked throughout.

## Scope

- **In scope:** `CartService` (anon localStorage vs signed-in DB cart, merge on login, stock clamping), coupon apply/revalidate/redemption locking, checkout shipping-method rules (`requires_address`, category scoping), the `place_order` v10 transaction walked step by step, order numbers/statuses, payment-proof upload to the `payment-proofs` bucket, loyalty earn (a trigger, not part of the RPC), `cancel_order`, and the `send-order-email` Edge Function.
- **Out of scope:** loyalty spending/Pokédex (→ [loyalty-and-pokedex.md](./loyalty-and-pokedex.md)), raffle draw logic, product catalog/search, admin CRUD screens.

## Key files

| Layer | File |
|---|---|
| Cart state | `src/app/core/cart/cart.service.ts` |
| localStorage wrapper | `src/app/core/storage/local-storage.service.ts` |
| Orders (customer + admin) | `src/app/core/orders/orders.service.ts` |
| Admin coupon CRUD | `src/app/core/catalog/coupons.service.ts` |
| Shipping methods | `src/app/core/catalog/shipping-methods.service.ts` |
| Shared types | `src/app/core/catalog/catalog.types.ts` (`PlaceOrderInput`, `PlaceOrderResult`, `OrderStatus`, `CouponErrorCode`, `AppliedCoupon`, `LineCoupon`) |
| Checkout UI | `src/app/user/checkout/checkout.ts` |
| Confirmation + proof UI | `src/app/user/order-confirmation/order-confirmation.ts` |
| Orders schema + RLS | `supabase/migrations/20260508000100_orders.sql` |
| Order numbers | `supabase/migrations/20260509000100_order_numbers.sql` |
| Coupons schema | `supabase/migrations/20260507000000_coupons.sql`, `20260507000100_carts.sql`, `20260508000200_coupon_redemptions.sql` |
| Coupon RPCs (final) | `supabase/migrations/20260524000300_coupon_rpcs_category_scoped.sql` |
| Shipping methods schema | `supabase/migrations/20260508000000_shipping_methods.sql`, `20260509000700_shipping_methods_requires_address.sql`, `20260526120000_shipping_methods_categories.sql` |
| **place_order (final, v10)** | `supabase/migrations/20260704100200_place_order_v10_seller_snapshot.sql` |
| Guest lookup + proof attach | `supabase/migrations/20260508000500_order_lookup_and_proof.sql` |
| Proof Storage bucket + RLS | `supabase/migrations/20260508000600_payment_proofs_storage.sql`, `20260629000000_payment_proofs_upload_visibility_fix.sql` |
| cancel_order (final) | `supabase/migrations/20260523000100_cancel_order_releases_coupon.sql` |
| Loyalty earn trigger | `supabase/migrations/20260528000000_loyalty_points.sql` |
| Order emails | `supabase/functions/send-order-email/index.ts`, `supabase/migrations/20260509000500_app_settings_order_emails.sql` |

## How it works

### Stage 1 — Cart (dual backend)

`CartService` (`src/app/core/cart/cart.service.ts`) keeps a single signal-based view (`items`, `itemCount`, `subtotal`, `discount`, `total`, `lineCoupon`) over two backends:

- **Signed out:** items live in `localStorage` under the key **`cart:v1`** as `AnonCartItem[]` (`{product_id, quantity, added_at}`), via `LocalStorageService` (which centralises the `isPlatformBrowser()` guard and try/catch).
- **Signed in:** items live in the `cart_items` table (keyed `user_id` + `product_id`), mutated with direct PostgREST insert/update/delete.

A constructor `effect` watches `auth.currentUser()` (using a `lastUserId` field to detect transitions; `undefined` means session still hydrating — wait):

- **anon → signed-in** (`previous === null && current`): `mergeAnonIntoDb()` sums anon quantities into existing DB rows (upsert with `onConflict: 'user_id,product_id'`), **capping each line at `products.quantity`** and dropping out-of-stock products; then clears `cart:v1`, hydrates from DB, and hydrates the applied coupon.
- **refresh / account switch:** hydrate from DB + coupon.
- **sign-out:** applied coupon reset to null (coupons require auth), hydrate from localStorage.

Stock clamping happens at every boundary: `add()`/`setQuantity()` refuse quantities above `line.stock` (Spanish error: `` `Solo hay ${stock} en stock.` ``); `hydrateFromDb`/`hydrateFromAnon` clamp with `Math.min(row.quantity, products.quantity)`. The DB hydrate inner-joins `products` so rows filtered by products RLS (inactive, qty=0, price=0, deleted) silently drop out; the anon hydrate writes its cleanup back to localStorage. Line `price` is always the effective price `sale_price ?? price`.

`add()` opens the cart drawer (`openDrawer()`); the drawer/page UI is documented in [cart-drawer.md](../screens/storefront/cart-drawer.md) and [cart-page.md](../screens/storefront/cart-page.md).

### Stage 2 — Coupons (apply, mirror, revalidate)

Customers never read the `coupons` table (no public SELECT policy). Everything goes through three SECURITY DEFINER RPCs, whose final definitions are in `20260524000300_coupon_rpcs_category_scoped.sql`:

- **`validate_coupon(p_code text, p_subtotal numeric)`** — requires auth (`AUTH_REQUIRED`), checks existence (`NOT_FOUND`), `is_active` (`INACTIVE`), `expires_at` (`EXPIRED`), per-user `coupon_redemptions` count vs `max_uses_per_user` (`LIMIT_REACHED`), then computes the **eligible subtotal from the caller's DB `cart_items`** (not from `p_subtotal`, which is advisory-only for signature stability), scoped to `coupons.category_ids` when non-empty and priced at `coalesce(sale_price, price)`. Errors: `NO_ELIGIBLE_ITEMS` (targeted coupon, nothing in scope), `BELOW_MINIMUM` (returns `gap`, the colones missing). Success returns `coupon_id`, `type`, `discount_value`, `min_purchase_amount`, `category_ids`, `expires_at`.
- **`calculate_coupon_discount(p_coupon_id uuid, p_subtotal numeric)`** — server-side discount formula over the eligible subtotal; `PERCENTAGE` = `round(eligible * discount_value / 100, 2)`, `FIXED_ON_THRESHOLD` = `discount_value` only when `eligible >= min_purchase_amount`; capped at the eligible amount.
- **`get_my_applied_coupon()`** — reads `carts.coupon_id` for the caller and returns the coupon fields only if still valid (not deleted/inactive/expired); used to hydrate on sign-in/refresh.

`CartService.applyCoupon(code)` uppercases/trims the code, calls `validate_coupon`, then persists the choice by **upserting the user's `carts` row** (`{user_id, coupon_id}`, `onConflict: 'user_id'`). `removeCoupon()` nulls `carts.coupon_id`. `carts` is a one-row-per-user companion table (PK `user_id`, RLS `carts_self_all`).

The client **mirrors** the SQL discount formula (`computeDiscountClientSide`, bottom of `cart.service.ts`) so the summary updates without an RPC round-trip; the `lineCoupon` computed decomposes a `PERCENTAGE` discount per line with a largest-remainder cents fix-up, and merely highlights eligible lines for `FIXED_ON_THRESHOLD`. The server stays authoritative at apply time and again inside `place_order`.

After every cart mutation, `revalidateAppliedCoupon()` re-runs `validate_coupon`; if it no longer passes, the coupon is dropped and `couponDroppedTick` is bumped (`{error, gap?, at}`) so the UI can flash a snackbar. Error-code → Spanish copy mapping lives in `src/app/core/catalog/coupon-errors.ts`.

Coupon type set: `PERCENTAGE` (≤100, enforced by `coupons_percentage_value_capped`) and `FIXED_ON_THRESHOLD` (requires `min_purchase_amount`, `coupons_fixed_requires_minimum`). Codes are `unique`, uppercase, length ≥ 3.

### Stage 3 — Checkout

`/checkout` (see [checkout.md](../screens/storefront/checkout.md)) loads `ShippingMethodsService.listActive()` (active, non-deleted, ordered by `sort_order, name` — RLS `shipping_methods_public_read` also enforces this for customers) and filters client-side into `visibleShippingMethods`: a method is offered when its `allowed_category_ids` (uuid[], default `'{}'`) is empty, or **every distinct cart category** appears in the list. `selectedMethodRequiresAddress` defaults to `true` when unknown (fail-safe); when the chosen method has `requires_address = false` (pickup-style, e.g. "Retiro Show Room") the address fields are hidden.

Submit builds a `PlaceOrderInput`:

```ts
{
  items: {product_id, quantity}[],
  buyer: { email, name, phone, address: ShippingAddress | null },
  shipping_method_id: string,
  payment_method: 'sinpe_or_transfer' | 'payment_link',
  coupon_code?: string,        // from cart.appliedCoupon()?.code
  customer_notes?: string,
}
```

and calls `OrdersService.placeOrder()` → RPC `place_order(p_input jsonb)`. On success it clears the cart and navigates to `/checkout/confirmation/:id?email=...`.

### Stage 4 — `place_order` v10 (the transaction)

Final definition: `supabase/migrations/20260704100200_place_order_v10_seller_snapshot.sql`. SECURITY DEFINER, callable by anon (guest checkout) and authenticated. Steps in order:

1. **Buyer validation** — email (lowercased/trimmed; `EMAIL_REQUIRED`), name + phone (`BUYER_INFO_REQUIRED`), non-empty `items` (`EMPTY_CART`), `payment_method` in `('sinpe_or_transfer','payment_link')` (`INVALID_PAYMENT`).
2. **Shipping** — resolves the method (`is_active`, not deleted) with `FOR SHARE` (`INVALID_SHIPPING`); if `allowed_category_ids` is non-empty, every distinct cart category must be contained in it (`v_cart_cats <@ v_shipping.allowed_category_ids`, else `SHIPPING_NOT_ALLOWED_FOR_CART`); if `requires_address`, `address.line1/city/province` must be non-blank (`ADDRESS_REQUIRED`), otherwise the address is **nulled** server-side.
3. **Coupon lock** — if `coupon_code` given, loads the coupon (active, not deleted, not expired) **`FOR UPDATE`**, which serializes redemption counting across concurrent checkouts (`COUPON_INVALID`).
4. **Product locking + pricing loop** — iterates items **ordered by ascending `product_id`** (the v7 deadlock fix: a fixed global lock order prevents lock cycles between overlapping carts), locking each product `FOR UPDATE`. Checks: exists (`PRODUCT_GONE`), `active` and `price > 0` (`PRODUCT_UNAVAILABLE` + `product_id`), `quantity >= qty` (`INSUFFICIENT_STOCK` + `product_id` + `available`). Unit price = `coalesce(sale_price, price)`; accumulates `v_subtotal` and the coupon-eligible portion `v_eligible`.
5. **Coupon checks + discount** — against the eligible subtotal: `COUPON_NO_ELIGIBLE` (targeted, nothing eligible), `COUPON_BELOW_MINIMUM`, then redemption caps: per `user_id` when authed **and** per `guest_email` (both compared to `max_uses_per_user` → `COUPON_LIMIT`). Discount = same formula as `calculate_coupon_discount`, capped at eligible.
6. **Totals + insert** — `total = subtotal − discount + shipping.price`. Inserts the `orders` row with denormalised snapshots (`shipping_method_name`, `shipping_amount`, `coupon_code`, buyer fields). `order_number` comes from the sequence **`orders_number_seq`** (starts at **7300**, continuing legacy OpenCart numbering).
7. **Item snapshot loop** — for each item inserts an `order_items` row snapshotting `product_slug/name/image_url/condition`, `product_set_name` (joined from `sets`), `product_card_number`, and (v10) the **consignment seller snapshot** `seller_id/seller_code/seller_name` resolved from `products.seller_id → sellers` (house inventory writes NULLs). Then **decrements `products.quantity`**.
8. **Coupon redemption** — inserts a `coupon_redemptions` row (`user_id` when authed, `guest_email` when not, `discount_amount_applied`). No client insert path exists on this table.
9. **Signed-in cleanup** — deletes the user's `cart_items`, nulls `carts.coupon_id`, and backfills empty `profiles` fields (`full_name`, `phone`, `default_shipping_address`) from the buyer form.
10. **Activity log** (v8) — inserts `customer_activity` row with `event_type = 'order_created'` and IP from `public.client_ip()`.
11. Returns `{ok: true, order_id, total}`.

Note: **loyalty earn is NOT in this function** — see Stage 7.

### Stage 5 — Confirmation + payment proof

The confirmation page (see [order-confirmation.md](../screens/storefront/order-confirmation.md)) loads the order via the **`get_guest_order(p_order_id, p_email)`** RPC (anon+authenticated; requires id+email match so a leaked UUID alone is useless). Signed-in customers can also use `OrdersService.getMyOrder()` (direct select, RLS `orders_self_read`).

For `sinpe_or_transfer` orders the customer either uploads a receipt or clicks "ya envié por WhatsApp":

- **Upload** — `OrdersService.uploadPaymentProof()` puts the file at **`{order_id}/proof.{ext}`** in the private **`payment-proofs`** bucket (5 MB limit; MIME allow-list `image/jpeg`, `image/png`, `image/webp`, `application/pdf`). The upload is a **plain insert, deliberately NOT `upsert: true`**: upsert makes Storage issue `INSERT ... ON CONFLICT DO UPDATE`, whose conflict path needs UPDATE/SELECT visibility customers don't have on a private bucket, failing RLS. A 409 (file already exists from a prior half-finished attempt) is treated as success so attach can re-run.
- **Storage RLS** — original inline policy subquery on `orders` was itself gated by orders RLS and failed for guests; `20260629000000_payment_proofs_upload_visibility_fix.sql` replaced it with the SECURITY DEFINER boolean fn **`order_accepts_proof(p_prefix text)`** (order exists, `status='pending'`, `payment_method='sinpe_or_transfer'`), used by both the INSERT policy `payment_proofs_upload_pending_order` and an UPDATE policy `payment_proofs_update_pending_order`. Reads remain admin-only (`payment_proofs_admin_read`).
- **Attach** — RPC **`attach_payment_proof(p_order_id, p_email, p_file_path)`** verifies email match (`NOT_FOUND`), `status='pending'` (`NOT_PENDING`), `payment_method='sinpe_or_transfer'` (`WRONG_PAYMENT_METHOD`), then writes `orders.payment_proof_url`. The WhatsApp path writes the sentinel **`'__whatsapp__'`** (`WHATSAPP_PROOF_SENTINEL` exported from `orders.service.ts`).
- **Admin side** — `adminAttachPaymentProof()` is a direct UPDATE (via `orders_admin_all`, no status check — admins receive proofs out-of-band); `getPaymentProofSignedUrl()` returns a signed URL (default 3600 s), null for the sentinel.

### Stage 6 — Statuses & admin transitions

`orders.status` CHECK: `'pending' | 'paid' | 'shipped' | 'completed' | 'cancelled'` (default `'pending'`). Forward transitions (pending → paid → shipped → completed) are plain `UPDATE`s through `OrdersService.updateOrderStatus()` — the RLS policy `orders_admin_all` lets admins through and no RPC is needed. That method **throws** if asked to set `'cancelled'` (message: `'Usa cancelOrder() para cancelar — restaura stock.'`). Admin list/detail screens: [orders.md](../screens/admin/orders.md), [order-detail.md](../screens/admin/order-detail.md).

**`cancel_order(p_order_id uuid, p_notes text default null)`** (final body in `20260523000100_cancel_order_releases_coupon.sql`) — admin-only (`NOT_ADMIN`), locks the order `FOR UPDATE`, refuses terminal states (`ALREADY_TERMINAL` for cancelled/completed), **restocks** every line whose `product_id` FK survived (`quantity = quantity + item.quantity`), **deletes the `coupon_redemptions` row** so the customer's `max_uses_per_user` counter frees up, and sets `status='cancelled'` + `cancellation_notes` (trimmed, empty → NULL). Restocking interacts with `tg_products_track_restock` (`20260526000000_products_restock_respect_caller.sql`): a 0 → >0 quantity UPDATE bumps `last_restocked_at = now()`.

### Stage 7 — Loyalty earn (side effect, not in the RPC)

`20260528000000_loyalty_points.sql` installs the AFTER UPDATE OF `status` trigger **`orders_loyalty_points`** → `award_or_reverse_loyalty_points()`. On the first transition into `'paid'`, if `app_settings.loyalty_enabled` and the order has a `user_id` (guests skipped), it awards `floor((subtotal − discount_amount) / loyalty_colones_per_point)` points as an `'earn'` row (description `'Compra #<order_number>'`). On the first transition into `'cancelled'` it writes a `'reversal'` row clawing back exactly what was earned — independent of the enabled flag and of current balance (can go negative). Full loyalty system: [loyalty-and-pokedex.md](./loyalty-and-pokedex.md).

### Stage 8 — Emails

`OrdersService.placeOrder()` fire-and-forgets the **`send-order-email`** Edge Function (`supabase.client.functions.invoke('send-order-email', { body: { order_id, email } })`) — a failure never blocks checkout. The function (`supabase/functions/send-order-email/index.ts`, `verify_jwt = false` in `supabase/config.toml` because anon checkout must invoke it; the order_id+email match is the spam guard):

1. Loads the order + items with the service role; rejects on email mismatch (`EMAIL_MISMATCH`, 403).
2. Reads `app_settings` keys: `sinpe_phone`, `whatsapp_number`, `bank_account_info`, `order_notification_recipients` (comma-separated admin list added by `20260509000500_app_settings_order_emails.sql`; garbage entries dropped by `parseRecipients`; empty string = customer email only).
3. Sends via **Resend** (`https://api.resend.com/emails`): a customer confirmation (subject `` `Tu pedido #<n> en Poke-Singles` ``, SINPE/transfer instructions with a pre-filled `wa.me` link — copy: "Hola, envío comprobante del pedido #N (₡total).") and one admin notification (subject `` `Nuevo pedido #<n> — ₡total — <name>` ``, reply-to the customer, deep link `/admin/orders/{id}`).
4. Function env vars (Supabase dashboard): `RESEND_API_KEY`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`, `STORE_PUBLIC_URL` (+ auto-injected `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).

## Contracts & conventions

- **All order mutations by customers go through RPCs** — no INSERT policy on `orders`/`order_items`/`coupon_redemptions`; forward status flips are the only direct admin UPDATEs.
- **Error idiom:** RPCs return in-band `jsonb {ok:false, error:'CODE'}` for business failures; the Angular services map thrown transport errors to `{ok:false, error:'RPC_ERROR'}`. UI maps codes to Spanish copy.
- **Snapshot-first orders:** everything the invoice needs (`shipping_method_name`, `product_name`, `seller_code`, `coupon_code`, prices) is denormalised onto `orders`/`order_items` at insert so history survives edits/deletes.
- **Effective price** is always `coalesce(sale_price, price)` — cart lines, coupon eligibility, and `place_order` all agree.
- **Display `order_number`, key by `id`** — the human sequence (from 7300) is for humans; UUIDs drive FKs, URLs, RPC params.
- **Lock order:** shipping `FOR SHARE`, coupon `FOR UPDATE`, products `FOR UPDATE` in ascending `product_id`.
- **Client mirrors, server decides:** the cart's discount math is a rendering convenience; `validate_coupon` (apply/revalidate) and `place_order` (final) are authoritative.
- localStorage key: **`cart:v1`**. WhatsApp proof sentinel: **`__whatsapp__`**.

## Gotchas / invariants

- `validate_coupon`'s `p_subtotal` parameter is **ignored** (kept for signature stability); the eligible amount always comes from the caller's DB `cart_items`. The cart still passes `this.subtotal()` — harmless but misleading if you read only the call site.
- `place_order` checks the **guest_email redemption count unconditionally** (even for signed-in users), so a user who redeemed as a guest with the same email is still capped.
- Loyalty earn fires on the **pending → paid UPDATE**, not at checkout; an order marked paid then un-paid then paid again does **not** double-award (guarded by an existing-`earn`-row check), and cancellation reverses at most once.
- Payment-proof upload MUST stay a plain insert (no `upsert:true`) — the 20260629 migration added an UPDATE storage policy, but the Supabase Storage upsert conflict path also needs SELECT visibility customers lack; the current code treats a 409 re-insert as success instead.
- `cancel_order` restocks and releases the coupon but does **not** delete the proof file from Storage, and the `payment_proofs_*` policies only accept proofs while the order is `'pending'` — once marked paid, only the admin path can attach.
- `OrderStatusCounts.all` includes `'shipped'` orders even though the admin tabs have no dedicated shipped tab (`countByStatus()` in `orders.service.ts`).
- `get_guest_order` is only guarded by order UUID + email — treat confirmation URLs (`/checkout/confirmation/:id?email=`) as capability URLs.
- The empty allow-list convention differs between features: `shipping_methods.allowed_category_ids` is `NOT NULL DEFAULT '{}'` (empty = all), while `coupons.category_ids` is nullable (NULL **or** empty = all). Both code paths handle both, but don't copy one convention onto the other.
- `orders.shipping_method_id`/`coupon_id` are `ON DELETE SET NULL`; always render the snapshotted `shipping_method_name` / `coupon_code` text.
- Cart merge on login is best-effort (failures log to console and continue) — a failed merge silently loses anon lines because `cart:v1` is cleared right after.

## Related docs

- [data-model.md](./data-model.md) — full table/RLS reference
- [backend-rpcs-and-functions.md](./backend-rpcs-and-functions.md) — RPC catalogue
- [loyalty-and-pokedex.md](./loyalty-and-pokedex.md) — what happens to points after `paid`
- [auth-and-roles.md](./auth-and-roles.md) — `is_admin()`, guards, guest vs authed
- Screens: [cart-drawer](../screens/storefront/cart-drawer.md), [cart-page](../screens/storefront/cart-page.md), [checkout](../screens/storefront/checkout.md), [order-confirmation](../screens/storefront/order-confirmation.md), [account](../screens/storefront/account.md) (order history), admin [orders](../screens/admin/orders.md), [order-detail](../screens/admin/order-detail.md), [coupons](../screens/admin/coupons.md), [shipping-methods](../screens/admin/shipping-methods.md)
