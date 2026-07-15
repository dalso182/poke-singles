# Admin — Seller detail (Vendedor / consignment payouts)

> Part of the Poke-Singles docs set. Verified against source on 2026-07-15. Load together with /CLAUDE.md.

## Purpose

Per-seller consignment view: everything owed to (and settled with) one consignment seller. Two pill tabs — **Sellado** (live: sold sealed items with the store's fee breakdown, bulk "Marcar pagado" into `seller_payouts` batches, and the payout history) and **Singles** (placeholder until its fee rules are defined; consigned singles appear in NO tab until then). Reached via the "Ver" action on the [sellers list](./sellers.md). This view lived briefly as a "Consignaciones" tab in `/admin/reports` (2026-07-14) before moving here the same day — the per-seller scope removed the old "pick a seller before checkboxes appear" gating.

## Route & access

- **Path:** `/admin/sellers/:id` (lazy `loadComponent` → `SellerDetail`; the `sellers` list route gained `pathMatch: 'full'` when this was added). Child of the `admin` parent → `adminGuard` via `canActivate` + `canActivateChild`.
- **`:id` param:** router-bound `id = input.required<string>()` (`withComponentInputBinding` is global). Required param on every mapping route → no `?? fallback` footgun. No query params.
- Unknown/missing id → not-found card: `"No se encontró el vendedor."` + `"Volver al listado"` `app-btn` → `/admin/sellers`.
- Backing RPCs are `SECURITY DEFINER` + `is_admin()` (raise `NOT_AUTHORIZED`); batch list/delete run under the `seller_payouts_admin_all` RLS policy.

## Files

| File | Role |
|---|---|
| `src/app/admin/sellers/seller-detail.{ts,html,scss}` | `SellerDetail` (`app-admin-seller-detail`) — back-header + Sellado/Singles pill tabs + not-found card |
| `src/app/admin/sellers/seller-sealed.{ts,html,scss}` | `SellerSealed` (`app-seller-sealed`) — the whole Sellado tab: pending line, filters, selectable items table, bulk bar, "Pagos realizados" history |
| `src/app/admin/sellers/payout-items-dialog.{ts,html,scss}` | `PayoutItemsDialog` (`app-payout-items-dialog`) — read-only "what did this payment cover?" modal (batch row via `MAT_DIALOG_DATA`) |
| `src/app/core/catalog/seller-payouts.service.ts` | `SellerPayoutsService` — `listSealedItems`, `sealedPendingTotals`, `createPayout`, `listPayouts`, `payoutItemIds`, `deletePayout` (spec: `seller-payouts.service.spec.ts`) |
| `src/app/core/catalog/sellers.service.ts` | `SellersService.get(id)` (`maybeSingle`) loads the header seller |
| `src/app/shared/table/bulk-bar/bulk-bar.ts` | `BulkBar` (`app-bulk-bar`) — selection toolbar, born for this screen |
| `src/app/shared/forms/back-header/back-header.ts` | `app-back-header` (kicker `"Vendedor"`, title = seller name, sub `"{code} · consignación"`, `backLink="/admin/sellers"`) |
| `supabase/migrations/20260714100000_seller_payouts.sql` | `sealed_payout_fees()` + `seller_payouts` table + `order_items.seller_payout_id` + the 3 RPCs |
| `supabase/migrations/20260714110000_cuanto_flat_fee.sql` | ₡115-per-Cuanto-order flat fee: fee fn signature v2 + divisor laterals in all consumers |

## UI anatomy

1. `app-back-header` → back to `/admin/sellers`; `mat-progress-bar` while the seller loads; not-found card if `SellersService.get` returns null.
2. `.seller-detail__tabs` → `app-pill-tabs` (`view = signal('sealed')`): `'sealed'` → `"Sellado"`, `'singles'` → `"Singles"`. `@switch` mounts one; **Singles** renders `<p class="seller-detail__placeholder">` `"Reglas de pago para singles pendientes de definir — próximamente."`

### Sellado (`SellerSealed`, input `sellerId = input.required<string>()`)

- **Pending line** (omitted when nothing owed): `"Pendiente: ₡X · N ítems"` — from `sealedPendingTotals()` filtered to this seller.
- Filters: `app-labeled-toggle` `"Solo pendientes"` (default ON) + `app-date-range`. No seller selector — the route fixes it.
- **Selection:** `canSelect = computed(() => pendingOnly())`. Checkboxes live immediately in the pending view; when the toggle is off the `select` column drops from `displayedColumns()` and a dim hint shows: `"Activá \"Solo pendientes\" para seleccionar ítems y marcarlos pagados."` Per-row checkbox only on unpaid rows; header `app-checkbox` uses `[indeterminate]` and toggles **only the current page's** unpaid rows (other pages' picks persist in the Map).
- Items table columns: `order` (`#order_number` → routerLink `/admin/orders/:order_id`, date below) · `product` (`app-thumb` + name + set) · `pago` (`'payment_link'` → blue `"Cuanto"` pill, else neutral `"SINPE"`) · `qty` · `vendido` (`line_total`) · `Cuanto` (5% + the ₡115 share) / `comisión` (mono `−₡…`, dim `—` when 0) · `pago vendedor` (`payout_amount`, bold) · `estado` (amber `"Pendiente"` / green `"Pagado"` + `payout_paid_at`). Empty state: `"Sin ítems de consignación sellado en este filtro."` `perPageOptions [10,25,50,100]`, default 50.
- **Bulk bar** (`app-bulk-bar`, `@if (selectedCount() > 0)`): count + `"Limpiar"`, `Pago: <app-money>` sum, `.sealed__notes` input (`"Nota (opcional)"`), `"Marcar pagado"` (primary, disabled while `saving()`). `markPaid()` → `createPayout(ids, notes)` → clear + `refresh()` → snackbar `` `Pagado a ${seller_name}: ₡${total} (${item_count} ítems)` `` with `"Deshacer"` = `deletePayout(payout_id)`. RPC errors map to Spanish via `PAYOUT_ERRORS` (`MIXED_SELLERS`, `ALREADY_PAID`, `ORDER_NOT_REALIZED`, `NOT_SEALED`, `NOT_FOUND`, `NO_SELLER`, `NO_ITEMS`, `NOT_ADMIN`).
- **"Pagos realizados" section** below the items table (h3 `.sealed__history-title`): this seller's `seller_payouts` batches, newest first. Columns: `date` (`d/MM/yy HH:mm`) · `items` (the count is a blue-link `<button class="sealed__items-link">` → opens `PayoutItemsDialog`) · `sold` (`total_sold`) · `fees` (`−₡(cuanto_fees + store_fees)`) · `payout` (`total`, bold) · `notes` (dim `—`) · `actions` (danger `"Eliminar"`).
- **Payout-items dialog** (`PayoutItemsDialog`, width 640px): title `"Pago a {seller_name}"` + date/nota sub-line; table of the batch's items (`app-thumb` + name + set · `#order_number` link → `/admin/orders/:order_id`, **closes the dialog on click** · qty · vendido) loaded via `listPayoutItems(batch.id)`; footer shows the batch's frozen `Vendido · Fees · Pagado` totals (from the injected row — no fetch) + `"Cerrar"`. Empty state: `"No se encontraron ítems para este pago."` Own pagination (`payoutsPage`/`payoutsPageSize` default 10, options [10,25,50]). Empty state: `"Todavía no hay pagos registrados."` `onDeletePayout(row)` captures `payoutItemIds(row.id)` **before** deleting, then snackbar `"Pago eliminado — ítems de vuelta a pendientes"` with `"Deshacer"` = `createPayout(ids, row.notes)` (can legitimately fail if an order got cancelled or items were re-paid → `"No se pudo restaurar el pago"`).

## Services & backend

Migrations `20260714100000` + `20260714110000`. Fee rules (sealed, agreed 2026-07-14) live in **`sealed_payout_fees(p_unit_price, p_quantity, p_payment_method, p_order_seller_units) → (cuanto_fee, store_fee, payout)`** — an `immutable` plpgsql function shared by both read RPCs *and* the mutation, so displayed and frozen amounts can never drift:

- **Cuanto app fee** (order `payment_method = 'payment_link'`): 5% of the line **plus the line's share of a flat ₡115 per order** — `round(115 × line_qty / p_order_seller_units)`. The divisor is the order's total consigned **sealed** units (consigned singles and house items never absorb a share; a lone consigned sealed item takes the full ₡115; per-line rounding may drift the sum a colón or two). Callers compute it with a shared lateral over the order's consigned sealed items **regardless of paid status** — paying 2 of 3 items leaves the third its own fixed share; NULL/0 divisor → the line absorbs the full fee. `sinpe_or_transfer` → no Cuanto fee at all.
- **Store commission, per unit** (tier from `unit_price`, × quantity): `< ₡15.000` → 0 · `15.000–29.999` → ₡1.000 · `30.000–79.999` → ₡2.000 · `≥ ₡80.000` → 5% of unit price.
- Both fees computed on the sold price independently, 5% amounts rounded to the colón; `payout = line_total − cuanto_fee − store_fee`.

`SellerPayoutsService` methods:

- `listSealedItems` → `admin_sealed_payouts_report(p_seller_id, p_pending_only, p_date_start, p_date_end, p_limit, p_offset)` — `order_items ⨝ orders ⨝ products ⨝ categories (slug = 'sellado')` + fee lateral. `p_pending_only = true`: unpaid (`seller_payout_id IS NULL`) items on realized orders (`status in ('paid','shipped','completed')`); `false`: realized items **plus anything already batched** (a paid batch stays visible even if its order is later cancelled). Sealed-ness is joined **live** via `products.category_id` — `order_items` does not snapshot the category.
- `sealedPendingTotals` → `admin_sealed_pending_totals()` — per-seller `item_count` / `pending_sold` / `pending_payout` over the full pending set (unpaginated companion).
- `createPayout` → `create_seller_payout(p_item_ids uuid[], p_notes)` — SECURITY DEFINER returning jsonb `{ok:false, error}` like `cancel_order`. Dedupes ids, locks parent **orders** then the items (`FOR UPDATE`, stable id order — serializes vs `cancel_order` and a second admin), validates `NOT_FOUND` / `NO_SELLER` / `MIXED_SELLERS` / `ALREADY_PAID` / `ORDER_NOT_REALIZED` / `NOT_SEALED` (also rejects null `product_id`), freezes `total_sold/cuanto_fees/store_fees/total/item_count` into `seller_payouts` (notes via `nullif(btrim(...), '')`, `created_by = auth.uid()`), stamps `order_items.seller_payout_id`.
- `listPayouts` / `deletePayout` / `payoutItemIds` / `listPayoutItems` (items + embedded parent order for the dialog, `PayoutItemDetail`) — direct PostgREST under the admin RLS. **Deleting a batch IS the undo:** `order_items.seller_payout_id → seller_payouts ON DELETE SET NULL` reverts its items to pending atomically; there is no delete RPC.

Types in `src/app/core/catalog/catalog.types.ts`: `SealedPayoutItemRow/ItemsParams/ItemsResult`, `SellerPendingTotal`, `SellerPayoutRow/ListParams/ListResult`, `SellerPayoutCreated`.

## State & data flow

`SellerSealed` follows the reports-panel skeleton (filter signals → constructor `effect()` → `page.set(1)` + `refresh()`), minus debounce (no free-text filter). The `effect()` also watches `sellerId()` and clears `selected` on any filter change. One shared `refresh()` runs `listSealedItems` + `sealedPendingTotals` + `listPayouts` in a `Promise.all`, so paying or deleting a batch keeps the items table, the pending line, and the history in sync for free. Selection state is `selected = signal<Map<string, number>>` (item_id → `payout_amount`) so the ₡ owed sum survives pagination.

## Behaviors & edge cases

- **Select-all is page-scoped:** the header checkbox (de)selects only the current page's unpaid rows; other pages' selections persist. The bulk bar's exact count + ₡ sum are the guard against "I thought I selected everything".
- **Order cancelled AFTER its item was paid out:** `cancel_order` doesn't touch `order_items`, so the item stays in its batch. Legitimate — resolve manually: Eliminar the batch, re-pay without that item.
- **"Deshacer" on a deleted batch can fail** (`"No se pudo restaurar el pago"`) when the window was raced (order cancelled / items re-paid); it surfaces the error and refreshes rather than retrying.
- **Tab switch destroys state:** `@switch` in the host recreates `SellerSealed`, resetting filters/selection.
- Double-pay race between two admins → the loser gets `ALREADY_PAID` and the refresh drops the stale rows.

## Gotchas / invariants

- **The fee math lives ONLY in `sealed_payout_fees()`** — never duplicate the tiers or the ₡115 split in TypeScript; the UI displays what the RPC computed. Rule changes = a new migration replacing that function; existing batches keep their frozen totals (that's the point of the ledger).
- **Payout amounts are GROSS of coupons** (agreed 2026-07-14): order-level `discount_amount` is deliberately NOT allocated to line items.
- **Sealed-ness is a live join** (`products → categories.slug = 'sellado'`): recategorizing a product moves its history; a hard-deleted product (never happens via the app) would drop items from the report, and `create_seller_payout` rejects them with `NOT_SEALED`.
- **Sellers with payout history become undeletable** (`seller_payouts.seller_id → sellers ON DELETE RESTRICT`).
- **`admin_sealed_payouts_report` is `RETURNS TABLE`** — adding columns later means drop+recreate.
- The `sellers` list route needs `pathMatch: 'full'` so `sellers/:id` isn't shadowed — don't remove it.

## Related docs

- [sellers.md](./sellers.md) — the list this screen hangs off (Ver action)
- [reports.md](./reports.md) — the analytics hub this view moved out of
- [order-detail.md](./order-detail.md) — the items table's order links; seller pills per line item
- [../../architecture/data-model.md](../../architecture/data-model.md) — `seller_payouts` + `order_items.seller_payout_id`
- [../../architecture/backend-rpcs-and-functions.md](../../architecture/backend-rpcs-and-functions.md) — the fee function + RPC catalog entries
- [../../design-manifest.md](../../design-manifest.md) — `app-bulk-bar`, `app-checkbox` (`indeterminate`), `app-back-header`, table primitives
