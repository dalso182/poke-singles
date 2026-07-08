# Admin — Coupons list

> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose

Back-office list of all discount coupons. Admins can filter by lifecycle state (active / inactive / expired / soft-deleted), search by code, toggle `is_active` inline, soft-delete with an undo snackbar, and jump to the create/edit form. All filtering is client-side over one full fetch.

## Route & access

- **Path:** `/admin/coupons` (`pathMatch: 'full'`), lazy `loadComponent` → `Coupons` from `src/app/admin/coupons/coupons.ts`.
- **Guards:** the whole `/admin` branch is behind `adminGuard` (`canActivate` + `canActivateChild` on the parent route in `src/app/app.routes.ts`).
- **Query params:** none. Filter tab and search text are in-memory signals only — not URL-synced; a reload resets to the `active` tab with empty search.

## Files

- `src/app/admin/coupons/coupons.ts` — `Coupons` component (selector `app-admin-coupons`): signals, client-side filtering, toggle/delete/restore handlers.
- `src/app/admin/coupons/coupons.html` — page header, pill-tab + search toolbar, Material table.
- `src/app/admin/coupons/coupons.scss` — `.coupons__*` block styles (toolbar, scroll wrapper, actions, empty state).
- `src/app/core/catalog/coupons.service.ts` — `CouponsService` (all CRUD + soft-delete methods; shared with the edit screen).
- `src/app/core/catalog/catalog.types.ts` — `CouponRow`, `CouponInsert`, `CouponUpdate`, `CouponType` (`'PERCENTAGE' | 'FIXED_ON_THRESHOLD'`).

## UI anatomy

Top to bottom:

1. **`<app-page-header>`** — kicker `"Promoción"`, title `"Cupones"`, sub `"Descuentos por porcentaje o monto fijo con mínimo de compra"`. Projected action: `<app-btn variant="primary">` with `add` icon, label `"Crear cupón"` → `goToNew()`.
2. **Toolbar** (`.coupons__toolbar`) — `<app-pill-tabs>` bound to `filterTabs()`/`filter()`, and `<app-search-input>` two-way bound to `searchText`, placeholder `"Buscar por código"`. Tab labels + live counts: `"Activos"`, `"Inactivos"`, `"Vencidos"`, `"Eliminados"` (keys `active` / `inactive` / `expired` / `deleted`).
3. **`<mat-progress-bar mode="indeterminate">`** while `loading()`.
4. **`<app-table-card>`** wrapping a `mat-table` (`.app-table.app-table--comfy`, inside `.coupons__scroll`). Columns (`displayedColumns`):
   - `code` — header `"Código"`; monospace code plus optional `.coupons__name` line with `row.name`.
   - `type` — header `"Tipo"`; `typeLabel()` → `"Porcentaje"` or `"Monto fijo con mínimo"`.
   - `value` — header `"Valor"` (right-aligned); `{{ discount_value }}%` for `PERCENTAGE`, otherwise `<app-money>`.
   - `min_purchase` — header `"Compra mínima"`; `<app-money>` or dimmed `—`.
   - `expires` — header `"Vence"`; `expires_at | date:'mediumDate'`, class `.coupons__expired` when `isExpired(row)`.
   - `max_uses_per_user` — header `"Usos/cliente"`.
   - `is_active` — header `"Activo"`; `<app-toggle>` (disabled while that row is saving or when `deleted_at` is set).
   - `actions` — for live rows a `.coupons__actions` group: `<app-btn variant="ghost" size="sm">` `"Editar"` → `goToEdit(id)` and `<app-icon-btn label="Eliminar" tone="danger">` with `delete_outline` icon → `onDelete(row)`. For soft-deleted rows just the dimmed text `"Eliminado"`.
5. **Empty state** — `.coupons__empty` paragraph `"Sin cupones que coincidan con el filtro."` when not loading and `visibleRows()` is empty.

Shared table primitives (`app-page-header`, `app-pill-tabs`, `app-search-input`, `app-table-card`, `app-money`, `app-toggle`, `app-btn`, `app-icon-btn`) come from `src/app/shared/table/` — see the design manifest.

## Services & backend

`CouponsService` (`providedIn: 'root'`), everything against Supabase table **`coupons`** via PostgREST (no RPCs):

- `list(params: CouponListParams)` — `select('*')` ordered `created_at desc`; `includeDeleted` skips the `deleted_at IS NULL` filter; `search` does an ILIKE on `code` with `%`/`_` escaped. **This screen always calls `list({ includeDeleted: true })` and ignores the service-side `search` param** — searching/filtering happens client-side.
- `setActive(id, active)` — `update({ is_active })`.
- `softDelete(id)` — `update({ deleted_at: new Date().toISOString() })`.
- `restore(id)` — `update({ deleted_at: null })`.
- Also on the service (used by the edit screen): `get`, `create`, `update`, `existsByCode`.

Writes rely on the admin RLS policy on `coupons`; non-admins get empty results/failed writes.

## State & data flow

Signals on `Coupons`:

- `rows: signal<CouponRow[]>` — the full fetched set (including deleted).
- `loading: signal(false)` — drives the progress bar.
- `saving: signal<string | null>` — id of the row with an in-flight toggle/delete (disables that row's controls).
- `filter: signal<CouponFilter>('active')` — `CouponFilter = 'active' | 'inactive' | 'expired' | 'deleted'`.
- `searchText: signal('')` → `searchValue = toSignal(toObservable(searchText).pipe(debounceTime(200), distinctUntilChanged()))`.
- `visibleRows = computed(...)` — case-insensitive `code` substring match, then per-tab predicate: `active` = not deleted, `is_active`, not expired; `inactive` = not deleted, `!is_active`; `expired` = not deleted and `new Date(expires_at).getTime() <= Date.now()`; `deleted` = `deleted_at` set.
- `filterTabs = computed<TabItem[]>` — same predicates, produces counts for the pill tabs.

Load: constructor calls `refresh()` → `service.list({ includeDeleted: true })`. Reload triggers: after every successful `onToggleActive`, `onDelete`, and `onRestore`. Filter/search changes never refetch — pure computed re-filtering.

## Behaviors & edge cases

- **Errors** — every failed service call opens a `MatSnackBar` with the error message (fallback `"Error desconocido"`), action `"OK"`, 5000 ms.
- **Soft-delete + undo** — `onDelete` calls `softDelete`, refreshes, then opens snackbar `"Cupón eliminado"` with action `"Deshacer"` (5000 ms); the action calls the private `onRestore(id)` → `restore` + refresh. No hard delete exists in the UI.
- **Toggle** — `onToggleActive` optimism-free: awaits `setActive` then full `refresh()`. The toggle is disabled for deleted rows.
- **Expiry** — `isExpired()` compares `expires_at` against `Date.now()` with `<=`; expired rows get the `.coupons__expired` styling on the date cell.
- **Tab guard** — `onFilterChange` only accepts the four known keys (pill-tabs emit strings).
- **Navigation** — `goToNew()` → `/admin/coupons/new`; `goToEdit(id)` → `/admin/coupons/:id/edit`.

## Gotchas / invariants

- **A coupon can appear under two tabs**: an expired coupon with `is_active = false` matches both `"Inactivos"` and `"Vencidos"` (the tab predicates are not mutually exclusive), so tab counts can sum to more than the number of coupons.
- **The `is_active` toggle is not blocked for expired coupons** — you can flip an expired coupon "on", but it stays in the `Vencidos` tab (the `active` tab predicate also requires not-expired) and `validate_coupon` will still reject it at checkout.
- The service's `search` ILIKE param is dead weight for this screen (client-side filtering is used instead); it escapes `%`/`_` but not the escape character itself.
- Filter/search state is not reflected in the URL — deep-linking to a tab is impossible.
- Every row mutation triggers a full table refetch (`refresh()`), including the undo path — cheap at current coupon volumes, but O(all coupons) per click.
- Soft-deleted rows keep their `is_active` value; only `deleted_at` distinguishes them. Restoring returns the coupon to whatever active/expired state it had.

## Related docs

- [Coupon create/edit form](./coupon-edit.md)
- [Reports (coupon redemptions)](./reports.md)
- [Admin shell & nav](./admin-shell.md)
- [Data model](../../architecture/data-model.md)
- [Backend RPCs & functions](../../architecture/backend-rpcs-and-functions.md) — `validate_coupon`, `calculate_coupon_discount`
- [Commerce flow](../../architecture/commerce-flow.md)
- [Shared table primitives](../../design-manifest.md)
