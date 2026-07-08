# Checkout

> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose

The single-page checkout at `/checkout`: buyer contact form, shipping-method radio cards (category-scoped, with optional address), payment-method choice (SINPE Móvil / transferencia vs. payment link), notes, and an order summary with the coupon field. Submitting calls the `place_order` RPC (v10) and redirects to `/checkout/confirmation/:id`. Guest checkout is supported — no auth guard.

## Route & access

- **Path:** `/checkout` (child of the empty-path `UserShell` route in `src/app/app.routes.ts`; lazy `loadComponent` → `Checkout`). Guarded only by the shell-level `maintenanceGuard`.
- **On success navigates to** `/checkout/confirmation/{order_id}?email={buyer email}` — the `email` query param is what lets guests (and the fallback path for signed-in users) look the order up.
- Reached from the cart drawer ("Continuar al checkout") and the cart page CTA.
- Note: CLAUDE.md still lists checkout as "out of scope right now" — it is fully implemented; the code is authoritative.

## Files

- `src/app/user/checkout/checkout.ts` — `Checkout` component (standalone, selector implied `app-checkout`, `OnInit`).
- `src/app/user/checkout/checkout.html` — form layout (`co-*` / `checkout__*` CSS blocks) + summary aside.
- `src/app/user/checkout/checkout.scss` — styles.
- `src/app/core/orders/orders.service.ts` — `OrdersService.placeOrder()` (+ proof upload/attach used on the confirmation page). **Has uncommitted local changes** — only `getMyOrders()` changed (now paged: `opts {limit, offset, from, to}` returning `{ rows, total }` instead of `OrderRow[]`); `placeOrder` is untouched by the diff.
- `src/app/core/catalog/shipping-methods.service.ts` — `ShippingMethodsService.listActive()`.
- `src/app/core/cart/cart.service.ts` — cart lines, subtotal, applied coupon, `clear()` after success.
- `src/app/shared/coupon-field/*` — `CouponField` in the summary.
- `src/app/core/auth/auth.service.ts` — `auth.ready` promise + `currentUser()` for prefill.
- `src/app/core/auth/profiles.service.ts` — `ProfilesService.getMine()` for name/phone/address prefill.
- `src/app/shared/validators/phone.validator.ts` / `name.validator.ts` — shared `phoneValidator()` (exactly 8 digits) and `nameValidator()` — **not used by checkout** (see Gotchas); currently only `src/app/user/account/account.ts` uses them.
- `src/app/core/catalog/catalog.types.ts` — `PlaceOrderInput`, `PlaceOrderResult`, `ShippingMethodRow`, `ShippingAddress`, `PaymentMethod`, `ProfileRow`.
- `supabase/migrations/20260704100200_place_order_v10_seller_snapshot.sql` — current `place_order` definition (v10).
- `supabase/functions/send-order-email` — edge function invoked fire-and-forget after a successful order.

## UI anatomy

1. **Header** — `<h1>` "Finalizar compra".
2. **Loading** — indeterminate `mat-progress-bar` while `loading()` (bootstrap: shipping methods + profile prefill).
3. **Empty state** (`!loading() && items().length === 0`) — mat-card "Tu carrito está vacío." + stroked "Explorar cartas" → `/products`.
4. **Main form** (`<form [formGroup]="form" (ngSubmit)="onSubmit()">`, `.checkout__layout` with `.checkout__main` + `.checkout__summary`):
   - **"Contacto" panel** (`.co-panel`, eyebrow `.co-eyebrow`): "Correo" (email; hint "Vinculado a tu cuenta" when `emailLocked()`; error "Ingresa un correo válido."), "Nombre completo", "Teléfono" (hint "Para coordinar el SINPE / WhatsApp.").
   - **"Envío" panel:** radio cards (`.co-option`, `--active` modifier tracked via `selectedShippingMethodId()`) from `visibleShippingMethods()` showing `method.name`, optional `method.description`, and price ("Gratis" when 0, else `₡…`). Empty-state copy: "No hay métodos de envío configurados. Contáctanos." (no methods at all) or "No tenemos un método de envío disponible para esta combinación de productos. Escríbenos por WhatsApp para coordinar la entrega." (all filtered out by category scoping).
     - When `selectedMethodRequiresAddress()`: either the read-only saved-address summary ("Enviar a:" + line1/line2, city/province, notes; "Cambiar dirección" button → `addressMode.set('custom')`) or the editable address sub-panel "Dirección de entrega" with fields "Dirección (línea 1)", "Línea 2 (opcional)", "Cantón / ciudad", "Provincia", "Notas para el repartidor (opcional)" and, if a saved address exists, "Usar la dirección guardada" (reverts + `resetAddressFromProfile()`).
   - **"Pago" panel:** two radio cards — "SINPE Móvil / Transferencia bancaria" (desc: "Te mostramos los datos en la siguiente pantalla. Puedes adjuntar el comprobante o enviarlo por WhatsApp.", value `sinpe_or_transfer`) and "Pago por enlace" (desc: "Te contactaremos por teléfono con un enlace de pago.", value `payment_link`).
   - **"Notas" panel:** textarea "Algo que debamos saber" (`customer_notes`).
5. **Summary aside** (`.co-summary-card`): eyebrow "Resumen —", `<h2>` "Tu pedido", "{{ itemCount() }} artículo(s)"; line list (`.co-line`) with thumb + qty badge, name, set/number meta, condition pill, line total and "{{ qty }} × ₡{{ unit }}" when qty > 1; totals rows "Subtotal", coupon row (label "`CODE (n%)`" or "Descuento (CODE)", amount `−₡…` in `.price--sale`), "Envío" (suffix "· {{ method name }}"; "Gratis" when 0); `<app-coupon-field />`; total slab (`.co-slab`) with "Total", meta lines "Pago:" / "Envío:", the submit button `.co-confirm` "Confirmar pedido" (label "Procesando…" while `placing()`; disabled when `form.invalid || placing()`), and legal note "Al confirmar, recibirás las instrucciones de pago en la siguiente pantalla."

## Services & backend

- `ShippingMethodsService.listActive()` — `shipping_methods` table: `deleted_at is null`, `is_active = true`, ordered by `sort_order` then `name`. Row fields used: `id, name, description, price, requires_address, allowed_category_ids`.
- `ProfilesService.getMine()` — `profiles` row for prefill (`full_name`, `phone`, `default_shipping_address`).
- `CartService` — `items`, `itemCount`, `subtotal`, `appliedCoupon`, `discount`; `clear()` after success (also drops the coupon locally; the RPC already cleared the DB cart).
- `OrdersService.placeOrder(input)` — RPC **`place_order(p_input jsonb)`** (SECURITY DEFINER, v10 at `supabase/migrations/20260704100200_place_order_v10_seller_snapshot.sql`). On `{ ok: true, order_id }` it fire-and-forgets the **`send-order-email`** edge function (`body: { order_id, email }`); email failure never blocks checkout. RPC transport errors map to `{ ok: false, error: 'RPC_ERROR' }`.
- **`place_order` v10 behavior** (server is authoritative for everything):
  - Validates buyer: `EMAIL_REQUIRED`, `BUYER_INFO_REQUIRED` (name or phone blank), `EMPTY_CART`, `INVALID_PAYMENT` (must be `sinpe_or_transfer` or `payment_link`), `INVALID_SHIPPING` (bad uuid / not active / deleted).
  - Category scoping (v9): if the method's `allowed_category_ids` is non-empty, **every distinct cart category must be contained in it** (`v_cart_cats <@ allowed_category_ids`) else `SHIPPING_NOT_ALLOWED_FOR_CART`.
  - `requires_address` → `line1`/`city`/`province` must be non-blank (`ADDRESS_REQUIRED`); otherwise the address is nulled server-side.
  - Coupon loaded `FOR UPDATE`; failures: `COUPON_INVALID`, `COUPON_NO_ELIGIBLE`, `COUPON_BELOW_MINIMUM`, `COUPON_LIMIT` (checked per `user_id` **and** per `guest_email` against `max_uses_per_user`).
  - Products locked `FOR UPDATE` in ascending `product_id` order (v7 deadlock fix); per-item errors `INVALID_QTY`, `PRODUCT_GONE`, `PRODUCT_UNAVAILABLE`, `INSUFFICIENT_STOCK` (with `available`). Unit price is `coalesce(sale_price, price)`.
  - Discount computed against the coupon-eligible subtotal, capped at it; `total = subtotal − discount + shipping.price`.
  - Inserts `orders` + `order_items` (snapshotting slug/name/image/condition/set/card number and — new in v10 — `seller_id`/`seller_code`/`seller_name` for consignment cards), decrements `products.quantity`, inserts `coupon_redemptions` (with `guest_email` when anon), and for signed-in users wipes `cart_items`, clears `carts.coupon_id`, and backfills empty `profiles` fields (`full_name`, `phone`, `default_shipping_address`) from the buyer form. Logs an `order_created` row to `customer_activity` with `public.client_ip()`.
  - Returns `{ ok: true, order_id, total }`.

## State & data flow

- Signals: `shippingMethods`, `loading` (starts `true`), `placing`, `selectedShippingMethodId` (mirror of the form control), `selectedPaymentMethod` (default `'sinpe_or_transfer'`), `savedProfile`, `addressMode: 'saved' | 'custom'` (default `'saved'`), `emailLocked`.
- Computeds: `cartCategoryIds` (distinct `category_id`s across cart lines), `visibleShippingMethods` (method offered when `allowed_category_ids` is empty **or every cart category is in it** — client mirror of the RPC's `<@` check), `selectedShippingPrice`, `selectedShippingMethodName`, `selectedPaymentLabel` ("Pago por enlace" / "SINPE Móvil / Transferencia bancaria"), `selectedMethodRequiresAddress` (**defaults to `true` when unknown — fail-safe**), `hasSavedAddress` (profile address with non-blank `line1`), `total = max(0, subtotal − discount + shipping)`.
- **Form** (`fb.nonNullable.group`): `email` (`Validators.required`, `Validators.email`), `name` (`required`), `phone` (`required`, `minLength(8)`), `line1`/`city`/`province` (required conditionally, see below), `line2`, `address_notes`, `shipping_method_id` (`required`), `payment_method` (`required`, default `'sinpe_or_transfer'`), `customer_notes`.
- Constructor wiring:
  - `valueChanges` subscriptions mirror `shipping_method_id` and `payment_method` into their signals (FormControl values aren't reactive).
  - An `effect` keeps the selection valid against `visibleShippingMethods()`: when a cart edit hides the current method it falls back to the first visible one (or `''`), which also seeds the initial default after bootstrap.
  - A second `effect` toggles `Validators.required` on `line1`/`city`/`province`: required only when `selectedMethodRequiresAddress()` **and** the editable form is actually shown (`addressMode() === 'custom' || !hasSavedAddress()`); in saved mode the values came from the profile so validators are dropped (`updateValueAndValidity({ emitEvent: false })`).
- `ngOnInit` → `bootstrap()`: `Promise.all([shippingMethodsService.listActive(), prefillFromProfile()])`; errors snackbar the message; `loading.set(false)` in `finally`.
- `prefillFromProfile()`: awaits `auth.ready` (so a hard refresh doesn't see `currentUser() === undefined`), and for signed-in users sets + **disables** the email control (`emitEvent: false`) and flips `emailLocked` — the order email must be the account email. Then best-effort profile fetch fills name/phone/address. Guests keep an editable email field.
- `onSubmit()`: guards `form.invalid || placing()` (marks all touched) and empty cart ("Tu carrito está vacío."). Uses `form.getRawValue()` so the disabled email still flows through. Address is built only when `selectedMethodRequiresAddress()`, else `null` (so pickup orders store no phantom address). `coupon_code` comes from `appliedCoupon()?.code`. On success: `await cart.clear()` then navigate to `/checkout/confirmation/{order_id}` with `queryParams: { email }`. On RPC failure: snackbar via `mapErrorCode()` (duration 5000); `placing` reset in `finally`.

## Behaviors & edge cases

- **Guest checkout works end-to-end**: no guard, editable email, coupon only if signed in (field disabled otherwise), and the RPC records `guest_email` on the redemption. Guests don't get profile prefill or the saved-address summary.
- **Client error copy** (`mapErrorCode`, quoted verbatim): `EMPTY_CART` "Tu carrito está vacío."; `EMAIL_REQUIRED` "Necesitamos tu correo electrónico."; `BUYER_INFO_REQUIRED` "Completa tu nombre y teléfono."; `ADDRESS_REQUIRED` "Necesitamos tu dirección de envío."; `INVALID_PAYMENT` "Selecciona un método de pago."; `INVALID_SHIPPING` "Selecciona un método de envío válido."; `SHIPPING_NOT_ALLOWED_FOR_CART` "El método de envío elegido no es válido para los productos en tu carrito. Selecciona otro."; `PRODUCT_GONE`/`PRODUCT_UNAVAILABLE` "Una de tus cartas ya no está disponible. Ajusta el carrito."; `INSUFFICIENT_STOCK` "Una de tus cartas se agotó mientras pagabas. Ajusta el carrito."; `COUPON_*` "Tu cupón ya no es válido. Quítalo y vuelve a intentar."; default "No se pudo procesar el pedido. Intenta de nuevo."
- **Race safety:** stock and coupon are re-validated inside the RPC under row locks, so a cart that looked fine can still fail with `INSUFFICIENT_STOCK` or a `COUPON_*` code at submit.
- **Shipping method disappears mid-checkout** (e.g. an item added elsewhere introduces a new category): the constructor effect silently re-selects the first visible method; if none remain, the "No tenemos un método de envío disponible…" copy shows and `shipping_method_id` becomes `''` → form invalid → confirm disabled.
- **SINPE Móvil instructions are NOT on this page** — the payment radio only promises them ("Te mostramos los datos en la siguiente pantalla."); the actual SINPE number, bank info, and proof upload live on the [order-confirmation](./order-confirmation.md) page.
- The summary's per-line prices do **not** show coupon per-line decomposition (unlike drawer/cart page) — the discount is a single summary row here.

## Gotchas / invariants

- **The shared validators are not wired here.** `phone` uses `Validators.minLength(8)` — so `"1234-5678"` (9 chars with a dash) passes checkout while `phoneValidator()` (exactly 8 digits) in `/account` would reject it; `name` has no `nameValidator()`. If you tighten checkout validation, reuse `src/app/shared/validators/`.
- **`OrdersService` has uncommitted working-tree changes** (as of 2026-07-06): `getMyOrders()` gained pagination + date filtering (`{ limit, offset, from, to }` → `{ rows, total }` via `count: 'exact'` + `.range()`). Checkout's `placeOrder` path is unaffected, but any doc/consumer of `getMyOrders` must use the new signature.
- **Email lock invariant:** for signed-in users the email control is disabled — always read the form with `getRawValue()`, never `value`, or the email drops out of the payload.
- **`selectedMethodRequiresAddress()` fails safe to `true`** when no method is selected; don't "optimize" that default or pickup validation could leak into the unknown state.
- **Client-side category filter must mirror the RPC:** `visibleShippingMethods` uses `cartCats.every(c => allowed.includes(c))`; the server uses `v_cart_cats <@ allowed_category_ids`. Keep them equivalent or users will hit `SHIPPING_NOT_ALLOWED_FOR_CART` on submit.
- **`total()` here is client-side**; the RPC recomputes everything and returns its own `total`. Divergence (e.g. a price change mid-checkout) is resolved in the server's favor — the confirmation page displays the order row's stored amounts.
- **Coupon drop mid-checkout is silent** — checkout doesn't subscribe to `couponDroppedTick`; the discount row just disappears.
- CLAUDE.md drift: checkout is listed under "Out of scope right now" but is fully shipped (routes, RPC v10, emails, confirmation).

## Related docs

- [Cart page](./cart-page.md) / [Cart drawer](./cart-drawer.md) — the surfaces feeding this form; coupon apply/remove details.
- [Order confirmation](./order-confirmation.md) — the redirect target with SINPE instructions + proof upload.
- [Account](./account.md) — where saved profile data (prefill source) is edited; uses the shared validators.
- [Backend RPCs](../../architecture/backend-rpcs-and-functions.md) — `place_order` version history.
- [Commerce flow](../../architecture/commerce-flow.md) — cart → order → payment → fulfillment.
- [Data model](../../architecture/data-model.md) — `orders`, `order_items`, `shipping_methods`, `coupon_redemptions`, `profiles`.
