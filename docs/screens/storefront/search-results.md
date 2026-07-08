# Search results (/buscar)
> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDEmd — correction: /CLAUDE.md.

## Purpose
The customer search page at `/buscar`. Renders results for the header search box's committed query (`?q=`), with Set and card-type facets, sort control, and "Cargar más" paging. With no query it doubles as a plain browse grid titled "Cartas". Committed searches are also logged server-side for the admin "Búsquedas" report — but by the header, not by this page.

## Route & access
- Path: `/buscar` → `SearchResults` (lazy, child of UserShell, behind `maintenanceGuard` only — public).
- Query params (component inputs via `withComponentInputBinding()`):
  - `q` — search term (default `''`).
  - `sort` — normalized by `normalizeSort(raw, hasQuery)`: with a query defaults to `DEFAULT_SORT_WITH_QUERY = 'relevance'`; without, `'relevance'` is rejected and it falls back to `DEFAULT_SORT_NO_QUERY = 'price-desc'`.
  - `sets` — comma-separated set ids.
  - `types` — comma-separated card-type ids.
- Reached from the header search field (`Header.onSearch` navigates to `['/buscar'], { queryParams: { q } }`), the detail page's "Más de este ilustrador" link (`/buscar?q=<illustrator>`), or directly.

## Files
- `src/app/user/search-results/search-results.ts` — `SearchResults` component; module-level `PAGE_SIZE = 60` and `parseIdList()`.
- `src/app/user/search-results/search-results.html` — breadcrumb, header + count, filters bar, grid, load-more.
- `src/app/user/search-results/search-results.scss` — `.search-header`, `.search-count`, `.search-empty`, `.cards-grid` (`minmax(400px, 1fr)`, 12px gap).
- `src/app/user/header/header.{ts,html,scss}` — the search box that feeds this page and triggers logging.
- `src/app/core/search-log/search-log.service.ts` — `SearchLogService.logSearch()`.
- `src/app/shared/filters-bar/filters-bar.*`, `set-filter/*`, `card-type-filter/*` — facet chrome.
- `src/app/shared/sort-select/sort-select.*` — "Ordenar por" control.
- `src/app/shared/load-more/load-more.ts` — "Cargar más" button.
- `src/app/shared/product-card/product-card.*` — result tile.
- `src/app/core/catalog/products.service.ts`, `sets.service.ts`, `card-types.service.ts` — data sources.

## UI anatomy
1. **Breadcrumb** — home icon (`aria-label="Inicio"`) `›` then, with a query: link "Buscar" (`/buscar`) `›` the raw query text; without: just "Buscar".
2. **Header** — `.search-header`: `<h1>` shows "Resultados para “{{ q() }}”" with a query, "Cartas" without. `.search-toolbar` holds `.search-count`: `{{ results().length }} resultado{{ results().length !== 1 ? 's' : '' }}` (count of **loaded** rows, not the total match count).
3. **Filters bar** — `<app-filters-bar>` projecting `<app-set-filter>` (default label "Set") and `<app-card-type-filter>` (no `label` input passed — check that component's default), plus `<app-sort-select bar-end [showRelevance]="hasQuery()">`. "Limpiar filtros" appears via `anyFilterActive()`.
4. **Loading bar** — indeterminate `mat-progress-bar` while `loading()`.
5. **Empty state** — `.search-empty`: with query "No encontramos cartas para “{{ q() }}”."; without "Aún no hay cartas en stock. Vuelve pronto.".
6. **Grid** — `.cards-grid` of `<app-product-card>` tracked by `card.id`.
7. **Load more** — `<app-load-more>` when `hasMore()`.

## Services & backend
- Results: `ProductsService.search({ q, sort, pageSize: 60, setIds?, cardTypeIds? })` → **`search_products`** RPC (params `q`, `sort`, `limit_n`, `offset_n`, `set_ids`, `p_card_type_ids`, `p_on_sale_only: false`, `p_category_slug: null`). Security-invoker over the `products_search` view — substring ILIKE against its `search_text` column; anon sees only active, in-stock, priced rows.
- Facet meta (once): `SetsService.list()` (**`sets`**), `CardTypesService.list({ activeOnly: true })` (**`card_types`**). Best-effort — failures leave the page working without filter chrome.
- Query-aware facet counts (every query change): `SetsService.countsForQuery(q)` → **`search_set_counts`** RPC; `CardTypesService.countsForQuery(q)` → **`search_card_type_counts`** RPC. Uncached.
- Search logging (in the **header**, not here): `SearchLogService.logSearch(term)` first calls the **`count_search_products`** RPC (counts visible matches in the caller's own RLS context so the number reflects what the shopper sees), then **`log_search`** with `{ p_term, p_found }` — keyword, IP, and customer are captured server-side. Fire-and-forget; failures only `console.error('[search-log] logSearch', err)` and never block navigation. Feeds the admin "Búsquedas" report (`admin_customer_searches`).

## State & data flow
- Inputs: `q` (`''`), `sort` (`''`), `sets`, `types`.
- Signals: `allSets`, `setCounts`, `allCardTypes`, `cardTypeCounts`, `results: ProductSearchRow[]`, `loading` (starts `false`), `page` (1-based, in-component only), `loadingMore`, `hasMore`.
- Computeds: `selectedSetIds`, `selectedCardTypeIds` (both via `parseIdList`), `anyFilterActive`, `normalizedSort`, `hasQuery` (`q().trim().length > 0`).
- One constructor effect reacts to `q` + `normalizedSort` + `selectedSetIds` + `selectedCardTypeIds`: calls `fetch(...)` (resets `page` to 1, sets `hasMore` from `rows.length === PAGE_SIZE`) and `refreshCounts(q)`. Counts deliberately ignore the set/card-type selections so unselected facet options stay meaningful.
- Filter/sort changes navigate to `/buscar` with `queryParamsHandling: 'merge'`: `onSortChange` → `sort`; `onSetsChange` → `sets` (or `null`); `onCardTypesChange` → `types`; `onClearAllFilters` → `sets: null, types: null` (note: does **not** clear `q`).
- The header search input is uncontrolled (`#searchInput` template ref); committed on Enter (`keyup.enter`) or the suffix search-icon button. Empty/whitespace queries are ignored (no navigation, no log).

## Behaviors & edge cases
- `PAGE_SIZE = 60`, same stale-append guard as CardList: `loadMore()` appends only if `this.page() + 1 === next` after the await, dropping rows fetched across a mid-flight query/filter change.
- On fetch error: snackbar (message or "Error desconocido", "OK", 5000 ms) **and** `results` cleared + `hasMore` false — unlike CardList, which keeps the previous grid.
- Count-refresh failures are swallowed; previous counts remain.
- "Relevancia" only appears in the sort dropdown when `hasQuery()`; a stale `?sort=relevance` without a query silently normalizes to `price-desc`.
- No debounce anywhere: the search executes only on committed navigation (Enter/click), and the effect fires once per URL change.
- The result count in the toolbar grows as pages load (it counts loaded rows); it is not a server-side total.
- The header also shows a search-help tooltip (icon `help_outline`, `aria-label="Ayuda de búsqueda"`) whose text enumerates searchable fields: "Busca por: nombre de la carta, Pokémon, set (nombre o código), número, número/total (p. ej. 15/151), tipo (Fire, Water…), ilustrador, marca de regulación o tipo de carta (Full Art, VMAX…)." — keep it in sync with the `products_search.search_text` bucket.

## Gotchas / invariants
- **Logging lives in `Header.onSearch`, not in SearchResults.** Direct URL hits, illustrator-link navigations from the detail page, and back/forward re-visits to `/buscar?q=…` are *not* logged; only header-committed searches are. `logSearch` also runs concurrently with (not before) navigation.
- `count_search_products` runs in the shopper's RLS context by design — the logged `found` count reflects storefront visibility, not the raw table.
- "Limpiar filtros" clears `sets`/`types` but keeps `q` and `sort` — clearing the query requires the breadcrumb "Buscar" link or a new search.
- `PAGE_SIZE` must stay in sync with `CardList` (both 60) per the in-code comments.
- The card-type facet here is the *global* full list (`allCardTypes`), not split into Rareza/sub-type like CardList — ids from `?types=` on `/buscar` may include category-scoped sub-types.
- The doc header's first line contains a self-referential typo fixed inline; the canonical companion file is `/CLAUDE.md`.

## Related docs
- [Card list & ofertas](./card-list.md)
- [Product detail](./detail.md)
- [Shell, header & footer](./shell-header-footer.md)
- [Shared components](../../architecture/shared-components.md)
- [Backend RPCs & functions](../../architecture/backend-rpcs-and-functions.md)
