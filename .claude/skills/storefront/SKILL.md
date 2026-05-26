---
name: storefront
description: >-
  The customer-facing Angular UI for Poke-Singles (the UserShell branch). Use this whenever
  you work on anything a shopper sees: the home page rails, the shared product card and grids,
  the `/products` listing, `/buscar` search UI (filters, sort control, URL params), the
  hover-preview overlay, the cart drawer and `/cart` page (including anon↔signed-in merge
  behavior), the `/account` page, the `/rifas` customer view, or the shared login dialog
  (magic link / password / Google). Trigger this for tile/grid layout, condition pills, type
  icons, add-to-cart UX, coupon apply/remove on the customer side, and customerGuard routing.
  For the underlying tables, RPCs, and RLS, pair with the `database` skill.
---

# Storefront (customer-facing UI)

Everything under `src/app/user/` plus shared customer components, wrapped by **UserShell**
(`src/app/user/user-shell/`): Header + Navigation + Footer + `<router-outlet>` + cart drawer
(`mat-sidenav position="end"`) + the single card-preview overlay. On init it also calls
`PresenceService.joinAsVisitor()` to announce the shopper on the shared Realtime presence
channel that feeds the admin dashboard's "people online" tile (→ `database` / `admin` skills).

## Customer routes

`/` Home · `/products` CardList · `/products/:slug` Detail (slug via
`input.required<string>()`) · `/buscar` SearchResults (`q` + `sort` URL params) · `/rifas`
Rifas · `/cart` CartPage · `/account` Account (`customerGuard`). Specific paths are declared
before the empty-path UserShell wrapper (router-ordering requirement).

## Shared product card + grids

One component does every tile: **`<app-product-card>`** at `src/app/shared/product-card/`.
Three pages render it — `/products` (`user/card-list/`), `/buscar` (`user/search-results/`),
and the home rails (`home/`). All tile visuals (image, badges, name, meta line, stock, price,
"Añadir" button, condition pill, type icons) and behaviors (add-to-cart, condition-info dialog)
live in that one component, so tile changes touch exactly one file.

Input shape is `ProductCardItem` (in `catalog.types.ts`) — a minimal structural subset
satisfied by both `ProductSearchRow` (listings) and `ProductListRow` (home). No mapping at call
sites: `<app-product-card [card]="row" />`. Pass `[featured]="true"` for the
`.product-card--featured` modifier (home "Destacadas" rail).

`.cards-grid` stays per-page: listings use `minmax(400px, 1fr)`, home rails `minmax(320px, 1fr)`
for denser tiles.

## Search UI

`/buscar` and `/products` share a filter contract (home does not). Filter chrome:
`<app-filters-bar>` + `<app-set-filter>` + `<app-card-type-filter>` + `<app-sort-select>`.
`<app-sort-select>` (`src/app/shared/sort-select/`) is the reusable "Ordenar por" control,
projected right-aligned into `<app-filters-bar>`; `showRelevance` is on only when there's a
query. Both pages bind `sort` to the URL param and resolve via `normalizeSort()`
(`catalog.types.ts`). Header search input + magnifier → `Router.navigate(['/buscar'], { q })`.
Both pages call the `search_products` RPC server-side (→ `database` skill for the RPC contract).

**Load more (paging).** Both grids fetch 60 rows per page and append the next via
`<app-load-more>` (`src/app/shared/load-more/`) — a centered "Cargar más" button rendered
below the grid when `hasMore()` is true. Each surface owns an in-component `page` /
`loadingMore` / `hasMore` triplet — **no `?page=` URL param** (sidesteps the
`withComponentInputBinding` undefined-default footgun and avoids deep-link refetch of
pages 1..n that the single-page RPC can't do in one call). `hasMore` is the
`rows.length === PAGE_SIZE` heuristic — no count RPC, so the button hides the moment a
short page comes back (and one harmless empty fetch closes out result sets that are an
exact multiple of 60). A filter/sort/q change runs the existing refetch effect which
resets `page` to 1; a stale-append guard inside `loadMore()` (`this.page() + 1 === next`
re-check after the await) protects against a slow page-2 landing on a freshly reset
page-1.

## Hover preview

A single `<app-card-preview-overlay>` mounted once in UserShell handles hover-zoom on every
grid. The `[appCardPreview]` directive on each `.card-image` host calls
`CardPreviewService.show(card, anchor)` on mouseenter (180ms debounce). Touch devices skipped
via `matchMedia('(hover: hover)')`. Image data is already loaded by the listing — the overlay
is pure presentation, no extra fetches.

## Cart

`CartService` (`src/app/core/cart/cart.service.ts`) owns both backends: `localStorage`
(`cart:v1`) when signed out, DB-backed (`cart_items`) when signed in. An `effect()` on
`auth.currentUser()` switches between them and **merges anonymous items into the DB on
sign-in** (sums quantities, caps at stock, clears localStorage).

Surfaces: header badge bound to `cart.itemCount()`; a right-side `mat-sidenav` drawer
(`<app-cart-drawer>`) mounted in UserShell that opens on add and on icon-click; and `/cart`
(full review, list/grid toggle persisted to `cart:view`). Cart-level metadata (the applied
coupon) lives in the separate 1-row-per-user `carts` table.

**Coupons (customer side):** apply/remove through the shared `<app-coupon-field>`
(`src/app/shared/coupon-field/`), reused on `/cart`, the cart drawer, and `/checkout` — each host
still prints its own `−₡ discount` line, so the component renders only the form/applied-chip. The
chosen coupon id rides on `carts.coupon_id`; the cart re-validates after every mutation; a
`couponDroppedTick` signal flashes a snackbar on auto-drop (e.g. subtotal fell below threshold) —
that effect lives in `cart-page`, deliberately **not** in the shared component, so it can't
double-fire when the field is mounted on two surfaces at once. Error codes map to Spanish via
`src/app/core/catalog/coupon-errors.ts`. The discount is computed locally (TS mirror of
`calculate_coupon_discount`, category-scoped via `eligibleSubtotal`) to avoid an RPC per cart
change. **Per-line breakdown:** `CartService.lineCoupon` (`computed<Map<product_id, LineCoupon>>`)
distributes the rounded `discount()` across in-scope lines (largest-remainder, sums exactly to the
summary) so each cart line shows its discounted price — struck `.price--original` + amber
`.price--sale`, with "Cupón no aplica" on the lines a category-scoped coupon skips. PERCENTAGE
coupons get per-item prices; a `FIXED_ON_THRESHOLD` coupon only highlights its eligible lines.
Full RPC contract → `database` skill.

## Raffles (customer view)

`/rifas` reads the `rifas_listing` view and splits into **Activas** (`scheduled`) /
**Completadas** (`drawn`/`void`, shows winner) tabs. Tile: `shared/raffle-card/` — status-aware
(buy mode vs. winner banner), shows a ticket-icon space count (`remaining/total`, total =
`quantity + entries_sold`), a day countdown (gold "coming soon" under 3 days), set + card-number
meta, and `market_price` (to show the raffle isn't profiteering). Entries are bought through the
normal cart → checkout pipeline. Data side → `database` skill.

## Account + auth UI

`/account` (gated by `customerGuard`) lets the user edit `full_name` + `phone` and sign out;
the shipping-address editor is a stub awaiting checkout. `AuthService`
(`src/app/core/auth/auth.service.ts`) wraps `signInWithMagicLink(email)` (recommended; doubles
as signup), `signInWithPassword(email, password)`, and `signInWithGoogle()`. The shared
`LoginDialog` (`src/app/auth/login-dialog/`) lays them out in that order — magic link primary,
password sign-in/sign-up tabs, Google OAuth (the same button admins use). Profile/trigger
details → `database` skill.

## URL strategy (when product pages firm up)

Preserve OpenCart SEO slugs in `/products/:slug` where possible to keep existing rankings; for
any pattern that must change, add 301s via `.htaccess` (→ `deploy` / `migration` skills).
