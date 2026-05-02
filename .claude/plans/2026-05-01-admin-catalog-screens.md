# Admin catalog screens (products, categories, sets)

## Context

The schema plan from `2026-05-01-products-categories-sets-schema.md` lands `categories`, `sets`, and `products` in Supabase. This plan builds the admin UI on top of those tables so an authenticated admin can actually run the catalog: list / search / create / edit / soft-delete products, manage the category taxonomy, and view the set dimension. Today the admin shell exists with a sidenav listing five items (Dashboard, Agregar producto, Productos, Pedidos, Clientes), but only Dashboard and `/admin/products/new` resolve — and Agregar producto is a stub that uses the TCGdex typeahead to log the selected card to the console without persisting anything. After this plan, the catalog half of admin (the half tied to the schema we just planned) is fully wired.

**Hard prerequisite:** the schema migration from the previous plan must be applied (`db:push:dev`). RLS allows public read of available products only; admin write requires `app_metadata.role = 'admin'`. We do not yet have auth — see *Things I'd flag* at the bottom.

## Approach

Three CRUD screens (Productos, Categorías, Sets) plus an extension of the existing `add-product` page from a typeahead demo into a real new-product form. All pages talk to Supabase through three thin per-table services in `src/app/core/catalog/` so the components stay declarative. Reactive Forms throughout (matches `CardTypeahead`'s existing pattern). For the new-product flow specifically, the TCGdex card selection drives autofill — name, pokemon_name, set (find-or-create), rarity, card_number, image_url come from TCGdex; the user only fills the *commerce* fields (category, condition, language, price, quantity, slug). Edits use the same form fields without the typeahead.

Out of scope deliberately: orders, customers, image upload, the dashboard refresh, and auth itself. Each is its own slice.

## Steps

### 1. Per-table services

Create `src/app/core/catalog/` with three injectable services — thin wrappers around `SupabaseService` that return typed promises and centralize the queries.

- **`products.service.ts`**
  - `list({ search, categoryId, setId, includeInactive, page, pageSize })` → paginated rows + total count
  - `get(id)` → single product
  - `create(input)` → inserted row
  - `update(id, patch)` → updated row
  - `setActive(id, active)` → soft-delete via flag flip
- **`categories.service.ts`** — `list()`, `create()`, `update()`, `setActive()`
- **`sets.service.ts`** — `list()`, `get(id)`, `findByCode(code)`, `findOrCreateFromTcgdex(set, card)` (used by the new-product flow), `update()`, `delete()` (only for sets with no products)

All services use `inject(SupabaseService)` and return `Promise<{ data, error }>` shapes that components can `await`. Pagination uses `.range(from, to)` + `{ count: 'exact', head: false }`.

### 2. Extend `add-product` into a real new-product form

Files: `src/app/admin/add-product/add-product.{ts,html,scss}`.

After the existing `<app-card-typeahead>`, render the form section once a card is selected:

- **Autofilled (read-only summary, with edit link to override):** name, pokemon_name (lower+trim happens in DB trigger so don't pre-normalize on the client), card_number, rarity, image_url, set (resolved via `SetsService.findOrCreateFromTcgdex` on submit, not before — keep set creation lazy)
- **User input:**
  - Category — `mat-select` populated from `CategoriesService.list({ activeOnly: true })`
  - Condition — `mat-select` with options `NM`, `LP`, `MP`, `HP`, `DMG` (configurable)
  - Language — `mat-select` with `EN`, `ES`, `JP` (default `EN`)
  - Price — `mat-input type="number"` with min=0, step=0.01
  - Quantity — `mat-input type="number"` with min=0, integer
  - Slug — auto-suggested from `${pokemonName}-${cardNumber}-${condition}-${language}` kebab-cased, editable, validated unique
- **Submit flow:** `findOrCreateFromTcgdex` returns `set_id` → assemble `productInput` → `productsService.create()` → on success, snackbar + reset OR navigate to `/admin/products/${slug}/edit`. On unique-violation for slug: highlight the slug field and prompt for override.

Also support an "agregar sin TCGdex" link that hides the typeahead and shows the same form blank, for accessories or non-card SKUs (`set_id = null`, `category = accessories`).

### 3. Productos list page (`/admin/products`)

New: `src/app/admin/products-list/products-list.{ts,html,scss}`.

- `mat-toolbar` row with: search input (debounced 250ms, matches name OR pokemon_name), category filter (`mat-select`), set filter (`mat-autocomplete` on `sets.code`), "Mostrar inactivos" toggle, "+ Nuevo" button → `/admin/products/new`.
- `mat-table` with columns: thumbnail (image_url), name, set code, condition, language, price, quantity, last_restocked_at (relative), active (slide-toggle), actions (edit / delete-soft).
- `mat-paginator` (page size 25 / 50 / 100, server-side via `ProductsService.list()`).
- Sort by `last_restocked_at desc` by default — leverages the partial index from the migration.
- Row click → `/admin/products/:id/edit`.
- Soft-delete uses `setActive(id, false)` and shows an undo snackbar (re-toggles the flag).

### 4. Editar producto (`/admin/products/:id/edit`)

New: `src/app/admin/product-edit/product-edit.{ts,html,scss}`.

- Route param `id` via `input.required<string>()` (project convention from `Detail`).
- On init: load product by id; if not found, show a 404-ish empty state with a back link.
- Renders the same commerce-fields form section as add-product, plus the autofilled metadata as read-only (name, set, rarity, card_number, image_url) with a small "editar metadata" link that switches those into editable inputs (admins occasionally need to fix bad TCGdex hydration). Slug is editable but warns that it changes URLs.
- "Guardar" button → `productsService.update(id, patch)`.
- "Desactivar" button → `setActive(id, false)` + navigate back to list.
- A small panel showing first_listed_at, last_restocked_at, updated_at as read-only `brand-mono` values.

### 5. Categorías (`/admin/categories`)

New: `src/app/admin/categories/categories.{ts,html,scss}`.

Single page with inline editing — small dataset (≤10 rows expected), no need for a separate detail route.

- `mat-table` with: slug, name, active (slide-toggle), sort_order (number input), actions (save row, delete-soft).
- Top of page: "+ Agregar categoría" button reveals an inline new-row form (slug, name, sort_order). Active defaults true.
- Reordering: number input on `sort_order` is sufficient (no drag-and-drop — overengineering for a list this size).

### 6. Sets (`/admin/sets`)

New: `src/app/admin/sets/sets.{ts,html,scss}`.

Mostly read-only (sets are auto-created by the new-product flow via TCGdex), but with an escape hatch for manual entries.

- `mat-table` with: symbol_image_url thumb, code, name, series, release_date, # productos (count derived via a tiny `set_id, count` query or just shown as a link "Ver productos" filtered to that set).
- Click row → expand to show editable name/series/release_date/symbol_image_url (code is immutable once linked).
- "+ Agregar set manual" button at the top opens a small dialog (`MatDialog`) for non-TCGdex entries.
- Delete only enabled when product count = 0.

### 7. Wire routes and sidenav

- **`src/app/app.routes.ts`** — add four new children under `/admin`:
  ```
  products              → ProductsList
  products/:id/edit     → ProductEdit
  categories            → Categories
  sets                  → Sets
  ```
- **`src/app/admin/admin-shell/admin-shell.ts`** — `items` array gains:
  ```
  { label: 'Categorías', icon: 'category', path: '/admin/categories' }
  { label: 'Sets', icon: 'collections_bookmark', path: '/admin/sets' }
  ```
  Insert above 'Pedidos' so catalog items group together. Leave Pedidos / Clientes alone — they're out of scope for this plan and will continue to 404 until those slices ship.

### 8. Shared form bits (only if duplication justifies it)

If the commerce-fields markup ends up identical across add-product and product-edit (>30 lines of duplicate template), extract into `src/app/admin/product-form-fields/product-form-fields.{ts,html,scss}` accepting a `FormGroup` input. Otherwise inline both — three similar lines is better than a premature abstraction.

## Files to modify / create

**Create:**
- `src/app/core/catalog/products.service.ts`
- `src/app/core/catalog/categories.service.ts`
- `src/app/core/catalog/sets.service.ts`
- `src/app/admin/products-list/products-list.ts` + `.html` + `.scss`
- `src/app/admin/product-edit/product-edit.ts` + `.html` + `.scss`
- `src/app/admin/categories/categories.ts` + `.html` + `.scss`
- `src/app/admin/sets/sets.ts` + `.html` + `.scss`
- (Optional) `src/app/admin/product-form-fields/product-form-fields.ts` + `.html` + `.scss` — only if extraction earns its keep

**Modify:**
- `src/app/admin/add-product/add-product.ts` + `.html` + `.scss` — extend the stub into the real new-product form
- `src/app/admin/admin-shell/admin-shell.ts` — add Categorías + Sets to `items`
- `src/app/app.routes.ts` — register the four new admin children

## Reused utilities

- `CardTypeahead` at `src/app/shared/card-typeahead/card-typeahead.ts` — already used by `add-product`; keep using for new-product flow
- `TcgdexService` at `src/app/core/tcgdex/tcgdex.service.ts` — `client.set.get(code)` for set hydration in `findOrCreateFromTcgdex`
- `SupabaseService` at `src/app/core/supabase/supabase.service.ts` — wrapped by the three new catalog services
- Brand utilities `.brand-eyebrow`, `.brand-mono`, `.muted` — already in use in `add-product.html`; keep that tone
- Material 3 component overrides (button/card shape) — automatic via `_material-overrides.scss`, no per-component work
- Reactive Forms (`FormControl`, `FormGroup`, `Validators`) — pattern matches `CardTypeahead`

## Verification

1. **Migration applied first** — confirm via Supabase dashboard or `select * from products limit 0` returns column metadata. Without this the screens crash on every query.
2. **Bootstrap an admin user** (manual, until auth ships):
   ```sql
   update auth.users
   set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb
   where email = '<your test email>';
   ```
   Sign that user in via the Supabase JS client (`auth.signInWithPassword`) so the JWT carries the claim. Without this step every write is RLS-blocked and the admin list will return zero rows (since RLS public-read filters to active+available only).
3. **Add a category** at `/admin/categories` — `singles` slug, sort_order 1, active. Refresh; row persists.
4. **Add a product** at `/admin/products/new` — search "Charizard ex" via TCGdex, select, fill category=singles / condition=NM / language=EN / price=15000 / quantity=2, submit. Verify in Supabase: row exists, `last_restocked_at` is set (because quantity>0 on insert), `set_id` points to a sets row that was auto-created with the TCGdex code.
5. **List and search** at `/admin/products` — the new product appears. Search "char" matches it. Toggle "Mostrar inactivos" off then on.
6. **Edit** — click the row, change price to 14000, save, see snackbar, return to list and confirm the change.
7. **Soft-delete** — toggle active off in the list. With "Mostrar inactivos" off, the product disappears; with it on, it's still visible but greyed.
8. **Restock trigger sanity** — edit the product, set quantity to 0, save. Set quantity to 5, save. Confirm `last_restocked_at` jumped to now (the trigger from the schema migration is doing the work; the UI does nothing special).
9. **Type check** — `npx tsc --noEmit` passes (the regenerated `database.types.ts` from the schema migration is what makes service typings work).
10. **Smoke run** — `npm start`, navigate `/admin/categories` → `/admin/sets` → `/admin/products` → `/admin/products/new` → submit → back to list. No console errors.

## Out of scope

- **Auth flow + admin gating.** Required for these screens to actually function with RLS in place. The screens are written assuming an admin JWT exists; without it most queries fail or return empty. CLAUDE.md already lists auth as deferred. **Recommend tackling this immediately after this slice** so the admin panel is usable end-to-end.
- **Pedidos and Clientes** — still in the sidenav, still 404. Their schemas don't exist yet, so they're not in this plan.
- **Dashboard refresh.** The placeholder at `/admin` stays untouched. A "stats panel" (total products, low stock, recently restocked, inactive count) is an obvious next slice but expands the diff.
- **Image upload.** `image_url` is a free-text URL field. TCGdex provides URLs for cards; manual entries paste a URL. Storage-backed upload (Supabase Storage bucket + signed-URL flow) is a separate decision.
- **Bulk import** — the OpenCart export / migration pipeline is its own plan. The form here is for individual SKU edits and ad-hoc additions.
- **Drag-to-reorder categories** — a number input on `sort_order` is fine for ≤10 rows.
- **Localization** — UI copy is Spanish to match the existing admin shell; no i18n framework introduced.

## Things I'd flag for the user

1. **The auth dependency is real and blocking for end-to-end use.** The screens will compile and render; they will not let you read full inventory or write anything until a user with `app_metadata.role = 'admin'` is signed in. Two paths: (a) plan auth as the very next slice and accept that this slice ships "dark" until then, (b) add a *temporary* dev-only RLS policy that grants any authenticated user write access, marked with a `-- TODO: remove once auth+admin gating lands` comment in the migration. I lean (a) — temporary RLS holes have a way of becoming permanent.
2. **`findOrCreateFromTcgdex` is the only "smart" service method.** It maps `card.set` (a `SetResume`) into the local `sets` table by code, fetching the full set via `client.set.get(code)` only on miss. Worth code-reviewing because it's the one place where two systems shake hands.
3. **Slug auto-generation is heuristic.** I'm proposing `${pokemonName}-${cardNumber}-${condition}-${language}` lowercased + kebab-cased + collision suffix. Different from OpenCart's existing slug shape — the OpenCart import (separate plan) will need to override the generator. Flagging so this isn't a surprise on import day.
4. **Category enum vs FK.** We're keeping `category` as a FK to `categories` (per the schema). UI uses a `mat-select` populated from the table. This is more flexible than a Postgres enum but means a category dropdown will be empty for the very first user — they'll need to seed at least `singles` before they can save a product. Worth surfacing in the empty state of `/admin/products/new` ("Crea una categoría primero").
5. **Sets table grows by side effect.** Every TCGdex-sourced product creation that hits a new set will create a row in `sets`. That's intentional, but it means the Sets screen is mostly observed-state, not curated-state. Manual additions (the dialog escape hatch) are the exception.
