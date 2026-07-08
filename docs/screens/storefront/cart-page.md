# Cart page

> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose

The full-page cart at `/cart`: every line with quantity steppers, per-line coupon pricing, a list/grid view toggle, a "Vaciar carrito" bulk clear, and a summary card with the coupon field and the checkout CTA. It renders the exact same `CartService` state as the cart drawer — the two are always in sync.

## Route & access

- **Path:** `/cart` (child of the empty-path `UserShell` route in `src/app/app.routes.ts`; lazy `loadComponent` → `CartPage`).
- **Guards:** only the shell-level `maintenanceGuard`; no auth guard — anonymous shoppers see their localStorage cart.
- **No query params or route data.**
- Reached from the cart drawer's "Ver carrito completo" button; the header cart icon deliberately opens the drawer instead (see [cart-drawer](./cart-drawer.md)).

## Files

- `src/app/user/cart-page/cart-page.ts` — `CartPage` component (standalone, selector `app-cart-page`).
- `src/app/user/cart-page/cart-page.html` — breadcrumb, header with view toggle + clear, list view, grid view, summary aside.
- `src/app/user/cart-page/cart-page.scss` — BEM blocks `cart-page__*`.
- `src/app/core/cart/cart.service.ts` — `CartService` (state engine; full detail in [cart-drawer](./cart-drawer.md)).
- `src/app/shared/coupon-field/coupon-field.ts` / `.html` / `.scss` — `CouponField` apply/remove control (default variant here).
- `src/app/core/catalog/coupon-errors.ts` — `mapCouponError(error, gap?)`, the single Spanish copy map for coupon errors.
- `src/app/core/catalog/coupons.service.ts` — `CouponsService` (admin CRUD on `coupons`; **not used by this page** — customer coupon flow goes through `CartService` RPCs; listed because coupon rows originate here).
- `src/app/shared/empty-cart-pokemon/empty-cart-pokemon.*` — empty-state illustration.
- `src/app/core/preview/card-conditions-dialog.service.ts` — condition-pill info dialog.
- `src/app/core/storage/local-storage.service.ts` — persists the view toggle.
- `src/app/core/catalog/catalog.types.ts` — `CartLine`, `LineCoupon`, `AppliedCoupon`, `CouponErrorCode`.

## UI anatomy

1. **Breadcrumb** (`.breadcrumb`) — home icon link to `/` (`aria-label="Inicio"`), separator "›", current "Carrito".
2. **Header** (`.cart-page__header`) — `<h1>` "Tu carrito"; when `itemCount() > 0`:
   - a `mat-button-toggle-group` view switcher (`.cart-page__view-toggle`, `hideSingleSelectionIndicator`, `aria-label="Cambiar vista"`) with `view_list` ("Vista de lista") and `grid_view` ("Vista de cuadrícula") toggles;
   - a "Vaciar carrito" button (`.cart-page__clear`, icon `delete_sweep`).
3. **Loading bar** — indeterminate `mat-progress-bar` while `loading()` (true during `CartService.handleAuthChange` hydration).
4. **Empty state** (`.cart-page__empty`, when `!loading() && items().length === 0`) — `<app-empty-cart-pokemon [size]="60" />`, "Tu carrito está vacío.", flat primary "Explorar cartas" → `/products`.
5. **List view** (`view() === 'list'`; `.cart-page__lines` > `.cart-page__line`): thumbnail link (`--contain` modifier when `!line.card_number`), name link, condition-pill button ("Ver guía de condiciones" tooltip → conditions dialog), set/number meta line (`{{ set_name }} · #{{ card_number }}`), unit price "₡… c/u" (struck `.price--original` + `.price--sale` net `lc.netUnit` when coupon-discounted), "Cupón no aplica" for out-of-scope lines, quantity stepper (aria "Disminuir"/"Aumentar"), "Stock disponible: {{ line.stock }}", line total (struck + `lc.netLineTotal` when discounted), delete button (`aria-label="Eliminar"`). `--eligible` modifier when `lc?.highlight`.
6. **Grid view** (`view() === 'grid'`; `.cart-page__cards` > `.cart-page__card`): card image, name, meta, stepper + delete row, line total (`.cart-page__card-price`, discounted variant), "Cupón no aplica" (`.cart-page__card-na`), "Stock disponible: …" (`.cart-page__card-stock`), floating condition pill (`.cart-page__card-condition`).
7. **Summary aside** (`.cart-page__summary` > `.cart-page__summary-card`):
   - `<h2>` "Resumen"; rows "Artículos" (`itemCount()`) and "Subtotal" (`₡{{ subtotal() }}`).
   - `<app-coupon-field />` (default variant).
   - Applied-coupon row (`.cart-page__summary-row--discount`): label is "`{{ coupon.code }} ({{ coupon.discount_value }}%)`" for `PERCENTAGE` coupons, otherwise "Descuento"; amount `−₡{{ discount() }}` in `.price--sale`.
   - Total row (`--total`): "Total" `₡{{ total() }}`.
   - Flat primary CTA "Continuar al checkout" (`.cart-page__checkout` → `onCheckout()` → `/checkout`).
   - Note (`.cart-page__note`): "El envío se calcula al confirmar la compra."

**Coupon field internals** (`CouponField`, shared with drawer and checkout):

- When a coupon is applied: a chip (`.coupon-field__applied`) showing `{{ coupon.code }}` (+ `({{ discount_value }}%)` for percentage coupons) in `.brand-mono`, with a × icon button (`aria-label="Quitar cupón"`) → `CartService.removeCoupon()`.
- Otherwise: a reactive form (`FormGroup` with single `code` control, `Validators.required` + `minLength(3)`), outlined `mat-form-field` labeled "Código de cupón", submit button "Aplicar" (label flips to "Aplicando…" while `applying()`), disabled when `!isSignedIn() || applying()`.
- Hint for anon users: "Inicia sesión para usar un cupón." Errors render as `<mat-error>`; after a server-side failure the control gets `setErrors({ server: true })` + `markAsTouched()` so Material actually shows the error (the value itself is valid).
- On success: `form.reset()` + snackbar "Cupón aplicado" (duration 2500).

## Services & backend

- `CartService.setQuantity / remove / clear` — `cart_items` table (signed-in) or localStorage `cart:v1` (anon). Every mutation triggers `revalidateAppliedCoupon()`.
- `CartService.applyCoupon(code)` — trims + uppercases the code, calls RPC **`validate_coupon(p_code, p_subtotal)`**, then upserts `{ user_id, coupon_id, updated_at }` onto **`carts`** (`onConflict: 'user_id'`). Returns `{ error?: CouponErrorCode, gap? }`.
- `CartService.hydrateAppliedCoupon()` — RPC **`get_my_applied_coupon()`** on sign-in/refresh; the RPC returns `null` for expired/inactive/deleted coupons.
- `CartService.removeCoupon()` — clears the signal and sets `carts.coupon_id = null`.
- **`calculate_coupon_discount(p_coupon_id, p_subtotal)`** — SQL function mirrored client-side by `computeDiscountClientSide()` in `cart.service.ts`; the page never calls the RPC directly. Both compute: `PERCENTAGE` → `round2(eligible * discount_value / 100)`; `FIXED_ON_THRESHOLD` → `discount_value` only when `eligible >= min_purchase_amount`; both capped at the eligible subtotal.
- RPC behavior (see `supabase/migrations/20260524000300_coupon_rpcs_category_scoped.sql`): `validate_coupon` requires auth (`AUTH_REQUIRED` otherwise), checks `deleted_at is null` (`NOT_FOUND`), `is_active` (`INACTIVE`), `expires_at > now()` (`EXPIRED`), per-user redemption count vs `max_uses_per_user` (`LIMIT_REACHED`), then computes the **eligible subtotal from the caller's DB `cart_items`** (priced at `coalesce(sale_price, price)`, restricted to `category_ids` when the coupon is targeted) and returns `NO_ELIGIBLE_ITEMS` or `BELOW_MINIMUM` (with `gap = min_purchase_amount − eligible`) as appropriate. The `p_subtotal` argument is advisory-only, kept for signature stability.

**Error copy** (`mapCouponError` in `src/app/core/catalog/coupon-errors.ts`), quoted verbatim:

| Code | Copy |
|---|---|
| `AUTH_REQUIRED` | "Inicia sesión para usar un cupón." |
| `NOT_FOUND` | "Código de cupón inválido." |
| `INACTIVE` | "Este cupón ya no está disponible." |
| `EXPIRED` | "Este cupón ha expirado." |
| `LIMIT_REACHED` | "Ya usaste este cupón." |
| `BELOW_MINIMUM` | "Agrega ₡{gap} más a tu carrito para usar este cupón." (gap formatted `toLocaleString('es-CR', { maximumFractionDigits: 0 })`) |
| `NO_ELIGIBLE_ITEMS` | "Este cupón no aplica a los productos de tu carrito." |

## State & data flow

- From `CartService`: `items`, `subtotal`, `itemCount`, `loading`, `appliedCoupon`, `discount`, `total`, `lineCoupon` (via `linePricing(line)` helper), `couponDroppedTick`.
- Local: `view = signal<CartView>('list' | 'grid')`, initialized from localStorage key **`cart:view`** (`VIEW_STORAGE_KEY`; anything other than `'grid'` reads as `'list'`) and persisted by a constructor `effect` on every change.
- A second constructor `effect` watches `couponDroppedTick` and opens a snackbar: "`El cupón ya no aplica: ${mapCouponError(tick.error, tick.gap)}`" (action "OK", duration 5000). This fires whenever a cart mutation caused `revalidateAppliedCoupon()` to drop the coupon (e.g. removing an item pushed the subtotal below the minimum).
- Quantity mutations mirror the drawer: `onIncrement` (silent no-op at stock cap), `onDecrement` (button disabled at 1), `onRemove`; service errors ("Solo hay N en stock.", "Esa carta no está en tu carrito.") surface via snackbar (duration 4000).
- `onClear()` gates on native `confirm('¿Vaciar el carrito?')` then `cart.clear()` — which also always drops any applied coupon.
- No reload triggers of its own; content reacts to `CartService` signals, which re-hydrate on auth changes.

## Behaviors & edge cases

- **Anon vs signed-in:** identical line UI; the coupon field is the only difference (disabled Apply + "Inicia sesión para usar un cupón." hint for anon). Signing in from here merges the anon cart into `cart_items` and re-hydrates (see [cart-drawer](./cart-drawer.md)).
- **Loading:** progress bar only; lines render as soon as hydration completes. The empty state is suppressed while `loading()` so it doesn't flash before hydration.
- **Coupon auto-drop UX:** this is the only surface that snackbars `couponDroppedTick`; the drawer and checkout stay silent, relying on the summary rows disappearing.
- **Per-line coupon math:** `PERCENTAGE` discounts are distributed per-line by `CartService.lineCoupon` with a largest-remainder rounding fix-up so line discounts sum exactly to the summary `discount()`. `FIXED_ON_THRESHOLD` lines only get the `--eligible` highlight; the discount stays a single summary row.
- **View toggle persists** across sessions via `cart:view`; the grid view shows the same data re-laid-out as cards.
- Coupon codes are normalized `trim().toUpperCase()` before the RPC — user input case never matters.

## Gotchas / invariants

- **`CouponsService` is admin-only.** Despite the name, the customer-facing apply/remove path lives entirely in `CartService` (`validate_coupon` / `get_my_applied_coupon` RPCs + `carts` writes). Don't wire `CouponsService.list()` into a storefront surface — it reads the raw `coupons` table.
- **`onClear()` calls the global `confirm()` directly** with no `isPlatformBrowser` guard — a (currently harmless, app is CSR-only) deviation from the "never touch window/document directly" convention in CLAUDE.md.
- **The `discount()` shown is a client-side mirror** of `calculate_coupon_discount`. If the SQL formula changes, `computeDiscountClientSide()` in `cart.service.ts` must change in lockstep or the summary will drift from what `place_order` charges.
- **The applied coupon persists on `carts.coupon_id`** across sessions; it silently disappears (RPC returns null) when it expires or is deactivated — no "your coupon expired" message on reload, only on mutation-triggered revalidation.
- **`error()` in `CouponField` is cleared only on the next Apply attempt**, but the control's `{ server: true }` error clears on the next keystroke (validators re-run) — so the red state and the message can momentarily disagree; harmless but don't "fix" one without the other.
- The snackbar wiring inside an `effect` relies on `couponDroppedTick` being a new object reference each bump (`at: Date.now()`); keep that shape.
- Prices/stock per line are hydrate-time snapshots (see [cart-drawer](./cart-drawer.md) gotchas).

## Related docs

- [Cart drawer](./cart-drawer.md) — same state, overlay form; full `CartService` internals.
- [Checkout](./checkout.md) — the CTA target; server-side coupon enforcement at order time.
- [Detail](./detail.md) / [Card list](./card-list.md) — the add-to-cart surfaces feeding this page.
- [Backend RPCs](../../architecture/backend-rpcs-and-functions.md) — `validate_coupon`, `get_my_applied_coupon`, `calculate_coupon_discount`.
- [Data model](../../architecture/data-model.md) — `coupons`, `coupon_redemptions`, `carts`, `cart_items`.
- [Commerce flow](../../architecture/commerce-flow.md).
