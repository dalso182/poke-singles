# Poke-Singles — Documentation index

Per-screen and per-subsystem reference docs for the Angular 21 + Supabase storefront/admin.
Written for a future AI session (or dev) that loads **one doc + `/CLAUDE.md`** and needs to
work confidently on that area without re-reading the whole codebase.

**How to use:** find the screen or subsystem you're about to touch in the tables below and
load that doc before editing. Screen docs follow a fixed template (Purpose · Route & access ·
Files · UI anatomy · Services & backend · State & data flow · Behaviors & edge cases ·
Gotchas / invariants · Related docs). All facts were verified against source on **2026-07-06**;
if a doc's claims disagree with the code, the code has moved — update the doc.

## Architecture (cross-cutting subsystems)

| Doc | Load when working on… |
|---|---|
| [routing-and-guards](architecture/routing-and-guards.md) | `app.routes.ts`, route data/order, `adminGuard`/`customerGuard`/`maintenanceGuard`, router-bound inputs (`withComponentInputBinding` footgun) |
| [auth-and-roles](architecture/auth-and-roles.md) | `AuthService`, sessions, `is_admin`, profiles lifecycle, signup email |
| [data-model](architecture/data-model.md) | Any table/view/RLS/trigger/migration question — the schema at its current state |
| [backend-rpcs-and-functions](architecture/backend-rpcs-and-functions.md) | Any RPC (search_products, place_order v10, cancel_order, admin_*…), Edge Functions, PHP image endpoints |
| [commerce-flow](architecture/commerce-flow.md) | The end-to-end purchase lifecycle: cart → coupon → checkout → order → proof → cancel/emails |
| [loyalty-and-pokedex](architecture/loyalty-and-pokedex.md) | Poke-Coins ledger, earn/reverse trigger, Pokéball redemption, caught Pokémon, avatars |
| [shared-components](architecture/shared-components.md) | Anything in `src/app/shared/**` — which primitive to use where, composition rules |
| [theming](architecture/theming.md) | `src/styles/*`, tokens, Material overrides, the brand-red rule (currently **two** sanctioned uses) |
| [environments-and-deploy](architecture/environments-and-deploy.md) | `deploy.mjs`, env tiers, `.htaccess`, card-image pipeline, seed/import scripts |
| [design-manifest](design-manifest.md) | Prop/API tables for every shared component + global utility classes (pre-existing manifest) |

## Storefront screens (`docs/screens/storefront/`)

| Doc | Route(s) |
|---|---|
| [home](screens/storefront/home.md) | `/` |
| [card-list](screens/storefront/card-list.md) | `/products`, `/ofertas` (+ `/categoria/:slug` redirect) |
| [search-results](screens/storefront/search-results.md) | `/buscar` |
| [detail](screens/storefront/detail.md) | `/products/:slug` |
| [rifas](screens/storefront/rifas.md) | `/rifas` |
| [cart-drawer](screens/storefront/cart-drawer.md) | overlay (no route) — includes the `CartService` deep-dive |
| [cart-page](screens/storefront/cart-page.md) | `/cart` |
| [checkout](screens/storefront/checkout.md) | `/checkout` |
| [order-confirmation](screens/storefront/order-confirmation.md) | `/checkout/confirmation/:id` |
| [account](screens/storefront/account.md) | `/account` (+ `/direccion`, `/pedidos`, `/puntos`, `/pokedex` deep links) |
| [account-pokedex](screens/storefront/account-pokedex.md) | `/account/pokedex` (Pokédex panel + Pokéball dialog) |
| [login-dialog](screens/storefront/login-dialog.md) | dialog (magic link / password / Google) |
| [shell-header-footer](screens/storefront/shell-header-footer.md) | UserShell chrome: header, navigation, footer, presence |
| [dialogs](screens/storefront/dialogs.md) | welcome dialog + card-conditions dialog (global overlays) |
| [static-page](screens/storefront/static-page.md) | `/info/:slug` |
| [maintenance](screens/storefront/maintenance.md) | `/mantenimiento` |

## Admin screens (`docs/screens/admin/`)

| Doc | Route(s) |
|---|---|
| [admin-shell](screens/admin/admin-shell.md) | `/admin/*` chrome (sidenav, adminGuard) |
| [dashboard](screens/admin/dashboard.md) | `/admin` |
| [products-list](screens/admin/products-list.md) | `/admin/products` |
| [add-product](screens/admin/add-product.md) | `/admin/products/new` |
| [product-edit](screens/admin/product-edit.md) | `/admin/products/:id/edit` |
| [categories](screens/admin/categories.md) | `/admin/categories` |
| [filters](screens/admin/filters.md) | `/admin/filters` (embeds the CardTypes component — no `/admin/card-types` route) |
| [sets](screens/admin/sets.md) | `/admin/sets` |
| [sellers](screens/admin/sellers.md) | `/admin/sellers` |
| [price-review](screens/admin/price-review.md) | `/admin/price-review` |
| [coupons](screens/admin/coupons.md) | `/admin/coupons` |
| [coupon-edit](screens/admin/coupon-edit.md) | `/admin/coupons/new`, `/admin/coupons/:id/edit` |
| [shipping-methods](screens/admin/shipping-methods.md) | `/admin/shipping-methods` |
| [orders](screens/admin/orders.md) | `/admin/orders` |
| [order-detail](screens/admin/order-detail.md) | `/admin/orders/:id` |
| [customers](screens/admin/customers.md) | `/admin/customers` |
| [customer-detail](screens/admin/customer-detail.md) | `/admin/customers/:id` |
| [raffles](screens/admin/raffles.md) | `/admin/raffles` |
| [raffle-detail](screens/admin/raffle-detail.md) | `/admin/raffles/:id` |
| [reports](screens/admin/reports.md) | `/admin/reports` (all five report panels) |
| [pages](screens/admin/pages.md) | `/admin/pages`, `/admin/pages/new`, `/admin/pages/:id/edit` |
| [config](screens/admin/config.md) | `/admin/config` (all `app_settings` keys) |

## Other

| Doc | Route(s) |
|---|---|
| [library](screens/library.md) | `/library` — designer reference gallery (no shell) |

## Keeping this fresh

When a commit changes a screen's behavior, update its doc in the same batch: fix stale
facts, add new gotchas, prune gotchas the commit fixed, and add a doc (from the template
above) for any brand-new screen. The `commit-and-document` skill routes doc updates here.
