# Home (landing page)
> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose
The customer landing page at `/`. Shows a branded hero, two auto-scrolling product marquees ("Recientes" and "Destacadas") and a static "Ofertas que te pueden interesar" grid of discounted products. All three data rails are read-only entry points into the catalog — the page itself has no filters or pagination.

## Route & access
- Path: `` (empty child of the UserShell route, `pathMatch: 'full'`), i.e. `/`.
- Guards: `maintenanceGuard` on the UserShell parent (`canActivate` + `canActivateChild`); no auth required.
- Lazy-loaded: `import('./home/home').then((m) => m.Home)` in `src/app/app.routes.ts`.
- No query params, no route data. Users reach it via the header logo (`routerLink="/"`), breadcrumb home icons, or direct navigation.

## Files
- `src/app/home/home.ts` — `Home` component: three rail signals + one `bootstrap()` fetch.
- `src/app/home/home.html` — hero, loading bar, three sections.
- `src/app/home/home.scss` — `.home-hero`, `.home-section`, `.home-empty`, `.cards-grid` (offers grid).
- `src/app/home/home.spec.ts` — smoke spec (passes; router provided via `provideRouter([])`).
- `src/app/shared/marquee/marquee.{ts,html,scss}` — `Marquee` auto-scroll strip.
- `src/app/shared/product-card/product-card.{ts,html,scss}` — `ProductCard` tile used in marquees and the offers grid.
- `src/app/core/catalog/products.service.ts` — `ProductsService.list()` / `.search()` data source.

## UI anatomy
Top to bottom:
1. **Hero** — `.home-hero` card with the `.brand-bar` gradient strip on its top edge (a sanctioned brand-red use). Inside `.home-hero__inner`: eyebrow "Bienvenido", `<h1>` "Poke-Singles Costa Rica", lead "Singles auténticas, condición verificada, envío seguro a todo el país.".
2. **Loading bar** — `<mat-progress-bar mode="indeterminate">` while `loading()`.
3. **Section "Recientes"** — `.home-section` with header `<h2>Recientes</h2>` and link "Ver todo →" (`routerLink="/products"`, class `.home-section__more`, amber `var(--accent-amber)`). Body: `<app-marquee [items]="recent()" direction="left" />`, or empty text "Aún no hay cartas en stock." (`.home-empty`) when loaded and empty.
4. **Section "Destacadas"** — rendered only when `featured().length > 0`. No "Ver todo" link. `<app-marquee [items]="featured()" direction="right" />` (scrolls the opposite way).
5. **Section "Ofertas que te pueden interesar"** — rendered only when `offers().length > 0`. Header link "Ver todo →" to `/ofertas`. Body: static `.cards-grid` (`repeat(auto-fill, minmax(400px, 1fr))`, gap 12px, single column below 600px) of `<app-product-card [card]="card" />`, tracked by `card.id`.

**Marquee internals** (`src/app/shared/marquee/`): inputs `items` (required, `ProductCardItem[]`), `direction` (`'left' | 'right'`, default `'left'`), `durationSeconds` (default **56**). Template renders the item list twice inside `.marquee__track` (second `.marquee__group` is `aria-hidden="true"`); `@keyframes marquee-scroll` translates the track `-50%` for a seamless loop, `--marquee-duration` CSS var carries the duration, `.marquee--right` plays the animation in reverse. Pauses on `:hover` and `:focus-within`. Edge fade via `mask-image` gradient (transparent → 6% → 94% → transparent). Each `.marquee__item` is fixed at 360px wide with 12px right margin.

**Product card** (shared): image links to `/products/:slug` with the `appCardPreview` hover-overlay directive; name link; meta line (set name, `#num/printed_total`, Holo/Reverse Holo variant); stock line "N disponible(s)"; price (sale price uses `.price--sale` — amber `--accent-amber`, not brand red); "Añadir" button (disabled + label "Agotada" at quantity 0) which calls `CartService.add(id, 1)` and auto-opens the cart drawer; corner type icons + condition pill button ("Ver guía de condiciones" tooltip → `CardConditionsDialogService.open()`).

## Services & backend
`Home.bootstrap()` runs three fetches in one `Promise.all`:
- `products.list({ pageSize: 12, excludeRaffles: true, inStockOnly: true })` → `recent` — PostgREST select on **`products`** with embedded `sets(name, printed_total)` and `sellers(code, name)`, ordered `last_restocked_at DESC NULLS LAST, created_at DESC`, filtered `active = true`, `quantity > 0`, `price > 0`, `category_id <> raffleCategoryId`.
- `products.list({ featured: true, pageSize: 12, excludeRaffles: true, inStockOnly: true })` → `featured` — same query plus `featured = true`.
- `products.search({ q: '', sort: DEFAULT_SORT_NO_QUERY, onSaleOnly: true, pageSize: 8 })` → `offers` — the **`search_products`** RPC (security invoker, reads the `products_search` view) with `p_on_sale_only: true`. `DEFAULT_SORT_NO_QUERY = 'price-desc'`, deliberately matching the `/ofertas` default so "Ver todo" continues seamlessly.

Raffle exclusion resolves the Rifas category id once via `ProductsService.raffleCategoryId()` (memoised; reads `CategoriesService.list()` and finds `slug === 'rifas'`).

## State & data flow
- Signals: `recent: ProductListRow[]`, `featured: ProductListRow[]`, `offers: ProductSearchRow[]`, `loading` (starts `true`).
- No inputs, no effects, no URL/localStorage state. Data loads once from the constructor (`void this.bootstrap()`); there is no refresh trigger — re-fetching requires re-navigating to the route.
- Errors from any of the three fetches surface as a `MatSnackBar` with the error message (fallback "Error desconocido") and action "OK", 5000 ms.
- Both `ProductListRow` and `ProductSearchRow` structurally satisfy `ProductCardItem`, so the marquees and grid share `<app-product-card>` with no mapping.

## Behaviors & edge cases
- One `Promise.all` means a failure in any fetch aborts all three rail assignments (single try/catch) — the page can show all-empty rails after one failed request.
- "Recientes" section always renders; its empty state only appears after loading finishes. "Destacadas" and "Ofertas" sections are hidden entirely when their arrays are empty (including during load and on error).
- `inStockOnly` is passed explicitly because an admin session's permissive `products_admin_all` RLS policy would otherwise leak sold-out/inactive rows into the rails (visibility can't rely on the public RLS policy alone).
- Marquee item limit is 12 per rail (recent commit "increase marquee item limit to 12 each"); offers grid caps at 8.
- The marquee clone doubles DOM cost: 12 items render 24 product cards per rail.
- The welcome dialog is **not** wired here — `WelcomeDialogService.maybeOpen()` is called from `UserShell`'s constructor (`src/app/user/user-shell/user-shell.ts`), so it fires on any storefront route, not just home.

## Gotchas / invariants
- The brand-bar div in the hero is the page's single allowed brand-red gradient; don't add another.
- `DEFAULT_SORT_NO_QUERY` must stay in sync between the home offers fetch and CardList's default, or the "Ver todo →" `/ofertas` handoff shows a different ordering.
- The offers rail goes through the `search_products` RPC (not `list()`) specifically to share the row shape/filter pipeline with `/ofertas`; keep it that way if editing.
- No pagination/"load more" on home by design; changing `pageSize` values (12/12/8) is the only lever.
- If the Rifas category is missing, `raffleCategoryId()` resolves `null` and exclusion becomes a no-op (raffle products would appear in rails only if they also pass in-stock/price filters).
- Minor doc note: the marquee `durationSeconds` default comment says "~20% slower than the original 45s" while the SCSS fallback `var(--marquee-duration, 45s)` still carries the old 45s default — harmless because the component always sets the var.

## Related docs
- [Card list & ofertas](./card-list.md)
- [Search results](./search-results.md)
- [Product detail](./detail.md)
- [Cart drawer](./cart-drawer.md)
- [Shell, header & footer](./shell-header-footer.md)
- [Shared components](../../architecture/shared-components.md)
- [Data model](../../architecture/data-model.md)
