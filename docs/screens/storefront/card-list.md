# Card list (/products, /ofertas, /categoria redirect)
> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose
The main catalog browsing grid. One component, `CardList`, serves three surfaces: the full catalog at `/products`, the discounted-only listing at `/ofertas` (flipped by route data), and category-scoped views selected via the `?categoria=` facet. Provides faceted filters (Categoría, Set, Rareza, sub-type "Tipo"), a sort select, and cursor-less "Cargar más" paging — all filter/sort state lives in the URL.

## Route & access
- `/products` → `CardList` (lazy, child of UserShell, behind `maintenanceGuard` only — public).
- `/ofertas` → same `CardList` with route `data: { onSaleOnly: true, basePath: '/ofertas' }`.
- `/categoria/:categorySlug` → functional `redirectTo` in `src/app/app.routes.ts` that builds `/products?categoria=<slug>` via `inject(Router).createUrlTree`, preserving all incoming query params (e.g. `?tipo=`). Legacy/bookmark support only — no component.
- Query params (bound as component inputs via `withComponentInputBinding()` in `app.config.ts`):
  - `sets` — comma-separated set **ids**.
  - `types` — comma-separated card-type **ids** (the global "Rareza" facet).
  - `tipo` — comma-separated clean sub-type **slugs** (sealed/accesorios facet, e.g. `?tipo=booster-box`).
  - `sort` — `relevance | price-asc | price-desc | recent`; input default `'recent'`, normalized by `normalizeSort(raw, false)` so unknown/`relevance` values fall back to `DEFAULT_SORT_NO_QUERY = 'price-desc'`.
  - `categoria` — active category **slug**.
- Route-data inputs: `onSaleOnly` (default `false`), `basePath` (default `'/products'`, but see Gotchas).
- Reached from the header nav, home "Ver todo →" links, and the `/categoria` redirect.

## Files
- `src/app/user/card-list/card-list.ts` — `CardList` component; also module-level `PAGE_SIZE = 60`, `parseIdList()`, `subtypeSlug()`.
- `src/app/user/card-list/card-list.html` — breadcrumb, header, filters bar, grid, load-more.
- `src/app/user/card-list/card-list.scss` — `.cards-header`, `.cards-empty`, `.cards-grid` (`minmax(400px, 1fr)`, 12px gap, 1 column < 600px).
- `src/app/user/card-list/card-list.spec.ts` — spec.
- `src/app/shared/filters-bar/filters-bar.{ts,html,scss}` — `FiltersBar` strip; input `anyActive`, output `clearAll`, button "Limpiar filtros".
- `src/app/shared/filters-bar/set-filter/set-filter.*` — `SetFilter` multi-select facet (label "Set", search placeholder "Find a Set"); inputs `sets`, `counts`, `selected`, `hideZero`.
- `src/app/shared/filters-bar/card-type-filter/card-type-filter.*` — `CardTypeFilter`; inputs `label`, `cardTypes`, `counts`, `selected`, `hideZero`.
- `src/app/shared/filters-bar/category-filter/category-filter.*` — `CategoryFilter` single-select (label "Categoría"); inputs `categories`, `counts`, `selected`.
- `src/app/shared/sort-select/sort-select.{ts,html,scss}` — `SortSelect` ("Ordenar por"; options "Relevancia" (only when `showRelevance`), "Precio (Menor a Mayor)", "Precio (Mayor a Menor)", "Más recientes").
- `src/app/shared/load-more/load-more.ts` — `LoadMore` "Cargar más" button (inline template, spinner while `loading`).
- `src/app/shared/product-card/product-card.*` — grid tile.
- `src/app/core/catalog/products.service.ts`, `sets.service.ts`, `card-types.service.ts`, `categories.service.ts` — data sources.

## UI anatomy
1. **Breadcrumb** — `.breadcrumb`: home icon link (`aria-label="Inicio"`), `›`, current `pageTitle()`.
2. **Header** — `.cards-header`: `<h1>{{ pageTitle() }}</h1>` ("Productos" | "Ofertas" | active category name) and `.lead` `pageLead()` — on sale: "Productos con precio rebajado. Stock limitado — aprovecha antes de que se agoten."; otherwise "Productos auténticos, condición verificada, envío seguro a todo Costa Rica.".
3. **Filters bar** — `<app-filters-bar [anyActive]="anyFilterActive()" (clearAll)="onClearAllFilters()">` projecting, in order:
   - `<app-category-filter>` — only when `showCategoryFilter()` (`!onSaleOnly()`); fed `categoriesForFilter()` (active categories minus `rifas`) and `categoryCounts()`.
   - `<app-set-filter>` — always; `hideZero` when `onSaleOnly() || !!effectiveCategorySlug()`.
   - `<app-card-type-filter label="Rareza">` — when `showRareza()` (any global card types exist); fed `globalCardTypes()` (rows with `category_id === null`).
   - `<app-card-type-filter label="Tipo">` — when `showSubtypeFilter()` (`categoria` is `'sellado'` or `'accesorios'` and that category has sub-types); fed `subtypeCardTypes()`.
   - `<app-sort-select bar-end>` — projected into the bar's `[bar-end]` slot; `showRelevance` is not passed (defaults false — relevance is never offered here).
4. **Loading bar** — `<mat-progress-bar mode="indeterminate">` while `loading()`.
5. **Empty state** — `.cards-empty` with `emptyText()`: category → "No hay productos en esta categoría todavía."; ofertas → "No hay ofertas en este momento. Vuelve pronto."; default → "Aún no hay productos en stock. Vuelve pronto.".
6. **Grid** — `.cards-grid` of `<app-product-card [card]="card" />` tracked by `card.id`.
7. **Load more** — `<app-load-more [loading]="loadingMore()" (loadMore)="loadMore()" />`, rendered only `@if (hasMore())`.

## Services & backend
- Grid fetch: `ProductsService.search()` → **`search_products`** RPC with `q: ''`, `sort`, `limit_n` (= `PAGE_SIZE` 60), `offset_n`, `set_ids`, `p_card_type_ids`, `p_on_sale_only`, `p_category_slug`. Security-invoker; reads the `products_search` view, so anon sessions only see active, in-stock, priced rows. Category slug resolves server-side via `category_id_by_slug`.
- Lists (once, `loadLists()`): `CategoriesService.list({ activeOnly: true })` (**`categories`** table), `SetsService.list()` (**`sets`** table, session-cached), `CardTypesService.list({ activeOnly: true })` (**`card_types`** table), `CategoriesService.countsForQuery('', {})` → **`search_category_counts`** RPC.
- Scoped facet counts (`loadScopedCounts()`): scoped (`onSaleOnly || categorySlug`) → `SetsService.countsForQuery('', { onSaleOnly, categorySlug })` (**`search_set_counts`** RPC) and `CardTypesService.countsForQuery(...)` (**`search_card_type_counts`** RPC); unscoped → cached `SetsService.counts()` (**`set_product_counts`** RPC) and `CardTypesService.counts()` (**`card_type_product_counts`** RPC).

## State & data flow
- Inputs (URL/route bound): `sets`, `types`, `tipo`, `sort`, `categoria`, `onSaleOnly`, `basePath`.
- Signals: `cards: ProductSearchRow[]`, `page` (1-based, in-component only — never a URL param), `loadingMore`, `hasMore` (set from `rows.length === PAGE_SIZE`), `allSets`, `setCounts`, `allCardTypes`, `cardTypeCounts`, `categories`, `categoryCounts`, `loading` (starts `true`).
- Computeds: `effectiveCategorySlug`, `effectiveCategoryId`, `globalCardTypes`, `subtypeCardTypes`, `subtypeIdBySlug` / `subtypeSlugById` (clean-slug ↔ id maps; clean slug = card_type slug minus its category prefix: `sellado-booster-box` → `booster-box` via `subtypeSlug()`), `showRareza`, `showSubtypeFilter`, `showCategoryFilter`, `categoriesForFilter`, `categoryName`, `effectiveBasePath` (`basePath() ?? '/products'`), `selectedSetIds`, `selectedRarezaIds`, `selectedSubtypeIds`, `selectedCardTypeIds` (union of Rareza + sub-type ids — what the RPC filters on), `anyFilterActive`, `normalizedSort`, `pageTitle`, `pageLead`, `emptyText`.
- Effects (constructor):
  1. `loadScopedCounts(onSaleOnly, categorySlug)` — reruns when scope changes (must be an effect: route inputs aren't bound yet in the constructor).
  2. `fetchProducts({ setIds, cardTypeIds, sort, onSaleOnly, categorySlug })` — reruns on any selection/sort/scope change; resets `page` to 1 and recomputes `hasMore`.
- All filter/sort mutations are navigations to `effectiveBasePath()` with `queryParamsHandling: 'merge'`: `onSortChange` writes `sort`; `onSetsChange` writes `sets` (or `null` to clear); `onRarezaChange` writes `types`; `onSubtypeChange` maps ids → clean slugs and writes `tipo`; `onCategoryChange` writes `categoria` and nulls `types` + `tipo` (scoped filters are invalidated by a category switch); `onClearAllFilters` nulls `sets`, `types`, `tipo`, `categoria`.

## Behaviors & edge cases
- Paging: `PAGE_SIZE = 60` (kept in sync with SearchResults by comment convention). `loadMore()` guards against re-entry (`loadingMore() || loading() || !hasMore()`), fetches page `page()+1`, then applies a **stale-append guard**: rows are appended only if `this.page() + 1 === next` still holds — if a filter change reset the grid mid-flight, the stale rows are dropped.
- The grid always routes through the search RPC even with `q: ''` so `/products`, `/ofertas` and `/buscar` share one row shape and filter pipeline.
- `?tipo=` slugs that don't resolve (wrong category active, list not loaded yet) are silently filtered out of `selectedSubtypeIds`.
- Facet counts intentionally exclude the current set/card-type selections so other options remain meaningful; scoped-count failures are swallowed, leaving previous counts in place.
- Fetch errors show a `MatSnackBar` (message or "Error desconocido", "OK", 5000 ms); grid keeps whatever it had.
- On `/ofertas` and category views, `hideZero` hides zero-count options in the Set and card-type facets.
- The Categoría facet never lists `rifas` (raffles live on `/rifas` only).

## Gotchas / invariants
- **`basePath()` can be `undefined` despite its declared default** — `withComponentInputBinding()` overrides an input default with `undefined` on routes that don't supply that data key (i.e. `/products`). Every navigation must go through `effectiveBasePath()` (`?? '/products'`); calling `navigate([this.basePath(), …])` directly reintroduces the NG04008 bug that silently broke all filters on `/products`.
- `sort` normalization here always passes `hasQuery = false`, so `?sort=relevance` on `/products` degrades to `price-desc` — relevance is never a valid browse sort.
- `types` carries raw card-type **ids** while `tipo` carries clean **slugs**; don't unify them — the clean slugs are a deliberate URL-cosmetics choice for sealed/accessories.
- Sub-type slug parsing assumes admin-created sub-type slugs are always category-prefixed (first dash segment stripped by `subtypeSlug()`); an unprefixed slug would be mangled.
- `onCategoryChange` must keep nulling `types`/`tipo` — the card-type facets are category-scoped and stale ids would silently over-filter.
- `page`/`hasMore` are never URL state: back/forward restores filters but always re-lands on page 1.
- The `/categoria/:categorySlug` route is a pure redirect; adding a component there would shadow the facet-based flow.
- `showCategoryFilter` hides the Categoría facet on `/ofertas`, but a hand-typed `/ofertas?categoria=x` still scopes the grid (the input is read regardless) — the UI just won't show the selection.

## Related docs
- [Home](./home.md)
- [Search results](./search-results.md)
- [Product detail](./detail.md)
- [Shared components](../../architecture/shared-components.md)
- [Routing & guards](../../architecture/routing-and-guards.md)
- [Backend RPCs & functions](../../architecture/backend-rpcs-and-functions.md)
