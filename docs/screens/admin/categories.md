# Admin — Categories (Categorías)

> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose

CRUD for the top-level catalog taxonomy (`categories` table): singles, sealed product, accessories, raffles, etc. Every product belongs to exactly one category (`products.category_id`, FK `on delete restrict`). The screen is a single inline-editable table with an expandable "add" form — no detail route, no delete.

## Route & access

- **Path:** `/admin/categories` (child of the lazy `AdminShell` route, `canActivate: [adminGuard]` + `canActivateChild: [adminGuard]` on the parent `admin` route in `src/app/app.routes.ts`).
- **Sidenav:** group "Catálogo" → item `Categorías` (icon `category`), no count badge.
- **Query params:** none.

## Files

| File | Role |
|---|---|
| `src/app/admin/categories/categories.ts` | `Categories` component (`selector: 'app-admin-categories'`) — state, add/save/toggle handlers |
| `src/app/admin/categories/categories.html` | Template: page header, collapsible add card, mat-table |
| `src/app/admin/categories/categories.scss` | BEM styles under `.categories__*` |
| `src/app/core/catalog/categories.service.ts` | `CategoriesService` — Supabase reads/writes on `categories` + `search_category_counts` RPC (storefront facet, not used here) |
| `src/app/core/catalog/catalog.types.ts` | `CategoryRow`, `CategoryInsert`, `CategoryUpdate` shapes |

## UI anatomy

Top to bottom (shared primitives per [design-manifest](../../design-manifest.md)):

1. `<app-page-header>` — `kicker="Catálogo"`, `title="Categorías"`, `sub="Taxonomía superior — singles, sealed, accesorios"`. Projected action: an `<app-btn variant="primary">` toggling `addOpen` — label flips between `"Agregar categoría"` (icon `add`) and `"Cancelar"` (icon `close`).
2. **Add card** (`mat-card.categories__add`, shown only while `addOpen()`): reactive `addForm` with outline `mat-form-field`s — `Slug` (placeholder `singles`, hint `"Sólo minúsculas, números y guiones."`), `Nombre` (placeholder `Singles`), `Orden` (number, `.categories__sort-field`), then an `<app-btn variant="primary">Crear</app-btn>` disabled while invalid or `saving() === '__new__'`.
3. `mat-progress-bar mode="indeterminate"` while `loading()`.
4. `<app-table-card>` wrapping `.categories__scroll` → `table[mat-table].app-table.app-table--cozy` with `displayedColumns = ['slug', 'name', 'sort_order', 'active', 'actions']`:
   - **Slug** — read-only `span.app-slug-chip` (slug is create-only; no edit control).
   - **Nombre** — `<app-editable-input>` bound to the row's edit form via `val()` / `setText()`.
   - **Orden** — `<app-editable-input [mono]="true" align="right" [width]="70">` via `setNum()`; header/cell class `is-right`.
   - **Activa** — `<app-toggle [on]="row.active">`, disabled while `saving() === row.id`, fires `onToggleActive` immediately.
   - **actions** — `<app-btn variant="ghost" size="sm">Guardar</app-btn>`, disabled when the row form is invalid, pristine, or saving.
5. Empty state inside the table card: `"Aún no hay categorías. Crea la primera con el botón de arriba."` (`.categories__empty`, only when `!loading() && rows().length === 0`).

## Services & backend

`CategoriesService` (root-provided), all through `SupabaseService.client`:

- `list(opts?: { activeOnly?: boolean })` → `from('categories').select('*')` ordered by `sort_order` asc then `name` asc. The screen calls it without options (inactive rows included).
- `create(input: CategoryInsert)` → `insert(...).select('*').single()`.
- `update(id, patch: CategoryUpdate)` → `update(...).eq('id', id).select('*').single()`.
- `setActive(id, active)` → sugar over `update`.
- `countsForQuery(q, { onSaleOnly })` → RPC `search_category_counts` — storefront `/products` "Categoría" facet counts; **not called by this screen**.

Backend (from `supabase/migrations/20260501205916_initial_catalog_schema.sql`): table `public.categories` (`id uuid pk`, `slug text not null unique`, `name text not null`, `active boolean default true`, `sort_order integer default 0`, `created_at`). RLS: `categories_public_read` (`active = true` to `anon, authenticated`), `categories_admin_all` (`public.is_admin()` for all ops). Writes from this screen work only because the admin JWT passes `is_admin()` (`app_metadata.role = 'admin'`).

## State & data flow

Signals on `Categories`:

- `rows = signal<CategoryRow[]>([])` — table data.
- `loading = signal(false)` — progress bar.
- `saving = signal<string | null>(null)` — id of the row being written, `'__new__'` for the add form; drives per-row disabling.
- `addOpen = signal(false)` — add-card visibility.
- `addForm` — `fb.nonNullable.group({ slug, name, sort_order })`; slug validators `Validators.required` + `Validators.pattern(/^[a-z0-9-]+$/)`; `sort_order` `required` + `min(0)`, default `0`.
- `editForms = new Map<string, FormGroup>()` — one form per row (`name` required, `sort_order` required + min 0), rebuilt on every `refresh()`.

Flow: constructor calls `refresh()` (fire-and-forget) → `service.list()` → sets `rows`, clears and rebuilds `editForms`. `onAdd()` → `create` → reset form to `{ slug: '', name: '', sort_order: 0 }`, close card, `refresh()`, snackbar `"Categoría creada"`. `onSave(row)` → `update(row.id, form.getRawValue())` → snackbar `"Categoría actualizada"` → `refresh()`. `onToggleActive(row, active)` → `setActive` → `refresh()` (no snackbar). All errors surface via `MatSnackBar.open(errorMessage(err), 'OK', { duration: 5000 })`, fallback text `"Error desconocido"`.

## Behaviors & edge cases

- **No delete.** Categories can only be deactivated; `products.category_id` is `on delete restrict` anyway.
- **Slug is create-only** — rendered as a chip, never editable, because product routing/facets (`?categoria=` on `/products`) and code lookups (`slug === 'singles' | 'sellado' | 'accesorios' | 'rifas'`) key on it.
- Editable cells mark their control dirty on change; the row's `Guardar` stays disabled until something is dirty and valid.
- Any successful save/toggle re-fetches the whole list and **rebuilds all edit forms**, discarding unsaved edits in other rows.
- Add form and each row share the single `saving` slot, so only one write is in flight at a time from the UI's perspective (buttons disable per matching id only).
- Loading failure leaves the previous rows in place and shows the error snackbar.

## Gotchas / invariants

- **Deactivating a category does not hide its products.** `products_public_read` RLS checks only `active = true and quantity > 0` on the product row and `products_search` does not filter on the category's `active` flag — an inactive category disappears from the storefront category facet (RLS on `categories`) while its products remain searchable/purchasable.
- Several core code paths hard-code category slugs (`singles`, `sellado`, `accesorios`, `rifas`) — e.g. the Filters screen, the price-review scope, and the raffles admin. Renaming a slug (impossible here, but possible via SQL) would silently break them.
- `refresh()` is called from the constructor without `await`/`void` — a floating promise; harmless but note the pattern repeats in Sellers and Sets.
- `list()` runs with the caller's RLS: for a non-admin it would return only active categories. This screen is admin-gated so all rows appear.
- The `search_category_counts` RPC lives in this service but belongs to the storefront; don't remove it when touching the admin screen.

## Related docs

- [Filters (card types per category)](./filters.md)
- [Sets](./sets.md)
- [Sellers](./sellers.md)
- [Products list](./products-list.md) · [Add product](./add-product.md)
- [Admin shell & nav](./admin-shell.md)
- [Data model](../../architecture/data-model.md) · [Routing & guards](../../architecture/routing-and-guards.md) · [Shared components](../../architecture/shared-components.md)
