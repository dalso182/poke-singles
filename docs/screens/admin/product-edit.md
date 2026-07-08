# Product edit (admin)
> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose
The full product editor at `/admin/products/:id/edit`. Leads with a "quick update" card (price, sale price, quantity next to the product image) for the everyday restock/reprice flow, followed by the complete metadata form: category, name, editable slug, set, card fields, image, description, commerce fields, active/featured toggles, raffle data, card-type/sub-type assignment, and an audit trail. Save persists product + raffle row + card-type junction; "Desactivar" is the soft-delete (there is no hard delete).

## Route & access
- Path: `/admin/products/:id/edit`, lazy `ProductEdit` (`import('./admin/product-edit/product-edit')`), inside `AdminShell` behind `adminGuard` (see `src/app/app.routes.ts`).
- `:id` (the product UUID) arrives via `readonly id = input.required<string>()` through `withComponentInputBinding()`. Because required inputs aren't set at construction, loading kicks off in `ngOnInit()` (not the constructor) — see the comment in `bootstrap()`.
- Reached from the products list (row click / edit icon), the add-product duplicate banner, and the `"Producto creado"` snackbar's `Editar` action. Back link and post-deactivate navigation: `/admin/products`.

## Files
- `src/app/admin/product-edit/product-edit.ts` — `ProductEdit` component (selector `app-admin-product-edit`); duplicate of the add-product constant `CARD_CATEGORY_SLUGS = ['singles', 'graded']` and helpers `salePriceBelowPrice`, `toNullableNumber`.
- `src/app/admin/product-edit/product-edit.html` — quick-update card, Metadata/Comercio/rifa/type sections, audit `dl`, action row.
- `src/app/admin/product-edit/product-edit.scss` — page width (900px), `.product-edit__quick-*` layout (112×157 thumb, 200px price fields, 130px qty), `.product-edit__dl` audit grid, `.product-edit__actions` row.
- `src/app/shared/set-typeahead/set-typeahead.{ts,html,scss}` — `SetTypeahead` (documented in [add-product](./add-product.md)).
- `src/app/shared/image-picker/image-picker-dialog.ts` + `src/app/core/images/image-browser.service.ts` — same picker dialog + PHP endpoints as add-product.
- `src/app/core/catalog/products.service.ts` (`get`, `update`, `setActive`, `slugInUse`, `getCardTypeIds`, `setCardTypes`), `raffles.service.ts` (`get`, `upsert`), `categories.service.ts`, `card-types.service.ts`, `sellers.service.ts`.
- Shared primitives: `app-back-header`, `app-form-section`, `app-form-grid`, `app-labeled-toggle`, `app-btn`.

## UI anatomy
1. `app-back-header` — kicker `"Inventario"`, title `"Editar producto"`, backLink `/admin/products` (no sub).
2. `mat-progress-bar mode="indeterminate"` while `loading()`.
3. Not-found state (`notFound()`): `"No se encontró el producto."` + ghost `app-btn` `"Volver al listado"` → `goBack()`.
4. **Quick update** (`app-form-section`, first): product thumb (`<img [src]="p.image_url">`, 112×157, lazy, only when set), heading `"Actualización rápida"`, then Precio (CRC) (`price`), Precio rebajado (`sale_price`, error `"Debe ser menor al precio normal."`), Cantidad (`quantity`) — the same three form controls also bound in Comercio below — and a primary `app-btn` `"Guardar cambios"` (disabled on `form.invalid || form.pristine || saving()`).
5. `app-form-section` `"Metadata de la carta"`:
   - Categoría (`mat-select` on `category_id`; `(selectionChange)` mirrors into `selectedCategoryId`), Nombre (`name`), Slug (**editable** input, hint `"Cambiarlo cambia la URL pública."`, errors `"Slug ya en uso."` / `"Sólo minúsculas, números y guiones."`), Set (`app-set-typeahead`, placeholder `"Buscar set por código, nombre o serie…"`; `valueChange` sets the control **and** calls `markAsDirty()`).
   - When `isCardCategory()`: Pokémon (`pokemon_name`, hint `"Se normaliza a minúsculas en el servidor."`), Rareza (`rarity`), Número en set (`card_number`).
   - URL de la imagen (`image_url`, span 2, folder-open suffix button → `openImagePicker()` when `imagePickerEnabled`, tooltip `"Buscar en el servidor"`), Descripción (`description`, textarea rows 3, span 2 — always visible, unlike add-product where it only appears in the raffle section).
6. `app-form-section` `"Comercio"`:
   - When `isCardCategory()`: Condición (`condition`, `CONDITION_OPTIONS` + empty `—`), Variante (`variant`, the **full** `VARIANT_OPTIONS` list — no TCGdex narrowing here).
   - Idioma (`language`, `LANGUAGE_OPTIONS`), Precio (CRC), Precio rebajado (opcional) (hint `"Vacío = sin descuento. Debe ser menor al precio normal."`), Cantidad, Vendedor (**disabled** plain input showing `sellerLabel()`; hint `"Se fija al crear el producto y no se puede cambiar."`), then a span-2 row with `app-labeled-toggle` `"Activo"` (`active`) and `"Destacado"` (`featured`).
7. `app-form-section` `"Datos de la rifa"` (only when `isRaffle()`; subtitle `"La cantidad es el número de entradas; el precio es por entrada. Las notas se toman del campo «Descripción» de arriba."`): Fecha del sorteo (`draw_at`, native date, hint `"Opcional — vacío = por definir."`), Precio de mercado (CRC) (`market_price`, hint `"Valor real de la carta — se muestra al cliente."`), Número en set (`card_number`, hint `"Se muestra junto al set en la tarjeta de la rifa."`), Condición (`condition`, hint `"Estado de la carta — se muestra al cliente."`). No notes textarea — raffle notes reuse `description`.
8. `app-form-section` `"Tipos de carta"` (`showCardTypes()`; subtitle `"Selecciona todas las que apliquen"`): checkbox grid over `globalCardTypes()` → `toggleCardType(id, checked)`.
9. `app-form-section` `"Sub-tipo"` (`showSubtype()`; subtitle `"Selecciona uno"`): single select over `subtypeOptions()` (first `"— Ninguno —"` = `null`) → `onSubtypeChange($event.value)`.
10. `app-form-section kicker="Auditoría"` — definition list: `Listado por primera vez` → `p.first_listed_at`, `Último reabastecido` → `p.last_restocked_at || '—'`, `Actualizado` → `p.updated_at` (raw ISO strings, mono).
11. Action row: danger `app-btn` `"Desactivar"` → `onDeactivate()`; primary `app-btn` `"Guardar cambios"` (same disabled gate as the quick card) → `onSave()`. No `app-form-footer` here.

## Services & backend
- `ProductsService.get(id)` — `products` select `*` by id (`maybeSingle`; null → `notFound`).
- `ProductsService.getCardTypeIds(id)` — `product_card_types` select `card_type_id` by product.
- `ProductsService.slugInUse(raw.slug, product.id)` — head count on `products` by slug **excluding this product** (`neq('id', exceptId)`); only called when the slug actually changed.
- `ProductsService.update(id, patch: ProductUpdate)` — `products` UPDATE returning `*` (admin writes via the `products_admin_all` RLS policy). Note `ProductUpdate` structurally excludes `seller_id` — the seller can never be changed.
- `ProductsService.setActive(id, false)` — the Desactivar path (thin wrapper over `update`).
- `ProductsService.setCardTypes(id, ids)` — delete-then-insert on `product_card_types`.
- `RafflesService.get(productId)` — `raffles` row by `product_id` (`maybeSingle`); `RafflesService.upsert(productId, { draw_at, market_price })` — upsert `onConflict: 'product_id'` (winner/status columns are owned by the `draw_raffle` RPC and never touched here).
- `CategoriesService.list()` (**no** `activeOnly` — an inactive category assigned to this product still resolves in the select), `CardTypesService.list({ activeOnly: true })`, `SellersService.list()` (**all** sellers, retired included, so historical consignments still resolve in `sellerLabel`).
- Image picker: identical wiring to add-product — `ImageBrowserService` against `server/list-images.php` / `upload-image.php` / `create-folder.php` (auth via `X-Supabase-Token`), endpoint `environment.images.listUrl`; dialog opened at `width: '880px'`, result patches `image_url` + `markAsDirty()`.

## State & data flow
- Signals: `categoriesList`, `cardTypesList`, `selectedCardTypeIds: Set<string>`, `selectedSubtypeId`, `product: ProductRow | null`, `sellersList` (private), `loading`, `saving`, `notFound`, `selectedCategoryId`.
- Computeds (same shapes as add-product): `isRaffle` (slug `'rifas'`), `isCardCategory` (slug in `CARD_CATEGORY_SLUGS`), `selectedCategorySlug`, `globalCardTypes` (`category_id === null`), `subtypeOptions` (scoped to the selected category), `isSubtypeCategory` (`'sellado'` | `'accesorios'`), `showCardTypes`, `showSubtype`, plus `sellerLabel` — `'Poke-Singles'` when `seller_id` is null, `"{name} ({code})"` when the seller row resolves, `'—'` otherwise.
- Form (`fb.nonNullable.group`, group validator `salePriceBelowPrice`): `name` (required), `pokemon_name`, `slug` (**enabled**, required, pattern `/^[a-z0-9-]+$/`), `description`, `rarity`, `card_number`, `image_url`, `set_id`, `category_id` (required), `condition` (default `''`, not `'NM'`), `language` (default `'EN'`, required), `variant`, `price` (required, min 0), `sale_price` (min 0.01), `quantity` (default 0, required, min 0), `active` (default true), `featured`, `draw_at`, `market_price` (min 0). **No** hidden TCGdex metadata controls — see Gotchas.
- `bootstrap()` (from `ngOnInit`): parallel-loads categories, card types, the product, `getCardTypeIds`, the raffle row, and sellers. Sets `selectedCardTypeIds` from the junction and `selectedSubtypeId = assignedTypeIds[0] ?? null` (same junction backs both models; a sealed/accessory product has at most one id). Null product → `notFound`. Otherwise sets `product`, `selectedCategoryId`, calls `patchFormFromProduct(product)`, then patches `draw_at` (from the raffles row, `raffle.draw_at.slice(0, 10)` — stored at UTC midnight, date portion only) and `market_price`.
- `patchFormFromProduct(p)` maps every product-backed control (nullables coalesced to `''`); raffle fields are intentionally excluded (they live in `raffles`).
- Dirty tracking: card-type checkboxes and the sub-type select live outside the FormGroup, so `toggleCardType` and `onSubtypeChange` call `form.markAsDirty()` manually — otherwise the pristine-gated Guardar button would never enable. The set-typeahead binding does the same inline in the template.
- **`onSave()`**: guards invalid/`!product`; slug-uniqueness check only when `raw.slug !== product.slug` (conflict → `duplicate` error + snackbar `"Ese slug ya está en uso por otro producto."`); builds the `update` patch with the same category-based clearing as add-product — non-card categories null `pokemon_name`, `rarity`, `variant`, while `card_number` and `condition` also survive when `isRaffle()`; `price`/`quantity` via `Number()`, `sale_price` via `toNullableNumber`; `active`/`featured` from the toggles. Then `raffles.upsert` when raffle, `setCardTypes` (multi for card categories, single subtype for sealed/accesorios, `[]` otherwise), `product.set(updated)`, **`patchFormFromProduct(updated)`** + `markAsPristine()` — required because price/sale_price/quantity each have two inputs bound to the same control (quick card + Comercio) and the repaint also surfaces server normalization (e.g. lowercased `pokemon_name`) — and finally snackbar `"Producto actualizado"` with action `"Volver"` → `goBack()`.
- **`onDeactivate()`**: native `confirm('¿Desactivar este producto? No será visible para los clientes.')`; on accept `setActive(product.id, false)`, snackbar `"Producto desactivado"` (3000 ms), navigate to `/admin/products`.

## Behaviors & edge cases
- Errors (bootstrap, save, deactivate) surface as snackbars with the thrown `message` (fallback `"Error desconocido"`), 5000 ms; the success snackbars are 5000 ms (save) and 3000 ms (deactivate).
- Both Guardar buttons are the same action and share the disabled gate `form.invalid || form.pristine || saving()`; a save round-trip re-pristines the form, disabling them again.
- Changing the category live re-gates the card/raffle/type sections (via `selectedCategoryId`), and the next save clears the now-hidden columns per the rules above.
- The slug is free-text here (unlike add-product's derived, disabled slug); editing it changes the public URL — the hint warns about this, and there is no 301/redirect machinery, so old links 404 (die at the detail page's not-found state).
- Quick-update thumb renders the raw `p.image_url`. Relative `/card-images/...` paths resolve same-origin (dev proxy on localhost, same host in prod) — this screen does not use `resolveHostedSrc`.
- `notFound` only triggers on a null row; a thrown fetch error shows the snackbar and leaves the page blank (neither `notFound` nor `product` set).

## Gotchas / invariants
- **TCGdex metadata is frozen here.** The update patch never includes `card_ref`, `illustrator`, `regulation_mark`, `category`, `stage`, `type1/2`, or `legal_*` — so unlike add-product (which nulls them for non-card categories at insert), *recategorizing* an existing card product to Sellado/Accesorios via edit leaves those columns populated. Visible card-ish fields (`pokemon_name`, `rarity`, `variant`) are cleared; the hidden ones are not. Known asymmetry.
- **No slug regeneration.** Changing condition/variant/language/name here does **not** rebuild the slug (add-product's `computeSlug` has no counterpart) — the admin must hand-edit it or accept a slug that no longer matches the fields.
- Seller is immutable by design: `ProductUpdate = Partial<Omit<ProductInsert, 'category_id' | 'seller_id'>> & { category_id?: string }` — a duplicate card from another seller is a *new* product. The UI reflects this with the disabled Vendedor field.
- `condition` defaults to `''` here (vs `'NM'` in add-product) so an unset condition stays unset.
- The Variante select shows all `VARIANT_OPTIONS` — no narrowing to the card's actual TCGdex variants (that only happens at add time while the `Card` payload is in memory).
- The sub-type model rides the same `product_card_types` junction as the Rareza multi-select; `selectedSubtypeId` is seeded from `assignedTypeIds[0]`. If a product somehow carries multiple junction rows and its category is sealed/accesorios, only the first survives the next save (delete-then-insert with a single id).
- `patchFormFromProduct(updated)` after save is load-bearing: price/sale_price/quantity are dual-bound (quick card + Comercio) and would show stale values in the non-edited input without the repaint. Don't remove it.
- Deactivation uses the browser-native `confirm()` (not a Material dialog) and is the only "delete" — products are never hard-deleted from this screen (order items and slugs reference them).
- Raffle winner/status/draw execution are **not** editable here — `RafflesService.upsert` deliberately touches only `draw_at` + `market_price`; the draw lives on the raffle detail screen (`draw_raffle` RPC).
- `CategoriesService.list()` is called without `activeOnly` (unlike add-product) so a product in a deactivated category still renders its category; picking an inactive category for another product is therefore possible from this screen.
- Bootstrap must stay in `ngOnInit`: the `id` required input is undefined during construction under `withComponentInputBinding()`.

## Related docs
- [Add product](./add-product.md) (typeaheads, image picker, slug rules, `card_details` cache) · [Products list](./products-list.md) · [Raffle detail](./raffle-detail.md) · [Sellers](./sellers.md) · [Categories](./categories.md) · [Filters (card types)](./filters.md)
- [Data model](../../architecture/data-model.md) · [Shared components](../../architecture/shared-components.md) · [Routing & guards](../../architecture/routing-and-guards.md)
- Shared form primitive props: [design manifest](../../design-manifest.md)
