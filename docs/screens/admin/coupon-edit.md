# Admin — Coupon create / edit

> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose

Single reactive form used for both creating and editing a coupon: code, optional display name, discount type (`PERCENTAGE` or `FIXED_ON_THRESHOLD`), value, minimum purchase, expiry date, per-customer use cap, active flag, and category scoping. Includes a pre-flight code-uniqueness check before submitting.

## Route & access

- **Paths:** `/admin/coupons/new` and `/admin/coupons/:id/edit` — both lazy-load the same `CouponEdit` component from `src/app/admin/coupons/coupon-edit.ts`.
- **Guards:** parent `/admin` route: `adminGuard` (`canActivate` + `canActivateChild`).
- **Params:** `:id` is read via `this.route.snapshot.paramMap.get('id')` in `ngOnInit` (NOT via `withComponentInputBinding` input). Present → edit mode; absent → new mode.
- **Query params:** none.

## Files

- `src/app/admin/coupons/coupon-edit.ts` — `CouponEdit` component (selector `app-admin-coupon-edit`), form definition, validators, submit logic; module-level helpers `defaultExpiry(days)` and `toIsoDate(value)`.
- `src/app/admin/coupons/coupon-edit.html` — form template using shared form primitives + Material fields.
- `src/app/admin/coupons/coupon-edit.scss` — `.coupon-edit` block styles.
- `src/app/core/catalog/coupons.service.ts` — `CouponsService.get / create / update / existsByCode`.
- `src/app/core/catalog/categories.service.ts` — `CategoriesService.list()` feeds the category multi-select.
- `src/app/core/catalog/catalog.types.ts` — `CouponRow`, `CouponInsert`, `CouponType`, `CategoryRow`.

## UI anatomy

Wrapped in `.coupon-edit`:

1. **`<app-back-header>`** — kicker `"Promoción"`, title `"Editar cupón"` (edit) or `"Crear cupón"` (new), `backLink="/admin/coupons"`.
2. **`<mat-progress-bar mode="indeterminate">`** while `loading()` (edit-mode fetch).
3. **`<form [formGroup]="form">`** → `<app-form-section>` → `<app-form-grid [cols]="2">` with fields (all `mat-form-field appearance="outline"`):
   - **Nombre** — label `"Nombre — opcional"`, placeholder `"Black Friday 550"`, hint `"Etiqueta para identificarlo en la lista y los reportes."` (`name` control).
   - **Código** — label `"Código"`, placeholder `"BIENVENIDO15"`, monospace, `(blur)="onCodeBlur()"`. Hint `"Solo mayúsculas, números y guiones. Mínimo 3 caracteres."`. Errors: `duplicate` → `"Ese código ya está en uso."`, `pattern` → `"Solo mayúsculas, números y guiones."`, `minlength` → `"Mínimo 3 caracteres."`.
   - **Tipo** — `mat-select` (`panelClass="admin-form-overlay"`) with options `"Porcentaje"` (`PERCENTAGE`) and `"Monto fijo con mínimo"` (`FIXED_ON_THRESHOLD`).
   - **Categorías aplicables** — `mat-select multiple` over `categories()`, control `category_ids`, hint `"Vacío = aplica a todas las categorías."`.
   - **Valor** — label switches on type: `"Porcentaje (%)"` vs `"Monto del descuento (CRC)"`; number input `min="0" step="0.01"`. Errors: `max` → `"El porcentaje no puede ser mayor a 100."`, `min` → `"Debe ser mayor a 0."`.
   - **Compra mínima** — label `"Compra mínima (CRC)"` plus `" — opcional"` suffix unless the type is `FIXED_ON_THRESHOLD`; error `required` → `"Requerido para descuentos por monto fijo."`.
   - **Vence** — `matDatepicker` (native date adapter via `provideNativeDateAdapter()` on the component's `providers`), toggle suffix, panel class `admin-form-overlay`.
   - **Usos por cliente** — number input `min="1"`, hint `"Cuántas veces puede usarlo el mismo cliente."` (`max_uses_per_user`).
   - **`<app-labeled-toggle formControlName="is_active">`** — label `"Activo"`.
4. **`<app-form-footer>`** — primary label `"Guardar cambios"` (edit) / `"Crear cupón"` (new); `primaryDisabled` when `form.invalid || form.pristine || saving()`; `[sticky]="false"`; secondary → `cancel()` (navigates back to `/admin/coupons`).

## Services & backend

- `CouponsService.get(id)` — `coupons` `select('*') … maybeSingle()` (edit-mode load).
- `CouponsService.existsByCode(code, exceptId?)` — head-count query on `coupons` filtered `eq('code', code)` (+ `neq('id', exceptId)` in edit mode). Pre-flight duplicate check; the DB unique constraint on `coupons.code` is the real backstop and surfaces its own error if the check races.
- `CouponsService.create(input: CouponInsert)` / `update(id, patch)` — insert/update on `coupons` with `select('*').single()` return.
- `CategoriesService.list()` — reads `categories` for the scoping multi-select.
- The saved `category_ids` column (`string[] | null` on `coupons`) is what `validate_coupon` / `calculate_coupon_discount` and the storefront cart use to scope the discount to eligible cart lines (`null` = all categories).

## State & data flow

- `id: signal<string | null>` — set from the route param; `mode = computed<'new' | 'edit'>` from it.
- `loading: signal(false)` — edit-mode fetch; `saving: signal(false)` — submit in flight.
- `categories: signal<CategoryRow[]>` — loaded in `ngOnInit` via `loadCategories()`.
- `form: FormGroup` (`fb.nonNullable.group`):
  - `code` — `[Validators.required, Validators.minLength(3), Validators.pattern(/^[A-Z0-9-]+$/)]`
  - `name` — no validators
  - `type` — default `'PERCENTAGE'`, required
  - `discount_value` — default `0`, `[required, min(0.01)]` (plus conditional `max(100)`, see below)
  - `min_purchase_amount` — default `null`
  - `expires_at` — default `defaultExpiry(30)` (today + 30 days at 23:59:59.999 local), required
  - `max_uses_per_user` — default `1`, `[required, min(1)]`
  - `is_active` — default `true`
  - `category_ids` — default `[]` (empty = all categories)
- A constructor `effect()` intends to swap validators per type: `PERCENTAGE` → `discount_value` gets `max(100)` and `min_purchase_amount` gets optional `min(0.01)`; `FIXED_ON_THRESHOLD` → `min_purchase_amount` becomes `[required, min(0.01)]`. **See Gotchas — this effect has no signal dependencies.**
- Edit-mode load (`loadExisting`): `patchValue` from the row (`expires_at` wrapped in `new Date(...)`, `category_ids ?? []`), then `markAsPristine()`. Missing row → snackbar `"Cupón no encontrado."` and redirect to `/admin/coupons`.
- Submit (`onSubmit`): bail + `markAllAsTouched()` if invalid or saving → normalize code (`trim().toUpperCase()`) → `existsByCode` (duplicate: sets the `duplicate` error and snackbar `"Ese código ya está en uso."`) → build `CouponInsert` payload (`name` empty → `null`; `expires_at` via `toIsoDate` → `Date.toISOString()`; `category_ids` empty array → **`null`**) → `update` or `create` → snackbar `"Cupón actualizado"` / `"Cupón creado"` (3000 ms) → navigate to `/admin/coupons`.

## Behaviors & edge cases

- `onCodeBlur()` trims and uppercases the code in place (no `emitEvent`), so lowercase typing passes the `^[A-Z0-9-]+$` pattern after blur.
- Duplicate handling is two-layered: client pre-flight (`existsByCode`, excluding the current id in edit mode) plus the DB unique constraint whose raw error message lands in the snackbar if the pre-flight races.
- All service failures surface via `MatSnackBar` (`errorMessage()` fallback `"Error desconocido"`, 5000 ms).
- Primary button is disabled while the form is pristine, so an unchanged edit cannot be re-saved.
- Category scoping is stored on the `coupons` row itself (`category_ids uuid[]`-style column), not a join table.

## Gotchas / invariants

- **Suspected bug — type-conditional validators never re-apply.** The constructor `effect(() => { const type = this.form.controls['type'].value; … })` reads a plain `FormControl.value`, which is not a signal, so the effect has zero tracked dependencies and runs exactly once (with the initial `'PERCENTAGE'`). Consequences: (a) switching the select to `"Monto fijo con mínimo"` does not make `Compra mínima` required, and `discount_value` keeps the `max(100)` cap; (b) editing an existing `FIXED_ON_THRESHOLD` coupon whose `discount_value > 100` renders the form invalid and the save button stays disabled. A `valueChanges` subscription (or signal forms) is what the code seems to have intended.
- **Datepicker expiry lands at local midnight.** `defaultExpiry(30)` sets 23:59:59.999 local only for the initial new-coupon value; any date picked in the datepicker is midnight local, so the coupon expires at the *start* of the chosen day once converted with `toISOString()`.
- `toIsoDate` silently falls back to `new Date().toISOString()` (now) for non-Date/non-string values.
- Empty `category_ids` selection is persisted as `null`, not `[]` — downstream logic (`validate_coupon`, `AppliedCoupon.category_ids`) treats `null`/empty as "all categories".
- `code` is intentionally excluded from `CouponUpdate`'s required shape but this form always sends it — editing a code is allowed.
- The route param is read from a snapshot, so in-place navigation between `/new` and `/:id/edit` without component destruction would not reload (not reachable through current UI).

## Related docs

- [Coupons list](./coupons.md)
- [Categories admin](./categories.md)
- [Cart page (customer coupon apply)](../storefront/cart-page.md)
- [Checkout](../storefront/checkout.md)
- [Backend RPCs & functions](../../architecture/backend-rpcs-and-functions.md) — `validate_coupon`, `calculate_coupon_discount`, `get_my_applied_coupon`
- [Data model](../../architecture/data-model.md)
- [Shared table/form primitives](../../design-manifest.md)
