# Admin — Filters (Filtros / card types)

> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose

Manages the `card_types` taxonomy — one classification list per category, switched with underlined tabs:

- **Singles** — the global "Rareza" tags (`category_id IS NULL`, multi-select on products, e.g. `secret-rare`, `full-art-pokemon`).
- **Producto sellado** — sub-types scoped to the `sellado` category (single-select per product, e.g. `sellado-etb`, `sellado-booster-box`).
- **Accesorios** — sub-types scoped to the `accesorios` category (single-select per product, e.g. `acc-sleeves`, `acc-playmats`).

Each tab renders the **same reusable `CardTypes` CRUD component** (`src/app/admin/card-types/`), scoped by category id. There is **no standalone `/admin/card-types` route** — despite what older notes say, the `CardTypes` component is embedded here as a child and is imported nowhere else (`filters.ts` is its only consumer). These lists back the storefront card-type facet on `/buscar` (via `products_search.card_type_ids`) and the sub-type selects on the add-product / product-edit forms.

## Route & access

- **Path:** `/admin/filters` (child of the lazy `AdminShell` route; `canActivate: [adminGuard]` + `canActivateChild: [adminGuard]` on the parent `admin` route in `src/app/app.routes.ts`).
- **Sidenav:** group "Catálogo" → item `Filtros` (icon `tune`), no count badge.
- **Query params:** none — the active tab is component state only (not URL-persisted).

## Files

| File | Role |
|---|---|
| `src/app/admin/filters/filters.ts` | `Filters` component (`selector: 'app-admin-filters'`) — tab state, category-id resolution, tab counts |
| `src/app/admin/filters/filters.html` | Page header + `<app-underline-tabs>` + one `<app-admin-card-types>` instance |
| `src/app/admin/filters/filters.scss` | Only `.filters__loading` (padding + secondary text color) |
| `src/app/admin/card-types/card-types.ts` | `CardTypes` component (`selector: 'app-admin-card-types'`) — the embedded CRUD, inputs `categoryId` / `slugPrefix`, output `changed` |
| `src/app/admin/card-types/card-types.html` | Add card + mat-table of types |
| `src/app/admin/card-types/card-types.scss` | BEM styles under `.card-types__*` |
| `src/app/core/catalog/card-types.service.ts` | `CardTypesService` — Supabase reads/writes on `card_types` + count RPCs |
| `src/app/core/catalog/catalog.types.ts` | `CardTypeRow`, `CardTypeInsert`, `CardTypeUpdate` |
| `supabase/migrations/20260502030000_add_card_types.sql` | Base tables `card_types` + `product_card_types`, RLS, 26 legacy-OpenCart seed rows |
| `supabase/migrations/20260525002100_card_types_category_scope.sql` | Adds `card_types.category_id`, seeds sellado/accesorios sub-types |

## UI anatomy

1. `<app-page-header>` — `kicker="Catálogo"`, `title="Filtros"`, `sub="Clasificaciones por categoría — Rareza (multi) para singles, sub-tipos (uno) para producto sellado y accesorios"`. No projected action (the add button lives inside `CardTypes`).
2. `<app-underline-tabs [tabs]="tabs()" [(value)]="tab" />` — three `TabItem`s (type imported from `pill-tabs`): `{ key: 'singles', label: 'Singles' }`, `{ key: 'sellado', label: 'Producto sellado' }`, `{ key: 'accesorios', label: 'Accesorios' }`, each with a `count` from the `counts` signal.
3. When `ready()`: one `<app-admin-card-types [categoryId]="activeCategoryId()" [slugPrefix]="activeSlugPrefix()" (changed)="reloadCounts()" />`. Otherwise `<p class="filters__loading">Cargando…</p>`.

Inside `CardTypes` (per tab):

1. Add-row: `<app-btn variant="primary">` toggling `addOpen` — icon/label flip between `add`/`"Agregar"` and `close`/`"Cancelar"`.
2. **Add card** (`mat-card.card-types__add`, only while `addOpen()`): `addForm` fields — `Slug` (placeholder `full-art-pokemon`, hint `"Sólo minúsculas, números y guiones."`), `Nombre` (placeholder `Full Art Pokémon`), `Orden` (number, `.card-types__sort-field`), then `<app-btn variant="primary">Crear</app-btn>` disabled while invalid or `saving() === '__new__'`.
3. `mat-progress-bar mode="indeterminate"` while `loading()`.
4. `<app-table-card>` → `.card-types__scroll` → `table[mat-table].app-table.app-table--cozy` with `displayedColumns = ['slug', 'name', 'sort_order', 'active', 'actions']`:
   - **Slug** — read-only `span.app-slug-chip`.
   - **Nombre** — `<app-editable-input>` via `val()` / `setText()`.
   - **Orden** — `<app-editable-input [mono]="true" align="right" [width]="70">` via `setNum()`; `is-right`.
   - **Activo** — `<app-toggle [on]="row.active">`, disabled while `saving() === row.id`, fires `onToggleActive` immediately.
   - **actions** — `<app-btn variant="ghost" size="sm">Guardar</app-btn>`, disabled when the row form is invalid, pristine, or saving.
5. Empty state: `"Aún no hay tipos. Crea el primero con el botón de arriba."` (`.card-types__empty`).

Shared primitives per [design-manifest](../../design-manifest.md).

## Services & backend

`CardTypesService` (root-provided), all through `SupabaseService.client`:

- `list(opts?: { activeOnly?: boolean; categoryId?: string | null })` → `from('card_types').select('*')` ordered by `sort_order` asc then `name` asc. **Scoping is presence-based:** if the `categoryId` key is present and `null`, filters `is('category_id', null)` (global Rareza); a uuid filters `eq('category_id', id)`; omitting the key returns all rows (used by add-product / product-edit which then split by `category_id` themselves).
- `create(input: CardTypeInsert)` / `update(id, patch)` / `setActive(id, active)` — plain table writes.
- `counts()` → RPC `card_type_product_counts` — per-type in-stock product counts, session-cached (`countsCache` signal + `countsInflight` de-dupe, `invalidateCounts()`); storefront facet, **not called by this screen**.
- `countsForQuery(q, { onSaleOnly, categorySlug })` → RPC `search_card_type_counts` — `/buscar` faceted counts; also not called here.

Backend:

- Table `public.card_types` (`20260502030000_add_card_types.sql`): `id uuid pk`, `slug text not null unique`, `name text not null`, `active boolean default true`, `sort_order integer default 0`, `created_at`. Junction `public.product_card_types (product_id, card_type_id)` pk pair, both FKs `on delete cascade`.
- RLS: `card_types_public_read` (`active = true` to `anon, authenticated`), `card_types_admin_all` (`public.is_admin()`); same pattern for `product_card_types` (public read is `using (true)`).
- `20260525002100_card_types_category_scope.sql`: adds `category_id uuid references public.categories(id) on delete cascade` + index `card_types_category_idx`. Existing rows stay `category_id = NULL` = global. Seeds 6 `sellado-*` sub-types (ETB, Booster, Booster Box, Deck, Collection, UPC) and 9 `acc-*` sub-types (Protectores, Sleeves, Dados, Pines, Figuras, Monedas, Deckboxes, Playmats, Otros).

## State & data flow

`Filters` signals:

- `tab = signal('singles')` — active tab key.
- `selladoId` / `accesoriosId = signal<string | null>(null)` — resolved category ids.
- `counts = signal({ singles: 0, sellado: 0, accesorios: 0 })` — tab badges.
- `tabs = computed<TabItem[]>` — labels + counts.
- `activeCategoryId = computed` — `null` for singles, the resolved id for the other tabs.
- `activeSlugPrefix = computed` — `''` / `'sellado-'` / `'acc-'`.
- `ready = computed` — `true` for singles; category tabs wait until their id resolved.

Flow: constructor → `bootstrap()` → `categoriesService.list()`, find categories by **hard-coded slugs** `'sellado'` and `'accesorios'` (failure is swallowed — the Singles tab still works) → `reloadCounts()` runs three `cardTypesService.list()` calls in parallel (count failures are swallowed too: "Counts are decorative").

`CardTypes` signals: `rows`, `loading`, `saving = signal<string | null>(null)` (`'__new__'` for the add form), `addOpen`, plus `addForm` (`slug` required + pattern `/^[a-z0-9-]+$/`, `name` required, `sort_order` required + min 0) and `editForms = new Map<string, FormGroup>()` (per-row `name` + `sort_order`), rebuilt on every `refresh()`.

Because `categoryId` is a parent-bound input, `CardTypes` loads via a constructor `effect()` that reads `categoryId()` and calls `refresh()` — switching tabs re-runs the effect and refetches. `onAdd()` prepends `slugPrefix()` to the entered slug when it isn't already there (`prefix + raw.slug`), inserts with `category_id: this.categoryId()`, resets/closes the form, refreshes, emits `changed` (parent refreshes tab counts), snackbar `"Tipo creado"`. `onSave(row)` → `"Tipo actualizado"`. `onToggleActive` → `setActive` → refresh (no snackbar). Errors: `MatSnackBar.open(errorMessage(err), 'OK', { duration: 5000 })`, fallback `"Error desconocido"`.

## Behaviors & edge cases

- **No delete.** Types can only be deactivated. Deleting a row via SQL cascades the junction rows (products silently lose the tag).
- **Slug is create-only** in the UI (chip, no edit control); it is globally unique across all three scopes — hence the per-tab prefixes.
- Multi vs. single select is **enforced only in the product forms**, not in the data model: singles get a checkbox multi-select (`selectedCardTypeIds`), sealed/accessories a single select (`selectedSubtypeId`) — both ride the same `product_card_types` junction so `products_search.card_type_ids` and the filter plumbing are reused.
- Switching tabs discards any unsaved row edits (the effect refetches and rebuilds `editForms`).
- Tab counts include **inactive** types (plain `list()` length, no `activeOnly`).
- If the `sellado` / `accesorios` category slug lookups fail (or those categories don't exist), their tabs show `Cargando…` forever — `ready()` never turns true for them.

## Gotchas / invariants

- **CLAUDE.md drift:** the always-on notes and route table mention an `/admin/card-types` route ("categories, card-types, coupons…"). It does not exist — `src/app/app.routes.ts` has `path: 'filters'` and `CardTypes` is only ever rendered inside `Filters`. Document/route-map updates should say `filters`.
- The `categoryId` scoping in `CardTypesService.list()` is keyed on **key presence** (`'categoryId' in opts`), not value: `list({})` ≠ `list({ categoryId: null })`. Passing `categoryId: undefined` explicitly still counts as present and would build `.eq('category_id', undefined)` — always either include the key with `null`/uuid or omit it entirely.
- Category resolution hard-codes the slugs `'sellado'` and `'accesorios'`; renaming those category slugs breaks two of the three tabs silently.
- The seeded slug prefixes (`sellado-`, `acc-`) are convention, not constraint — `onAdd()` enforces them per tab, but SQL inserts can bypass them.
- `card_types_public_read` RLS means anonymous storefront reads only see `active = true` rows; this admin screen sees all rows because the admin JWT passes `is_admin()`.
- The tab counts effect chain is best-effort: a failed `reloadCounts()` leaves stale badge numbers with no error surfaced.

## Related docs

- [Categories](./categories.md) — the parent taxonomy the sellado/accesorios tabs scope to
- [Add product](./add-product.md) · [Product edit](./product-edit.md) — where types are assigned to products
- [Admin shell & nav](./admin-shell.md)
- [Search results (storefront facet consumer)](../storefront/search-results.md)
- [Data model](../../architecture/data-model.md) · [Routing & guards](../../architecture/routing-and-guards.md) · [Shared components](../../architecture/shared-components.md)
