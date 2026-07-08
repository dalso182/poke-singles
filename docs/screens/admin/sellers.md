# Admin — Sellers (Vendedores / consignment)

> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose

CRUD for **consignment sellers** (`sellers` table) — people who hand the store cards to sell on their behalf. The house (Poke-Singles) deliberately has **no row**: a product with `seller_id IS NULL` is house inventory. The screen is a single inline-editable table with an expandable add form. Sellers ripple through three other surfaces (documented in their own docs, summarized here because this screen is where the entity is managed):

- **Add product** — a `Vendedor` select (default `Poke-Singles` = null) fixed at creation; the seller's 2-char code is appended lowercase as the last slug part.
- **Products list** — a `Vendedor` filter dropdown (`Todos` / `Poke-Singles (sin vendedor)` / each seller) and a blue code pill next to product names.
- **Orders / order detail** — `place_order` (v10) snapshots `seller_id` / `seller_code` / `seller_name` onto each `order_items` row; the order detail shows the code pill per line item.

## Route & access

- **Path:** `/admin/sellers` (child of the lazy `AdminShell` route; `canActivate: [adminGuard]` + `canActivateChild: [adminGuard]` on the parent `admin` route in `src/app/app.routes.ts`).
- **Sidenav:** group "Catálogo" → item `Vendedores` (icon `storefront`), no count badge.
- **Query params:** none.

## Files

| File | Role |
|---|---|
| `src/app/admin/sellers/sellers.ts` | `Sellers` component (`selector: 'app-admin-sellers'`) — state, add/save/toggle handlers |
| `src/app/admin/sellers/sellers.html` | Page header, collapsible add card, mat-table |
| `src/app/admin/sellers/sellers.scss` | BEM styles under `.sellers__*` (note: the add-card `code` input gets `text-transform: uppercase`) |
| `src/app/core/catalog/sellers.service.ts` | `SellersService` — Supabase reads/writes on `sellers` |
| `src/app/core/catalog/catalog.types.ts` | `SellerRow`, `SellerInsert`, `SellerUpdate` (`= Partial<Omit<SellerInsert, 'code'>>` — code locked after creation) |
| `supabase/migrations/20260704100000_sellers.sql` | `sellers` table, RLS, `products.seller_id` FK + partial index |
| `supabase/migrations/20260704100100_order_items_seller_snapshot.sql` | `order_items.seller_id / seller_code / seller_name` |
| `supabase/migrations/20260704100200_place_order_v10_seller_snapshot.sql` | `place_order` v10 — writes the snapshot at checkout |

## UI anatomy

1. `<app-page-header>` — `kicker="Catálogo"`, `title="Vendedores"`, `sub="Consignación — quién nos dio cada carta para vender"`. Projected action: `<app-btn variant="primary">` toggling `addOpen` — flips between icon `add` / `"Agregar vendedor"` and icon `close` / `"Cancelar"`.
2. **Add card** (`mat-card.sellers__add`, only while `addOpen()`): outline fields `Código` (`maxlength="2"`, class `.sellers__code-field`, CSS-uppercased), `Nombre`, `Email` (`type="email"`), `Teléfono`, then `<app-btn variant="primary">Crear</app-btn>` disabled while invalid or `saving() === '__new__'`.
3. `mat-progress-bar mode="indeterminate"` while `loading()`.
4. `<app-table-card>` → `.sellers__scroll` → `table[mat-table].app-table.app-table--cozy` with `displayedColumns = ['code', 'name', 'email', 'phone', 'active', 'actions']`:
   - **Código** — read-only `span.app-slug-chip` (create-only, like category slugs).
   - **Nombre / Email / Teléfono** — `<app-editable-input>` bound via `val()` / `setText()`.
   - **Activo** — `<app-toggle [on]="row.active">`, disabled while `saving() === row.id`, fires `onToggleActive` immediately.
   - **actions** — `<app-btn variant="ghost" size="sm">Guardar</app-btn>`, disabled when the row form is invalid, pristine, or saving.
5. Empty state: `"Aún no hay vendedores. Los productos sin vendedor son inventario propio (Poke-Singles)."` (`.sellers__empty`).

Shared primitives per [design-manifest](../../design-manifest.md).

## Services & backend

`SellersService` (root-provided), all through `SupabaseService.client`:

- `list(opts?: { activeOnly?: boolean })` → `from('sellers').select('*')` ordered by `name` asc. This screen calls it without options (retired sellers included). Add-product uses `{ activeOnly: true }`; product-edit and products-list use the unfiltered list so historical products still resolve.
- `create(input: SellerInsert)` — inserts with `code: input.code.trim().toUpperCase()` (client-side normalization; the DB check is the backstop).
- `update(id, patch: SellerUpdate)` / `setActive(id, active)` — plain writes; `code` is not part of `SellerUpdate`.

Backend (`20260704100000_sellers.sql`):

- Table `public.sellers`: `id uuid pk`, `name text not null`, `email text`, `phone text`, `code text not null unique check (code ~ '^[A-Z0-9]{2}$')` (2-char uppercase; lowercased only when appended to product slugs), `active boolean default true`, `created_at`.
- RLS: **admin-only** — single policy `sellers_admin_all` (`for all to authenticated using (public.is_admin()) with check (public.is_admin())`). There is deliberately **no public read policy**: nothing customer-facing reads sellers; `place_order` is `SECURITY DEFINER` so checkout can join the table regardless.
- `products.seller_id uuid references public.sellers(id) on delete restrict` — a seller with products **cannot be deleted** (that would silently absorb their inventory into the house). Partial index `products_seller_idx on products (seller_id) where seller_id is not null`.

Snapshot chain (`20260704100100` + `20260704100200`):

- `order_items` gains `seller_id uuid references sellers(id) on delete set null`, `seller_code text`, `seller_name text`. No backfill (table was brand new; all prior items are house inventory).
- `place_order` v10: in the item-insert loop, if `products.seller_id` is not null it selects `code, name` from `sellers` into `v_seller_code` / `v_seller_name` and writes all three columns on the item; house products write NULLs. Attribution therefore survives product edits, product deletion, and even seller-row deletion (code + name are the display payload; `seller_id` is kept for reporting joins while the row exists).

## State & data flow

Signals on `Sellers`: `rows = signal<SellerRow[]>([])`, `loading`, `saving = signal<string | null>(null)` (`'__new__'` for the add form), `addOpen`; `displayedColumns` as above.

- `addForm = fb.nonNullable.group({ code, name, email, phone })` — `code` validators `Validators.required` + `Validators.pattern(/^[A-Za-z0-9]{2}$/)` (case-insensitive; uppercasing happens in the service + DB check), `name` required, `email` `Validators.email`, `phone` free.
- `editForms = new Map<string, FormGroup>()` — per row `{ name: required, email: Validators.email, phone }`, rebuilt on every `refresh()`. No code edit.

Flow: constructor calls `refresh()` (floating promise). `onAdd()` → `create` with trimmed values (`email`/`phone` empty → `null`) → reset, close card, `refresh()`, snackbar `"Vendedor creado"`. `onSave(row)` → `update` (trimmed, empty → `null`) → `"Vendedor actualizado"` → `refresh()`. `onToggleActive(row, active)` → `setActive` → `refresh()` (no snackbar). Errors via `MatSnackBar.open(errorMessage(err), 'OK', { duration: 5000 })`; `errorMessage` special-cases the unique violation — a message containing `sellers_code_key` becomes `"Ese código ya está en uso por otro vendedor."`, fallback `"Error desconocido"`.

## Behaviors & edge cases

- **Retiring = deactivating.** There is no delete UI at all, and the DB `on delete restrict` on `products.seller_id` blocks SQL deletes for sellers with inventory. An inactive seller disappears from the add-product select (`activeOnly: true`) but keeps resolving in product-edit, products-list filter, and order snapshots.
- **Seller is fixed at product creation.** Product-edit renders a disabled `Vendedor` input (`sellerLabel()` — `"Poke-Singles"`, `"{name} ({code})"`, or `"—"` if the row vanished) with hint `"Se fija al crear el producto y no se puede cambiar."` A duplicate card from another seller is a **new product**.
- **Slug embedding:** add-product appends `code.toLowerCase()` as the last slug part (hint: `"Consignación — se fija al crear y agrega su código al slug."`), disambiguating the same card offered by different sellers. This is why `code` is immutable.
- The products-list filter maps `''` → no filter, `'none'` → `.is('seller_id', null)` (house), uuid → `.eq('seller_id', id)` — the null case needs `IS NULL` because `.eq(col, null)` renders `=NULL` and never matches.
- `ProductsService.list()` embeds `sellers(code, name)` in its select and flattens to `seller_code` / `seller_name`; for anonymous storefront callers the embed returns null (admin-only RLS), so no seller data leaks.
- Editing `name`/`email` on a seller does **not** rewrite historical `order_items.seller_name` (snapshot semantics — intentional).

## Gotchas / invariants

- **`code` must stay immutable and 2-char uppercase.** Product slugs and `order_items.seller_code` snapshots embed it; `SellerUpdate` omits it, the UI has no edit control, and the DB check `^[A-Z0-9]{2}$` rejects anything else. Changing it via SQL would silently desync slugs and order history.
- **Never add a public read policy to `sellers`.** The table is intentionally invisible to `anon`/non-admin users; storefront queries relying on the `sellers(...)` embed must tolerate nulls.
- The house has no row by design — code that iterates sellers must treat `seller_id IS NULL` as "Poke-Singles", not as missing data.
- The add form's pattern accepts lowercase (`/^[A-Za-z0-9]{2}$/`) and relies on `create()`'s `.toUpperCase()` — the SCSS `text-transform: uppercase` is cosmetic only.
- Any successful save/toggle re-fetches the whole list and rebuilds all edit forms, discarding unsaved edits in other rows (same pattern as Categories).
- `refresh()` is a floating promise from the constructor — same accepted pattern as Categories/Sets.

## Related docs

- [Products list (Vendedor filter + pill)](./products-list.md) · [Add product (Vendedor select + slug code)](./add-product.md) · [Product edit (locked Vendedor field)](./product-edit.md)
- [Order detail (seller pill on line items)](./order-detail.md) · [Orders](./orders.md)
- [Categories](./categories.md) — the sibling CRUD this screen's table pattern mirrors
- [Admin shell & nav](./admin-shell.md)
- [Data model](../../architecture/data-model.md) · [Commerce flow (place_order)](../../architecture/commerce-flow.md) · [Shared components](../../architecture/shared-components.md)
