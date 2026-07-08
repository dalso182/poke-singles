# Admin — Shipping methods

> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose

Single-screen CRUD for the shipping options customers pick at checkout (e.g. Correos de Costa Rica, Uber Flash, pickup). Everything happens inline: a collapsible add form at the top, per-row inline editing in the table (name, description, price, sort order, category scoping, `requires_address`), active toggles, and soft-delete with undo. `requires_address` decides whether checkout asks the buyer for a shipping address.

## Route & access

- **Path:** `/admin/shipping-methods`, lazy `loadComponent` → `ShippingMethods` from `src/app/admin/shipping-methods/shipping-methods.ts`.
- **Guards:** parent `/admin` route: `adminGuard` (`canActivate` + `canActivateChild`).
- **Query params:** none. Tab filter and the add-panel state are in-memory signals.

## Files

- `src/app/admin/shipping-methods/shipping-methods.ts` — `ShippingMethods` component (selector `app-admin-shipping-methods`): add form, per-row edit `FormGroup` map, filter tabs, save/toggle/delete handlers.
- `src/app/admin/shipping-methods/shipping-methods.html` — header + add panel + pill tabs + inline-editable table.
- `src/app/admin/shipping-methods/shipping-methods.scss` — `.shipping-methods__*` styles.
- `src/app/core/catalog/shipping-methods.service.ts` — `ShippingMethodsService` (admin CRUD + the customer-facing `listActive`).
- `src/app/core/catalog/catalog.types.ts` — `ShippingMethodRow`, `ShippingMethodInsert`, `ShippingMethodUpdate`.

## UI anatomy

1. **`<app-page-header>`** — kicker `"Logística"`, title `"Métodos de envío"`, sub `"Las opciones que el cliente elige al hacer checkout. Crea las que necesites (Correos de Costa Rica, Uber Flash, recoger en persona…)"`. Projected `<app-btn variant="primary">` toggles `addOpen` — icon/label flip between `add` / `"Agregar método"` and `close` / `"Cancelar"`.
2. **Add panel** (shown when `addOpen()`) — `<app-form-section [padding]="18">` containing `addForm`:
   - `"Nombre"` (placeholder `"Correos de Costa Rica"`), `"Descripción (opcional)"` (placeholder `"3-5 días hábiles"`), `"Precio (CRC)"` (`min="0" step="100"`), `"Orden"` (`min="0"`), `<app-labeled-toggle formControlName="requires_address">` `"Requiere dirección"`, and `"Categorías permitidas"` `mat-select multiple` over `categories()` with hint `"Vacío = disponible para todas las categorías."`. Submit `<app-btn variant="primary">` `"Crear"` (disabled while invalid or `saving() === '__new__'`).
3. **`<app-pill-tabs>`** (`.shipping-methods__tabs`) — `"Activos"` / `"Inactivos"` / `"Eliminados"` (keys `active` / `inactive` / `deleted`) with counts.
4. **`<mat-progress-bar>`** while `loading()`.
5. **`<app-table-card>`** with `mat-table` (`.app-table.app-table--cozy`, inside `.shipping-methods__scroll`). Columns (`displayedColumns`):
   - `name` (`"Nombre"`) / `description` (`"Descripción"`, placeholder `"Sin descripción"`) — `<app-editable-input>` bound through the row's `FormGroup` bridge helpers.
   - `price` (`"Precio"`, right) — `₡` prefix (`.shipping-methods__currency`) + monospace right-aligned `<app-editable-input [width]="70">`.
   - `sort_order` (`"Orden"`, right) — monospace `<app-editable-input [width]="50">`.
   - `allowed_categories` (`"Categorías"`) — inline `mat-select multiple` (`.shipping-methods__cat-cell`, `subscriptSizing="dynamic"`, `panelClass="admin-form-overlay"`); hint `"Todas"` shown when the selection is empty.
   - `requires_address` (`"Dirección"`, centered) — `<app-toggle>` writing into the row form (not saved until `"Guardar"`).
   - `is_active` (`"Activo"`, centered) — `<app-toggle>` that saves immediately via `onToggleActive`.
   - `actions` — for live rows: `<app-btn variant="ghost" size="sm">` `"Guardar"` (disabled when the row form is invalid, pristine, or saving) + `<app-icon-btn label="Eliminar" tone="danger">` (`delete_outline`). Deleted rows show dimmed `"Eliminado"`.
6. **Empty state** — `"Sin métodos en este filtro. Crea uno con el botón de arriba."` (`.shipping-methods__empty`).

## Services & backend

`ShippingMethodsService`, all against Supabase table **`shipping_methods`** (no RPCs):

- `list({ includeDeleted })` — `select('*')` ordered by `sort_order asc`, then `name asc`; this screen passes `includeDeleted: true`.
- `listActive()` — customer-facing: `deleted_at IS NULL`, `is_active = true`, same ordering (used by checkout, not this screen).
- `get(id)`, `create(input)`, `update(id, patch)`, `setActive(id, active)`, `softDelete(id)` (sets `deleted_at = now ISO`), `restore(id)` (clears it).

Row columns (see `ShippingMethodRow`): `id`, `name`, `description`, **`requires_address: boolean`**, `price`, `sort_order`, `is_active`, **`allowed_category_ids: string[]`** (empty = serves all categories), `deleted_at`, `created_at`, `updated_at`.

`CategoriesService.list({ activeOnly: true })` supplies the options for both category multi-selects.

## State & data flow

- `rows: signal<ShippingMethodRow[]>`, `categories: signal<CategoryRow[]>`, `loading: signal(false)`.
- `saving: signal<string | null>` — holds the in-flight row id, or the sentinel `'__new__'` for the add form.
- `addOpen: signal(false)` — add-panel visibility.
- `filter: signal<ShippingFilter>('active')` — `'active' | 'inactive' | 'deleted'`; `visibleRows` / `tabs` computeds filter and count client-side (`active` = not deleted + `is_active`; `inactive` = not deleted + `!is_active`; `deleted` = `deleted_at` set).
- `addForm: FormGroup` — `name` required; `price` `[required, min(0)]`; `sort_order` `[required, min(0)]`; `requires_address` default `true`; `allowed_category_ids` default `[]`.
- `editForms: Map<string, FormGroup>` — rebuilt from scratch on every `refresh()`; one form per row with the same validator shape. Bridge helpers between the FormControls and the signal-based primitives: `val` / `boolVal` / `setText` / `setNum` / `setBool` / `categoryIdsVal` / `setCategoryIds` (setters mark the control dirty so `"Guardar"` enables).
- Load: constructor → `refresh()` → `Promise.all([service.list({ includeDeleted: true }), categoriesService.list({ activeOnly: true })])`. Reload triggers: after `onAdd`, `onSave`, `onToggleActive`, `onDelete`, `onRestore`.

## Behaviors & edge cases

- **Add** (`onAdd`): trims name/description (empty description → `null`), numbers coerced, creates, resets the form to defaults (`requires_address: true`), closes the panel, refreshes, snackbar `"Método de envío creado"` (3000 ms).
- **Inline save** (`onSave`): sends the full row form as an update patch; snackbar `"Método actualizado"`. `requires_address` and `allowed_category_ids` changes only persist through this button — the toggles/select just dirty the local form.
- **`is_active` toggle** persists immediately (`setActive` + refresh), independent of the row form.
- **Soft-delete + undo** — `onDelete` → `softDelete` + refresh + snackbar `"Método eliminado"` with `"Deshacer"` action (5000 ms) → `onRestore` restores. Deleted rows render all inputs disabled.
- **Errors** — snackbar with the raw message or `"Error desconocido"` (5000 ms).
- **`requires_address` semantics downstream:** at checkout, `PlaceOrderInput.buyer.address` is `null` when the chosen method has `requires_address = false` (documented on the type); the order-detail screen then shows `"Sin dirección registrada."`.
- **`allowed_category_ids` semantics:** empty array = method offered for any cart; a non-empty list restricts the method to carts whose items fall in those categories (enforced by the checkout/`place_order` flow, not here).

## Gotchas / invariants

- `refresh()` rebuilds `editForms` from scratch, so any successful mutation (including an unrelated row's toggle) **discards unsaved inline edits on every other row** without warning.
- Setting `is_active` via its toggle also wipes pending edits on the same row for the same reason (refresh happens immediately).
- Unlike coupons, `allowed_category_ids` empty is stored as `[]` (column is non-null array), while `coupons.category_ids` uses `null` for "all" — don't copy patterns blindly between the two.
- `saving` uses the magic string `'__new__'` for the add form; row ids are UUIDs so no collision is possible, but it is a sentinel to be aware of.
- Numeric editable-inputs coerce through `Number(value) || 0` — non-numeric input silently becomes `0`.
- The soft-delete undo snackbar lasts 5000 ms; after that the only path to recover a method is the `Eliminados` tab… which has **no restore button** — restore is only reachable through the snackbar action. A deleted row can otherwise only be recreated.
- No uniqueness constraint is checked client-side on `name` — duplicates are allowed.

## Related docs

- [Checkout (customer picks a method)](../storefront/checkout.md)
- [Order detail (shipping snapshot)](./order-detail.md)
- [Categories admin](./categories.md)
- [Commerce flow](../../architecture/commerce-flow.md)
- [Data model](../../architecture/data-model.md)
- [Shared table primitives](../../design-manifest.md)
