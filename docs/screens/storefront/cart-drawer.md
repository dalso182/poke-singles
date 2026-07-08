# Cart drawer

> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose

The slide-in cart overlay that appears on the right edge of the storefront. It gives shoppers a quick view of their cart lines (quantity steppers, per-line coupon pricing, remove), a compact coupon field, and CTAs to `/checkout` or the full `/cart` page — without leaving the current page. It opens automatically whenever a product is added to the cart.

## Route & access

- **No route of its own.** The drawer is a `position="end"` `mode="over"` `<mat-sidenav>` hosted inside `UserShell` (`src/app/user/user-shell/user-shell.html`), so it is available on every storefront page and never in `/admin`, `/library`, or `/mantenimiento`.
- Open/close state is a signal on `CartService`: `drawerOpen` (private `_drawerOpen`), driven by `openDrawer()` / `closeDrawer()`.
- Ways it opens:
  - Header cart icon — `Header.onCartClick()` calls `cart.openDrawer()` (the icon opens the drawer only; navigating to `/cart` happens via the drawer's "Ver carrito completo" button).
  - Automatically at the end of `CartService.add()` when a *new line* is inserted or an existing line's quantity is bumped through `add()`.
- Ways it closes: the header × button, clicking a product link inside it, either footer CTA, or Material's own backdrop-tap/Esc (the sidenav's `(closedStart)` emits → `UserShell.onCartDrawerClosed()` → `cart.closeDrawer()` so the signal stays in sync).
- Available to anonymous and signed-in users alike.

## Files

- `src/app/user/cart-drawer/cart-drawer.ts` — `CartDrawer` component (standalone, selector `app-cart-drawer`); thin view over `CartService`.
- `src/app/user/cart-drawer/cart-drawer.html` — template: header, empty state, line list, footer with coupon field + totals + CTAs.
- `src/app/user/cart-drawer/cart-drawer.scss` — BEM blocks `cart-drawer__*`; `:host` is a full-height flex column on `var(--surface-card)`.
- `src/app/core/cart/cart.service.ts` — `CartService`, the dual-backend cart engine (documented in depth below).
- `src/app/user/user-shell/user-shell.ts` / `.html` — hosts the drawer sidenav; `cartDrawerOpen = this.cart.drawerOpen`.
- `src/app/shared/coupon-field/coupon-field.ts` / `.html` / `.scss` — `CouponField` rendered with `variant="compact"`.
- `src/app/shared/empty-cart-pokemon/empty-cart-pokemon.*` — `EmptyCartPokemon` illustration used in the empty state.
- `src/app/core/preview/card-conditions-dialog.service.ts` — `CardConditionsDialogService.open()` for the condition-pill info dialog.
- `src/app/core/storage/local-storage.service.ts` — `LocalStorageService`, the SSR-guarded `localStorage` wrapper the cart persists through.
- `src/app/core/catalog/catalog.types.ts` — `CartLine`, `AnonCartItem`, `AppliedCoupon`, `LineCoupon`, `ValidateCouponResult`, `CouponErrorCode`.

## UI anatomy

Top to bottom:

1. **Header** (`.cart-drawer__header`) — `<h2>` "Carrito ({{ itemCount() }})" and a close icon button (`aria-label="Cerrar"`).
2. **Empty state** (`.cart-drawer__empty`, when `items().length === 0`) — `<app-empty-cart-pokemon [size]="50" />`, "Tu carrito está vacío", and a stroked button "Explorar cartas" linking to `/products` (closes the drawer on click).
3. **Line list** (`.cart-drawer__lines` > `.cart-drawer__line`, tracked by `line.product_id`). Each line:
   - Thumbnail link to `['/products', line.slug]` (`.cart-drawer__thumb`, modifier `--contain` when `!line.card_number`, i.e. non-card products render `object-fit: contain`).
   - Name link (`.cart-drawer__name`) + condition pill button (classes from `conditionClass()`: `condition-pill condition-pill--nm|--lp|--mp|--hp` + `condition-pill--btn`; `HP` and `DMG` share `--hp`). Tooltip/aria "Ver guía de condiciones"; click opens the conditions dialog via `openConditionsInfo()`.
   - Set name (`.cart-drawer__set`) when present.
   - Footer row: quantity stepper (− disabled at `quantity <= 1`, + disabled at `quantity >= line.stock`; aria labels "Disminuir" / "Aumentar"), line price (`.cart-drawer__line-price`; when the line is coupon-discounted it shows `.price--original` struck price and `.price--sale` net `lc.netLineTotal`), and a delete icon button (`aria-label="Eliminar"`).
   - Conditional hints: "Cupón no aplica" (`.cart-drawer__coupon-na`, when a category-scoped coupon skips this line) and "Stock disponible: {{ line.stock }}" (`.cart-drawer__stock-hint`, when quantity has hit stock).
   - `.cart-drawer__line--eligible` modifier when `lc?.highlight` (FIXED_ON_THRESHOLD coupon highlighting eligible lines).
4. **Footer** (`.cart-drawer__footer`):
   - `<app-coupon-field variant="compact" />` — apply/remove coupon (see [cart-page](./cart-page.md) for the field's full behavior).
   - Applied-coupon row (`.cart-drawer__applied-coupon`): "Descuento" and `−₡{{ discount() }}` in `.price--sale`.
   - Totals row (`.cart-drawer__subtotal`): label is "Total" when a coupon is applied, otherwise "Subtotal"; value is `total()` or `subtotal()` accordingly, formatted `₡… | number:'1.0-0'`.
   - Two full-width CTAs (`.cart-drawer__cta`): flat primary "Continuar al checkout" (`onCheckout()` → close + navigate `/checkout`) and stroked "Ver carrito completo" (`goToCart()` → close + navigate `/cart`).

## Services & backend

The component itself talks only to `CartService` (plus `MatSnackBar`, `Router`, `CardConditionsDialogService`). Everything backend-facing lives in `CartService`:

| Concern | Backend |
|---|---|
| Signed-in cart lines | `cart_items` table (insert / update / delete keyed by `user_id, product_id`) |
| Line hydration (signed-in) | `cart_items` select with `products!inner(… , sets(name))` embed — RLS on `products` silently drops inactive/deleted/qty-0/price-0 items |
| Line hydration (anon) | `products` select `.in('id', ids)` for ids read from localStorage |
| Single-product fetch on `add()` | `products` select `.eq('id', productId).maybeSingle()` |
| Coupon apply | RPC `validate_coupon(p_code, p_subtotal)` then upsert onto `carts` (`onConflict: 'user_id'`, sets `coupon_id`, `updated_at`) |
| Coupon hydrate on load | RPC `get_my_applied_coupon()` (filters expired/inactive/deleted server-side) |
| Coupon remove | `carts` update `coupon_id = null` |
| Coupon revalidation | RPC `validate_coupon` again after every cart mutation |
| Anon persistence | localStorage key **`cart:v1`** via `LocalStorageService` (JSON array of `AnonCartItem { product_id, quantity, added_at }`) |

`discount()` is computed **client-side** by `computeDiscountClientSide()`, a mirror of the SQL `calculate_coupon_discount` function, so no RPC round-trip happens on every subtotal change; the server stays authoritative at apply time (`validate_coupon`) and order time (`place_order`).

## State & data flow

`CartService` (root-provided) signals/computeds:

- `_items: signal<CartLine[]>` → `items` (readonly). `CartLine` carries `product_id, quantity, added_at, name, slug, image_url, price, stock, condition, card_number, type1, type2, set_name, category_id`. `price` is the **effective** price `sale_price ?? price`, fixed at hydrate time; `stock` is `products.quantity` at hydrate time.
- `loading`, `drawerOpen`, `appliedCoupon: AppliedCoupon | null`, `couponDroppedTick` (bumped `{ error, gap?, at }` whenever revalidation auto-drops the coupon — the cart page flashes a snackbar off it; the drawer does not subscribe to it).
- `itemCount` = sum of quantities; `subtotal` = Σ `price * quantity`; `discount`; `total` = `max(0, subtotal − discount)`.
- `lineCoupon: computed<Map<string, LineCoupon>>` — per-line decomposition keyed by `product_id`. For `PERCENTAGE` coupons the already-rounded `discount()` is distributed across in-scope lines proportionally by value with a **largest-remainder** fix-up so per-line cents sum exactly to the summary discount. For `FIXED_ON_THRESHOLD` coupons only `highlight` is set (no per-line price change). `LineCoupon` fields: `inScope, discounted, highlight, lineDiscount, netLineTotal, netUnit`.
- `eligibleSubtotal(coupon)` — whole subtotal when `category_ids` is null/empty, otherwise only lines whose `category_id` is in the allow-list.

**Anon vs signed-in storage & merge-on-login.** A constructor `effect` watches `auth.currentUser()` (skipping `undefined` while the session hydrates) and compares against `lastUserId`:

- **anon → signed-in** (`previous === null`, `current` set): `readAnon()` → `mergeAnonIntoDb(anon, userId)` — reads the DB cart, looks up current stock for the anon products, and upserts `min(dbQty + anonQty, stock)` per product onto `cart_items` (`onConflict: 'user_id,product_id'`); products with no stock or gone are skipped; failures log and continue (best-effort). Then localStorage `cart:v1` is cleared, the cart re-hydrates from the DB, and the saved coupon hydrates via `get_my_applied_coupon`.
- **refresh / account switch** (`current` set, `previous` not `null`): hydrate from DB + hydrate coupon.
- **signed-out / never signed in** (`current === null`): `appliedCoupon` reset to `null` (coupons require auth) and hydrate from localStorage. `hydrateFromAnon()` drops lines whose product is gone or RLS-filtered, clamps `quantity` to current stock (`Math.min(it.quantity, p.quantity)`), sorts newest-first by `added_at`, and **writes the cleaned list back** to `cart:v1`.

**Quantity/stock clamping.** `add()` rejects `delta > stock` on new lines and delegates to `setQuantity()` for existing lines; `setQuantity()` rejects `qty > line.stock` with the error string `` `Solo hay ${line.stock} en stock.` `` and removes the line when `qty <= 0`. DB hydration also clamps display quantity with `Math.min(row.quantity, row.products.quantity)` (the DB row itself is not rewritten). `add()` returns `{ error: 'Producto no disponible.' }` when the product fetch fails.

Component state: none beyond the exposed service signals — the drawer is stateless; quantity errors surface via `MatSnackBar` (`duration: 4000`, action "OK").

## Behaviors & edge cases

- **Auto-open on add:** every successful `CartService.add()` (from any surface — product card, detail page, etc.) calls `openDrawer()`, so the drawer pops open as add-to-cart feedback.
- **Every cart mutation revalidates the coupon** (`add`, `setQuantity`, `remove` fire `revalidateAppliedCoupon()`, fire-and-forget). If `validate_coupon` now fails, the coupon is removed and `couponDroppedTick` bumps. The drawer itself shows no snackbar for this — only the `/cart` page effect does.
- **`clear()`** (not reachable from the drawer UI; the cart page has "Vaciar carrito") always drops the applied coupon.
- **Anon shoppers** can fill the cart but the coupon field shows the hint "Inicia sesión para usar un cupón." and Apply is disabled (see coupon-field).
- **Increment at stock cap** is a silent no-op (`onIncrement` early-returns); the "Stock disponible: N" hint plus disabled + button communicate the cap.
- **Decrement floor:** the − button is disabled at quantity 1; removing the last unit requires the delete button.
- Empty ↔ filled states switch instantly off `items().length`; there is no loading state in the drawer (that lives on `/cart`).

## Gotchas / invariants

- **`cart:v1` is the only anon-cart localStorage key.** It stores a JSON array of `AnonCartItem`; corrupt/non-array JSON parses to `[]`. Writing an empty array removes the key (`storage.set(key, null)`).
- **`CartService.lastUserId` doubles as the auth check** in `add`/`setQuantity`/`remove`/`clear`/`applyCoupon` (`if (userId)`). Before the auth effect's first run it is `undefined`, which is falsy — a mutation racing initial session hydration would write to localStorage even for a user who is about to be recognized as signed-in. In practice hydration wins, but be aware if you add early cart mutations.
- **Anon merge caps summed quantity at stock but the DB write path doesn't re-check stock later** — the display clamp in `hydrateFromDb` (`Math.min`) can show a smaller quantity than the `cart_items` row actually stores. `place_order` re-validates stock server-side, so this can surface as `INSUFFICIENT_STOCK` at checkout.
- **`applyCoupon` passes `p_subtotal: this.subtotal()` but the RPC ignores it** — since the category-scoped rewrite (`20260524000300_coupon_rpcs_category_scoped.sql`), `validate_coupon` derives the eligible subtotal from the caller's DB `cart_items`. The parameter exists only for signature stability. Consequence: coupons genuinely require a signed-in DB cart.
- **Line `price` and `stock` are snapshots from hydrate/add time.** They refresh only on auth change / reload, not live; a price change while the drawer is open won't be reflected until the next hydrate.
- **The drawer sums line totals with the effective price** already baked in — sale prices are invisible as "sales" here (no strike-through except from coupons).
- **Brand-red rule:** no brand red in this surface. `.price--sale` on discounted amounts is **amber** (`--accent-amber`) — sale prices moved off brand red (see the `cart-drawer.scss` ~line 226 comment and [Theming](../../architecture/theming.md)). CLAUDE.md still lists `.price--sale` as a brand-red use — stale.
- The sidenav close path must go through `onCartDrawerClosed()` → `cart.closeDrawer()`; if you add another host for `app-cart-drawer`, wire `(closedStart)` the same way or the signal desyncs from Material's internal state.
- Supabase table access is via `(this.supabase.client as any)` casts throughout `CartService` (generated types not wired here).

## Related docs

- [Cart page](./cart-page.md) — the full `/cart` route sharing the same `CartService` state.
- [Checkout](./checkout.md) — where "Continuar al checkout" leads.
- [Shell, header & footer](./shell-header-footer.md) — the header cart icon + `UserShell` sidenav hosting.
- [Login dialog](./login-dialog.md) — signing in triggers the anon→DB merge.
- [Data model](../../architecture/data-model.md) — `cart_items`, `carts`, `products` RLS.
- [Backend RPCs](../../architecture/backend-rpcs-and-functions.md) — `validate_coupon`, `get_my_applied_coupon`.
- [Commerce flow](../../architecture/commerce-flow.md) — end-to-end cart → order path.
