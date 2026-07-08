# Order confirmation

> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose

The post-checkout landing page at `/checkout/confirmation/:id`: confirms the order was received, shows the SINPE Móvil / bank-transfer payment instructions (or the payment-link promise), lets the customer attach the payment proof (upload to Storage or "ya envié por WhatsApp"), and recaps the full order summary with a Poke-Monedas earn preview. Works for both guests (via `?email=`) and signed-in customers.

## Route & access

- **Path:** `/checkout/confirmation/:id` (child of the empty-path `UserShell` route in `src/app/app.routes.ts`; lazy `loadComponent` → `OrderConfirmation`). No guard of its own — only the shell-level `maintenanceGuard`.
- **Inputs via `withComponentInputBinding`:** `id` (required, route param = order UUID) and `email` (optional query param, default `''`).
- **Reached from** checkout success: `Checkout.onSubmit()` navigates to `/checkout/confirmation/{order_id}` with `queryParams: { email: input.buyer.email }` (`src/app/user/checkout/checkout.ts` ~line 337). The `email` param is what lets guests — and the fallback path for signed-in users — look the order up.
- **Access model:** no auth required. The lookup itself is the gate — order UUID + matching email (via the `get_guest_order` RPC), or RLS-scoped ownership for signed-in users. A leaked order id alone shows "No encontramos este pedido."

## Files

- `src/app/user/order-confirmation/order-confirmation.ts` — `OrderConfirmation` component (standalone, selector `app-order-confirmation`, `OnInit`). Contains the private helper `toLocalNumber()` (strips `+506` prefix and hyphens for display: `"+506 6345-2039"` → `"6345 2039"`).
- `src/app/user/order-confirmation/order-confirmation.html` — template (`confirmation__*` CSS blocks). **Has uncommitted working-tree changes** as of 2026-07-06 — this doc describes what is on disk.
- `src/app/user/order-confirmation/order-confirmation.scss` — styles, incl. the animated check ring (`@keyframes confirmation-ring-pop` / `confirmation-draw-check`, both disabled under `prefers-reduced-motion: reduce`).
- `src/app/core/orders/orders.service.ts` — `OrdersService` (`getMyOrder`, `getGuestOrder`, `uploadPaymentProof`, `attachPaymentProof`) + exported constant `WHATSAPP_PROOF_SENTINEL = '__whatsapp__'`. **Also has uncommitted changes** (`getMyOrders` pagination — not used by this screen).
- `src/app/core/settings/app-settings.service.ts` — `AppSettingsService.get()` for SINPE/WhatsApp/bank/loyalty settings.
- `src/app/core/auth/auth.service.ts` — `auth.isSignedIn()` picks the lookup path and gates the "Ver mis pedidos" link.
- `src/app/core/catalog/catalog.types.ts` — `OrderRow`, `OrderItemRow`, `AppSettingsRow`, `PaymentMethod` (`'sinpe_or_transfer' | 'payment_link'`).
- `supabase/migrations/20260508000500_order_lookup_and_proof.sql` — `get_guest_order` + `attach_payment_proof` RPC definitions.
- `supabase/migrations/20260629000000_payment_proofs_upload_visibility_fix.sql` — Storage RLS for the `payment-proofs` bucket (`order_accepts_proof()` SECURITY DEFINER gate).

## UI anatomy

Top to bottom (all conditional on `order()` unless noted):

1. **Loading** — indeterminate `mat-progress-bar` while `loading()`.
2. **Not found** (`notFound()`, `.confirmation__not-found`) — "No encontramos este pedido." + stroked button "Volver al catálogo" → `/products`.
3. **Success header** (`.confirmation__header`) — animated check ring (`.confirmation__ring` SVG), eyebrow "Pedido —", `<h1>` "¡Recibimos tu pedido!", and "Referencia `#{{order_number}}` · Te enviamos copia a `{{customer_email}}`" (`shortRef()` renders `#` + `order_number`).
4. **Main column** (`.confirmation__layout` → `.confirmation__main`):
   - **"Cómo pagar" panel** (only when `o.payment_method === 'sinpe_or_transfer'`; `.confirmation__panel`):
     - Subhead: "SINPE Móvil o transferencia bancaria. Apartamos tus cartas mientras confirmamos." + status pill (`.confirmation__pill`) "Pago pendiente" with `schedule` icon.
     - **Payment slab** (`.confirmation__slab`): "SINPE Móvil" cell with `sinpeDisplay()` number and a "Copiar" button (`.confirmation__copy`) that flips to "Copiado" + `check` icon for ~1.6 s; payee line "A nombre de **Poke-Singles CR**" (hardcoded). Amount cell: "Monto exacto", `₡{{ o.total }}`, and "Incluí `#N` en la nota del pago."
     - **Bank info** (only when `settingsRow()?.bank_account_info` is non-empty): label "Transferencia bancaria" + the raw text in a `<pre class="confirmation__bank-pre">`.
     - **Release-timer warning** (`.confirmation__warning`): "El pedido se libera si no recibimos el comprobante en **4 horas**. Te avisamos por WhatsApp al confirmar." (The 4-hour figure is template copy only — no client timer.)
     - **Proof actions** — three mutually exclusive states:
       - `proofUploaded()` → status row "Comprobante recibido. Te contactaremos cuando lo verifiquemos." plus a "Ver" link when `proofPreviewUrl()` is set (same-session object URL only).
       - `whatsappAcknowledged()` → "Marcamos tu pedido como enviado por WhatsApp. Te contactaremos pronto."
       - Neither → CTA row (`.confirmation__cta`): file-input label `.confirmation__upload` "Adjuntar comprobante" (accepts `image/jpeg,image/png,image/webp,application/pdf`; shows "Subiendo…" + `hourglass_top` while `uploading()`), a WhatsApp deep link `.confirmation__whatsapp` "Enviar comprobante por WhatsApp" (`whatsappLink()` prefills "Hola, envío comprobante del pedido #N (₡total)."), and below them the checkbox-style button `.confirmation__sent-via` "Ya envié el comprobante por WhatsApp".
     - **Help row** (after proof/ack): "Si necesitas ayuda con tu orden contáctanos" + small "WhatsApp" link (`whatsappContactLink()`).
   - **Payment-link panel** (the `@else` branch, `payment_method === 'payment_link'`): `<h2>` "Te enviaremos un enlace de pago", "Te contactaremos al teléfono **{{ o.customer_phone }}** con el enlace de pago.", warning "El pedido se libera si no recibimos confirmación en **4 horas**.", and a "Contactarnos por WhatsApp" link. No proof upload here.
   - **"Datos de envío" panel**: method row (`.confirmation__ship-method`) with icon `place` (address) or `storefront` (pickup), `o.shipping_method_name`, and — when `o.shipping_address` exists — "{{line1}}, {{line2}} · {{city}}, {{province}}" plus optional `addr.notes`. Divider, then fields "Cliente" / "Teléfono" / "Correo".
   - **Footer links** (`.confirmation__foot-links`): "← Seguir comprando" → `/products`, and — signed-in only — "Ver mis pedidos →" → **`/account/pedidos`** (deep link; route data `initialView: 'pedidos'` on the Account component).
5. **Summary aside** (`.confirmation__summary` → `.confirmation__summary-card`): red strip, eyebrow "Resumen —", `<h2>` "Tu pedido", ref `#N`; item list (`.confirmation__item`) with thumb + qty badge, `product_name`, set/number meta (`SET · #NUM`), condition pill via `conditionClass()` (NM green / LP / MP / HP+DMG red — mirrors `ProductCard.conditionClass`), and `line_total`. Totals: "Subtotal · N carta(s)" (`itemCount()` pluralizes), coupon row (`o.coupon_code` label, `−₡…` styled `.price--sale`) when `discount_amount > 0`, "Envío" ("Gratis" when `shipping_amount === 0`). Total slab: "Total", `₡{{ o.total }}`, "IVA incluido".
6. **Poke-Monedas card** (below summary, only when `coinsToEarn() > 0`): coin image `assets/images/coin-sm.png`, "Ganás **+N Poke-Monedas** al confirmar" and "Se acreditan cuando validamos tu pago."
7. **Help line** (`.confirmation__help`): "¿Dudas? Escríbenos al {{ whatsappDisplay() }}" linking to plain `wa.me`.

## Services & backend

- **Order lookup** (`bootstrap()`):
  - Signed-in: `OrdersService.getMyOrder(orderId)` — direct PostgREST `orders.select('*, order_items(*)').eq('id', …).maybeSingle()`, RLS-scoped to own rows. Returns `null` if not found/not theirs.
  - Fallback / guests: `OrdersService.getGuestOrder(orderId, email)` — RPC **`get_guest_order(p_order_id uuid, p_email text)`** (SECURITY DEFINER, granted to `anon, authenticated`), which requires a case-insensitive `customer_email` match and returns `{ order, items }` as jsonb or null.
- **Settings**: `AppSettingsService.get()` — always-fresh read of the `app_settings` singleton row (`id = true`). Fields used: `sinpe_phone`, `whatsapp_number`, `bank_account_info`, `loyalty_enabled`, `loyalty_colones_per_point`.
- **Proof upload**: `OrdersService.uploadPaymentProof(orderId, file)` — Storage **`payment-proofs`** bucket (private), path **`{orderId}/proof.{ext}`**, **plain `.upload()` with no `upsert`** (see Gotchas). A 409 / "exists|duplicate" error is treated as success so a retried attach can proceed.
  - Storage RLS: insert policy `payment_proofs_upload_pending_order` calls SECURITY DEFINER fn `order_accepts_proof(split_part(name,'/',1))` — order must exist, be `status = 'pending'` and `payment_method = 'sinpe_or_transfer'`. An update policy `payment_proofs_update_pending_order` also exists (legacy of the upsert era).
- **Proof attach**: `OrdersService.attachPaymentProof(orderId, email, filePath)` — RPC **`attach_payment_proof(p_order_id, p_email, p_file_path)`** (SECURITY DEFINER, anon + authenticated). Verifies email match (`NOT_FOUND`), `status = 'pending'` (`NOT_PENDING`), `payment_method = 'sinpe_or_transfer'` (`WRONG_PAYMENT_METHOD`), then writes `orders.payment_proof_url`. Customers have no direct UPDATE on `orders`.
- **WhatsApp path**: same RPC with `WHATSAPP_PROOF_SENTINEL` (`'__whatsapp__'`) as the file path, so admin can filter proof-less-but-acknowledged orders.

## State & data flow

- **Inputs:** `id = input.required<string>()`, `email = input<string>('')` (bound from the `?email=` query param).
- **Signals:** `order` (`OrderRow | null`), `items` (`OrderItemRow[]`), `settingsRow` (`AppSettingsRow | null`), `loading` (starts `true`), `notFound`, `uploading`, `copiedSinpe`, `proofPreviewUrl` (object URL of the just-uploaded file; session-only).
- **Computeds:** `shortRef` (`#` + `order_number`, `''` while null), `itemCount` (sum of line quantities), `coinsToEarn` (`floor(max(subtotal − discount_amount, 0) / loyalty_colones_per_point)`, gated by `loyalty_enabled` and `order.user_id != null` — guests always 0; mirrors the DB earn trigger), `proofUploaded` (proof url set and not the sentinel), `whatsappAcknowledged` (url === sentinel), `whatsappLink` (wa.me + prefilled text, number from `whatsapp_number` default `'50663452039'`), `sinpeDisplay` (from `sinpe_phone`, fallback `'+506 6345-2039'`), `whatsappDisplay`, `whatsappContactLink`.
- **Flow:** `ngOnInit` → `bootstrap()`: try `getMyOrder` when signed in, fall back to `getGuestOrder` when an `email` input exists; if neither yields a result → `notFound`. Then fetches settings. Errors snackbar via `errorMessage()` (fallback copy "Error desconocido"). `loading` cleared in `finally`.
- **`onProofSelected(event)`:** upload → on error snackbar "No se pudo subir: {msg}"; attach → on `!ok` snackbar "No se pudo registrar el comprobante. Avísanos por WhatsApp."; on success patches `order.payment_proof_url` locally, revokes any previous object URL, sets `proofPreviewUrl` (`URL.createObjectURL`, browser-only via `isPlatformBrowser`), snackbar "Comprobante recibido". Input value reset in `finally` so re-selecting the same file re-fires `change`.
- **`onMarkSentByWhatsApp()`:** attach with the sentinel; failure snackbar "No se pudo registrar. Intenta de nuevo."; success patches the order and snackbars "Marcamos tu pedido como enviado por WhatsApp."
- **`copySinpe()`:** browser-only; copies `sinpeDisplay()` stripped of spaces via `navigator.clipboard`; `copiedSinpe` resets after `setTimeout(…, 1600)`. Clipboard failures are silently ignored.
- No reload triggers — the page fetches once on init; proof state changes are local patches.

## Behaviors & edge cases

- **Signed-in user viewing a guest order that isn't theirs:** `getMyOrder` returns null (RLS), then the email fallback runs — so a signed-in admin/customer can still open a confirmation link that carries the right `?email=`. Without the query param, a signed-in user only sees their own orders.
- **No `email` param + signed out** → straight to "No encontramos este pedido." (the RPC is never called with an empty email).
- **Proof preview is ephemeral:** the "Ver" link only exists in the session that uploaded (object URL). On reload the status row shows without "Ver" — the private bucket has no customer read access (only admin gets signed URLs via `getPaymentProofSignedUrl`).
- **Attach can fail after upload succeeds** (e.g. order flipped out of `pending` between upload and attach). The 409-tolerant upload means a retry re-runs attach against the already-stored file.
- **`payment_link` orders** get no upload UI at all — proof handling is out-of-band (admin attaches via `adminAttachPaymentProof` if needed).
- **Poke-Monedas card hidden** for guests, when `loyalty_enabled` is off, when `loyalty_colones_per_point <= 0`, or when the computed earn is 0.
- The "4 horas" release window is informational copy; no client-side countdown or automatic release exists on this screen.

## Gotchas / invariants

- **Never add `upsert: true` to the proof upload.** Upsert makes Storage issue `INSERT … ON CONFLICT DO UPDATE`, whose conflict path needs SELECT/UPDATE visibility customers don't have on the private bucket → "new row violates row-level security policy". Plain insert + treating 409 as success is the working pattern (comment in `uploadPaymentProof`; history in `20260629000000_payment_proofs_upload_visibility_fix.sql`).
- **`WHATSAPP_PROOF_SENTINEL` (`'__whatsapp__'`) is load-bearing** across storefront and admin: `proofUploaded`/`whatsappAcknowledged` here, `getPaymentProofSignedUrl` returns null for it, and admin filters on it. Don't rename without a data migration.
- **`coinsToEarn` is a client-side preview** that must mirror the DB earn trigger (`floor((subtotal − discount) / loyalty_colones_per_point)`, awarded when the order reaches `paid`). If the trigger formula changes, update this computed or the promised amount will lie.
- **"Poke-Singles CR"** (payee) and the **"4 horas"** window are hardcoded template copy — not settings-driven, unlike the SINPE/WhatsApp numbers.
- **Fallback phone numbers are real** (`'+506 6345-2039'` / `'50663452039'`) and duplicated in three computeds; a null `app_settings.sinpe_phone` silently shows the fallback.
- `attach_payment_proof` requires `status = 'pending'` — once admin marks the order `paid`, the customer's "Ya envié…" button fails with the generic "No se pudo registrar…" snackbar (RPC error `NOT_PENDING` is not surfaced distinctly).
- `email` is a router-bound input: per project memory, `withComponentInputBinding` overrides input defaults with `undefined` on routes missing the key — here the default `''` applies only when the param is absent from the query string entirely; code guards with `this.email()` truthiness, which handles both.
- The condition-pill classes (`condition-pill--nm/lp/mp/hp`) are global classes shared with `ProductCard` — keep the mapping in `conditionClass()` in sync.

## Related docs

- [Checkout](./checkout.md) — the page that creates the order and redirects here.
- [Account](./account.md) — `/account/pedidos`, the "Ver mis pedidos" target with order history.
- [Cart page](./cart-page.md) / [Cart drawer](./cart-drawer.md) — upstream cart surfaces.
- [Commerce flow](../../architecture/commerce-flow.md) — order lifecycle (pending → paid → …) and proof verification.
- [Loyalty & Pokédex](../../architecture/loyalty-and-pokedex.md) — the earn trigger this page previews.
- [Backend RPCs](../../architecture/backend-rpcs-and-functions.md) — `get_guest_order`, `attach_payment_proof`, `order_accepts_proof`.
- [Data model](../../architecture/data-model.md) — `orders`, `order_items`, `app_settings`.
