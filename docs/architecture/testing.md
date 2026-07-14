# Testing (unit + e2e checkout harness)
> Part of the Poke-Singles docs set. Verified against source on 2026-07-13. Load together with /CLAUDE.md.

## Purpose

Two-layer safety net around the checkout flow (the highest-stakes path):
fast Vitest unit specs for the client-side logic, and a Playwright smoke suite
that drives a real browser through guest and signed-in orders against the dev
Supabase project.

## Scope

- Unit specs: `src/**/*.spec.ts` (Vitest via `@angular/build:unit-test`, jsdom).
- Shared test fakes: `src/app/testing/`.
- E2E: `e2e/` + `playwright.config.ts` + `scripts/e2e-seed.mjs` / `scripts/e2e-cleanup.mjs`.

## Key files

| File | Role |
|---|---|
| `src/app/testing/supabase-fake.ts` | `createSupabaseFake()` — DI override for `SupabaseService`: recorded `rpc`/`from`(thenable chain)/`functions.invoke`, configured via `setRpc`/`setTable` |
| `src/app/testing/cart-fake.ts` | `createCartFake()` (CartService double with writable `items`/`appliedCoupon`/`discount` signals) + `makeCartLine()` fixture |
| `src/app/core/orders/orders.service.spec.ts` | `placeOrder`: RPC payload `{p_input}`, `RPC_ERROR` mapping, email invoke only on success |
| `src/app/core/cart/cart.service.spec.ts` | discount math (scoped %, threshold, cap), `applyCoupon`, revalidate auto-drop, `clear()`, merge-on-sign-in (sum + stock-cap + gone-product drop, localStorage handover) |
| `src/app/user/checkout/checkout.spec.ts` | shipping filtering/default-selection, address validators, `onSubmit` payload, error→copy map, empty-cart guard |
| `playwright.config.ts` | `workers: 1`, `reuseExistingServer: true` on `http://localhost:4242`, global setup/teardown = seed/cleanup |
| `e2e/helpers.ts` | `loadFixtures`, `blockOrderEmail` (route-fulfills `**/functions/v1/send-order-email` → no real Resend mail), `serviceClient`, `anonClient`, `signedInClient` (Node-side password login for RPC JWTs), `signInViaToken` (plants `sb-<ref>-auth-token`), `dismissOnboarding`, `makeGuestOrderInput` + `TINY_PNG` (shared fixtures), and a project-mismatch guard: every client refuses to run when `environment.ts` and `SUPABASE_DEV_URL` point at different refs |
| `e2e/guest-checkout.spec.ts` | guest pickup order end-to-end + DB assert on the order row + proof upload (storage object + `payment_proof_url`) |
| `e2e/signed-in-coupon-checkout.spec.ts` | token login, locked email, `E2ETEST10` coupon (−₡250 on ₡2500), DB asserts on discount/redemption/cleared cart + WhatsApp proof sentinel (`__whatsapp__`) |
| `e2e/place-order-rpc.spec.ts` | Node-only (anon-key RPC calls): INSUFFICIENT_STOCK / PRODUCT_UNAVAILABLE / SHIPPING_NOT_ALLOWED_FOR_CART / COUPON_INVALID / COUPON_LIMIT — every failure case asserts the full writes-nothing invariant (stock + orders + redemptions snapshot); COUPON_LIMIT self-resets its redemptions so `--retries`/`--repeat-each` are safe |
| `e2e/cancel-order-loyalty.spec.ts` | Node-only: place (coupon) → paid (loyalty earn) → `cancel_order` as the seeded admin → stock restored, redemption released, points reversed; NOT_ADMIN + ALREADY_TERMINAL; forces `app_settings.loyalty_*` on and restores it |
| `e2e/rls-smoke.spec.ts` | anon/customer leakage guards: inactive + zero-stock products hidden from table reads and `search_products` (restores captured values, not seed constants), orders unreadable cross-user, `get_guest_order` email gate, payment-proofs write-only for customers, loyalty ledger private (stages a real row + owner-can-read control so the assert can't pass vacuously) |
| `scripts/e2e-seed.mjs` | idempotent fixtures: 2 `[E2E]` products (slugs `e2e-test-card-a/b`, ₡1000/₡2500, stock reset to 10), test user + dev-only admin `e2e-admin@test.local` (`app_metadata.role='admin'`), coupons `E2ETEST10` + single-use `E2ELIMIT1`, restricted method `[E2E] Restricted (RPC test)` (allow-list = bogus category → never storefront-visible), finds an unrestricted pickup method; writes `e2e/.fixtures.json` (gitignored) |
| `scripts/e2e-cleanup.mjs` | deletes test orders (payment-proof storage objects first, then redemptions/activity/items), resets stock, clears redemptions for both coupons + test-user cart + loyalty rows; `--purge` removes products/coupons/restricted method AND both auth users (never leave the seeded admin login standing) |

## How it works

- `npm test` — whole Vitest suite. `npm run e2e` — self-contained: seed → 2 specs → cleanup.
  `e2e:headed` / `e2e:ui` for watching; `e2e:seed` / `e2e:cleanup` run the scripts alone.
- E2E reuses an already-running `npm start` on 4242 (never kills it); spawns and stops its
  own server only when none is running.
- Requires in `.env.local`: `SUPABASE_DEV_URL`, `SUPABASE_DEV_SERVICE_ROLE_KEY`,
  `E2E_USER_EMAIL`, `E2E_USER_PASSWORD` (seed creates/reuses the auth user
  `e2e-checkout@test.local` and re-syncs its password each run).
- Suite baseline: **green** (2026-07-13: the four NG0201 `should create` failures —
  home / admin-shell / detail / header — were fixed with `provideRouter([])` in each spec's
  TestBed providers). `npm run preflight` (test + e2e + build:prod) is the go/no-go gate
  before any `deploy:prod`; a red suite blocks promotion, so fix rather than baseline it.

## Contracts & conventions

- Component specs assert on class members/signals (cast via `as unknown as`), not Material
  DOM — the `card-list.spec.ts` pattern. Flush constructor effects with
  `fixture.detectChanges()` + `await fixture.whenStable()`.
- Every spec that touches DI includes `fake.provider` so no real Supabase client is built.
- Playwright selectors: `data-testid` attributes (`add-to-cart`, `drawer-checkout`,
  `checkout-submit`, `shipping-<method.id>`, `coupon-input`/`coupon-apply`, `discount-row`,
  `order-ref`) or `getByRole('textbox', {name})` for form fields.
- Cleanup never calls `cancel_order` (its admin check needs a real `auth.uid()`; the
  service role has none) — it deletes rows directly and resets fixture stock.

## Gotchas / invariants

- **Helpers under `src/app/testing/` must not import vitest** — `tsconfig.app.json`
  type-checks every non-spec file under `src/`.
- **Standalone injector shadows TestBed providers**: `MatSnackBarModule` in a component's
  `imports:` provides its own `MatSnackBar`; a TestBed `useValue` is ignored. Spy on the
  component's injected instance instead.
- **`Validators.email` rejects padded input** — prove trimming via name/phone, never email.
- **E2E must pre-empt onboarding overlays**: welcome modal (localStorage
  `welcome:dismissed:v1`) and the post-login avatar picker (skipped because the seed sets
  `profiles.avatar_pokemon_number`). New global overlays will block clicks the same way.
- **Ambiguous locators**: `getByLabel('Teléfono')` also matches the payment-link radio;
  the cart drawer keeps a second `coupon-input` in the DOM — scope to `form.checkout__layout`.
- **Both e2e scripts hard-guard on the URL containing the dev project ref**
  (`fdscdinfpmvswinpasdg` since the 2026-07 prod promotion). If the dev instance is ever
  replaced again, update the guard in `scripts/e2e-seed.mjs` + `scripts/e2e-cleanup.mjs`
  BEFORE running the suite — otherwise it would happily write test data to the wrong
  project. `SUPABASE_DEV_URL` must point at the same ref.
- The RPC/DB specs (`place-order-rpc`, `cancel-order-loyalty`, `rls-smoke`) never open a
  browser but still run under the Playwright runner so they share the seed/cleanup
  lifecycle, fixtures, and `workers: 1` serialization.
- `cancel-order-loyalty` needs the seeded admin user because `cancel_order` checks
  `is_admin()` (JWT `app_metadata.role`) — the service role has no uid and is NOT admin.
  The seed always rewrites app_metadata (customer fixture gets `role: 'customer'`) so a
  stale admin role can never pollute the NOT_ADMIN / RLS assertions.
- `cancel-order-loyalty` mutates `app_settings.loyalty_*` for determinism: the snapshot
  read is asserted before anything is written and the finally restores the exact captured
  values — but a hard kill (Ctrl+C) mid-test can still leave loyalty forced ON at
  ₡1000/point; re-check `/admin/config` if a run was aborted there.
- Fixture products/coupon stay visible in the dev storefront between runs (`[E2E]` prefix);
  `npm run e2e:cleanup -- --purge` removes them.

## Related docs

- [commerce-flow](commerce-flow.md) — the flow under test
- [backend-rpcs-and-functions](backend-rpcs-and-functions.md) — `place_order`, `validate_coupon`
- [checkout screen](../screens/storefront/checkout.md) · [order-confirmation](../screens/storefront/order-confirmation.md)
