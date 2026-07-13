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
| `src/app/core/cart/cart.service.spec.ts` | discount math (scoped %, threshold, cap), `applyCoupon`, revalidate auto-drop, `clear()` |
| `src/app/user/checkout/checkout.spec.ts` | shipping filtering/default-selection, address validators, `onSubmit` payload, error→copy map, empty-cart guard |
| `playwright.config.ts` | `workers: 1`, `reuseExistingServer: true` on `http://localhost:4242`, global setup/teardown = seed/cleanup |
| `e2e/helpers.ts` | `loadFixtures`, `blockOrderEmail` (route-fulfills `**/functions/v1/send-order-email` → no real Resend mail), `serviceClient`, `signInViaToken` (plants `sb-<ref>-auth-token`), `dismissOnboarding` |
| `e2e/guest-checkout.spec.ts` | guest pickup order end-to-end + DB assert on the order row |
| `e2e/signed-in-coupon-checkout.spec.ts` | token login, locked email, `E2ETEST10` coupon (−₡250 on ₡2500), DB asserts on discount/redemption/cleared cart |
| `scripts/e2e-seed.mjs` | idempotent fixtures: 2 `[E2E]` products (slugs `e2e-test-card-a/b`, ₡1000/₡2500, stock reset to 10), test user (+profile avatar 25, cleared cart), coupon `E2ETEST10`, finds an unrestricted pickup method; writes `e2e/.fixtures.json` (gitignored) |
| `scripts/e2e-cleanup.mjs` | deletes test orders (children first: redemptions/activity/items), resets stock, clears redemptions + test-user cart; `--purge` removes fixtures entirely |

## How it works

- `npm test` — whole Vitest suite. `npm run e2e` — self-contained: seed → 2 specs → cleanup.
  `e2e:headed` / `e2e:ui` for watching; `e2e:seed` / `e2e:cleanup` run the scripts alone.
- E2E reuses an already-running `npm start` on 4242 (never kills it); spawns and stops its
  own server only when none is running.
- Requires in `.env.local`: `SUPABASE_DEV_URL`, `SUPABASE_DEV_SERVICE_ROLE_KEY`,
  `E2E_USER_EMAIL`, `E2E_USER_PASSWORD` (seed creates/reuses the auth user
  `e2e-checkout@test.local` and re-syncs its password each run).
- Suite baseline: 4 pre-existing NG0201 `should create` failures
  (home / admin-shell / detail / header) + 2 user-shell unhandled errors are expected noise.

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
- **Both e2e scripts hard-guard on the URL containing `dhslfridsjdmhwzrgebv`** ("the dev
  project"). If that project is ever promoted to prod, update the guard (and fixtures) to
  the new dev ref BEFORE running the suite — otherwise the guard would happily write test
  data to prod.
- Fixture products/coupon stay visible in the dev storefront between runs (`[E2E]` prefix);
  `npm run e2e:cleanup -- --purge` removes them.

## Related docs

- [commerce-flow](commerce-flow.md) — the flow under test
- [backend-rpcs-and-functions](backend-rpcs-and-functions.md) — `place_order`, `validate_coupon`
- [checkout screen](../screens/storefront/checkout.md) · [order-confirmation](../screens/storefront/order-confirmation.md)
