# Products list (admin)
> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose
The paginated inventory table at `/admin/products`: search, category/set/seller filters, inactive/featured toggles, inline active + featured switches with undo, price (with sale handling), stock, and restock recency. Row click (or the edit icon button) opens the product editor; the header button starts the add-product flow.

## Route & access
- Path: `/admin/products` (`pathMatch: 'full'`), lazy `ProductsList`, inside `AdminShell` behind `adminGuard`.
- No query params — all filter state is in-memory signals and resets on navigation.
- Navigates to `/admin/products/new` (`goToNew()`) and `/admin/products/:id/edit` (`goToEdit(id)`).

## Files
- `src/app/admin/products-list/products-list.ts` — `ProductsList` component (selector `app-admin-products-list`): filter signals, refresh effect, toggle handlers.
- `src/app/admin/products-list/products-list.html` — page header, filter bar, `mat-table` composed of shared table primitives.
- `src/app/admin/products-list/products-list.scss` — `.products-list__*` (name/slug stack, restock highlight, inactive-row dimming, scroll wrapper).
- `src/app/core/catalog/products.service.ts` — admin-side data: `list()`, `update()`, `setActive()`, `setFeatured()` (plus `get/getBySlug/create/slugInUse/getCardTypeIds/setCardTypes/listByCardRef` used by sibling screens).
- `src/app/core/catalog/categories.service.ts`, `sets.service.ts`, `sellers.service.ts` — filter option sources.
- Shared primitives (props documented in the design manifest): `app-page-header`, `app-filter-bar`, `app-table-card`, `app-search-input`, `app-dropdown`, `app-labeled-toggle`, `app-thumb`, `app-pill`, `app-money`, `app-stock`, `app-checkbox` (PlainCheckbox), `app-toggle` (ToggleSwitch), `app-icon-btn`, `app-btn`, `app-pagination-footer`.

## UI anatomy
1. `app-page-header` — kicker `"Inventario"`, title `"Productos"`, sub `"Catálogo completo · Buscar, filtrar, editar"`; projected `app-btn variant="primary"` `"Nuevo producto"` (+ `add` icon) → `goToNew()`.
2. `app-filter-bar`: `app-search-input` (width 300, placeholder `"Buscar"`, two-way `searchText`), `app-dropdown label="Categoría"` (`categoryOptions`, first option `"Todas"`), `app-dropdown label="Set"` (width 220, `setOptions`, first `"Todos"`, labels `"{code} — {name}"`), `app-dropdown label="Vendedor"` (width 220, `sellerOptions`: `"Todos"`, `"Poke-Singles (sin vendedor)"` (value `'none'`), then `"{name} ({code})"`), spacer, `app-labeled-toggle` `"Mostrar inactivos"` (`includeInactive`), `app-labeled-toggle` `"Solo destacados"` (`featuredOnly`).
3. `mat-progress-bar mode="indeterminate"` while `loading()`.
4. `app-table-card` wrapping `.products-list__scroll` > `table[mat-table].app-table.app-table--cozy`. `displayedColumns` order: `image, name, set, condition, language, price, quantity, restocked, featured, active, actions`.
   - **image**: `app-thumb [src]="row.image_url"`.
   - **Nombre**: bold name; when `row.seller_code` a blue `app-pill` with the seller code (tooltip = `seller_name`); slug beneath (`.products-list__slug`).
   - **Set**: `setLabel(row.set_id)` — set **code** via local map, `—` when none.
   - **Cond.** / **Idioma**: mono dim text (`row.condition || '—'`, `row.language`).
   - **Precio** (right): `app-money [value]="priceValue(row)" [original]="priceOriginal(row)"` — sale price shown (amber per Money cell) with original struck when `sale_price != null && sale_price < price`.
   - **Stock** (right): `app-stock [value]="row.quantity" [low]="3"`.
   - **Reabastecido**: `formatRestocked(row.last_restocked_at)` → `"Hoy"` (highlighted `--today`), `"Ayer"`, `"hace N d"` (<30), `"hace N m"` (<365), `"hace N a"`, else `—`.
   - **Destacado** (center): `app-checkbox` → `onToggleFeatured` (cell stops row-click propagation).
   - **Activo** (center): `app-toggle` → `onToggleActive` (propagation stopped).
   - **actions** (right): `app-icon-btn label="Editar"` (`edit` icon) → `goToEdit(row.id)`.
   - Row: class `products-list__row`, `--inactive` modifier when `!row.active`; whole row clicks through to edit.
5. Empty state (only when not loading): `"No hay productos que coincidan con los filtros."`
6. `app-pagination-footer` — `page`, `perPage`, `total`, `perPageOptions [25, 50, 100]`, emits `pageChange`/`perPageChange`.

## Services & backend
`ProductsService.list(params)` → `products` table:
- `select('*, sets(name, printed_total), sellers(code, name)', { count: 'exact' })`, ordered `last_restocked_at` desc (`nullsFirst: false`) then `created_at` desc, `.range(from, to)`.
- Filters applied: `eq('active', true)` unless `includeInactive`; `eq('category_id', …)`; `in('set_id', setIds)` or `eq('set_id', setId)` (multi wins); `eq('featured', true)` when `featuredOnly`; seller — `is('seller_id', null)` for `'none'` (explicit IS NULL; `.eq(col, null)` would render `=NULL` and never match) or `eq('seller_id', uuid)`; search — `%`/`_` escaped, then `.or('name.ilike.%…%,pokemon_name.ilike.%…%,slug.ilike.%…%')`.
- Embeds flattened into `ProductListRow` extras: `set_name`, `set_printed_total`, `seller_code`, `seller_name` (the `sellers` embed is admin-only via RLS; anon callers get nulls).
- `pageSize` clamped 1–200 (default 25).
`ProductsService.setActive(id, active)` / `setFeatured(id, featured)` — thin wrappers over `update(id, patch)` → `products` UPDATE returning `*` (admin writes ride the `products_admin_all` RLS policy).
Filter option sources: `CategoriesService.list()` (`categories`), `SetsService.list()` (`sets`), `SellersService.list()` (`sellers`, name-ordered; called **without** `activeOnly`, so retired sellers remain filterable).

## State & data flow
- Filter signals: `searchText('')`, `category('')`, `setId('')`, `seller('')` (`''` = todas, `'none'` = house only, uuid = that seller), `includeInactive(false)`, `featuredOnly(false)`.
- `searchValue` — `toSignal(toObservable(searchText).pipe(debounceTime(250), distinctUntilChanged()))`; the server only ever sees the debounced value.
- Table state: `rows: ProductListRow[]`, `total`, `page(1)`, `pageSize(25)`, `loading`.
- Option computeds: `categoryOptions`, `setOptions`, `sellerOptions`; `setsById` map backs `setLabel()`.
- Constructor: `bootstrap()` loads categories/sets/sellers in parallel (snackbar on failure) then `refresh()`. A constructor `effect` reads all six filter signals and — skipping its first run via a `firstRun` flag — resets `page` to 1 and calls `refresh()` on any change.
- `onPage(page)` / `onPerPage(size)` (resets to page 1) → `refresh()`.
- `refresh()` maps signals to `ProductListParams` (`seller`: `'' → undefined`, `'none' → null`, uuid passthrough; `featuredOnly` false → `undefined` so unfeatured rows aren't excluded).

## Behaviors & edge cases
- Search debounce 250 ms; empty/whitespace search sends no search clause.
- Inline toggles are **not optimistic**: `setActive`/`setFeatured` awaits the server, then shows a 5000 ms undo snackbar (`"Producto reactivado"` / `"Producto desactivado"` with action `"Deshacer"`; `"Producto destacado"` / `"Destacado quitado"`), then `refresh()`. The undo action re-calls the setter with the inverse and refreshes.
- Deactivating a row while `"Mostrar inactivos"` is off makes it disappear on the post-toggle refresh — the undo snackbar is the only way back from this screen (or flip the toggle).
- Errors surface as snackbars with the thrown `message` (fallback `"Error desconocido"`), duration 5000 ms.
- Default sort surfaces recently restocked products first (`last_restocked_at` desc, nulls last), then newest.

## Gotchas / invariants
- Search terms escape `%` and `_` but **not commas**: a comma in the search box is a PostgREST `.or()` list separator and will produce a 4xx (`refresh` then snackbars the parse error). Known limitation.
- The undo-snackbar handlers call `this.products.setActive(...).then(refresh)` without a `.catch` — a failed undo is an unhandled rejection (no user feedback).
- The Set column ignores the embedded `set_name` and renders the set **code** from the locally loaded `setsList`; if `SetsService.list()` failed at bootstrap every set shows `—` even though rows carry `set_name`.
- There is no column sorting UI — ordering is fixed server-side.
- Filter state is not reflected in the URL; a page refresh or navigation resets everything (contrast with screens that use query-param inputs).
- `pageSize` hard-clamps at 200 server-side even if a larger option were added.
- `sellerOptions` includes inactive sellers (list called without `activeOnly`) — intentional, so consigned history stays reachable.

## Related docs
- [Add product](./add-product.md) · [Product edit](./product-edit.md) · [Sellers](./sellers.md) · [Sets](./sets.md) · [Categories](./categories.md)
- [Shared components](../../architecture/shared-components.md) · [Data model](../../architecture/data-model.md)
- Shared table primitive props: [design manifest](../../design-manifest.md)
