# Admin — Orders list (Pedidos)

> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose

Back-office queue of all customer orders. Admins filter by status (pill tabs with live counts), payment method, and free-text search (customer name/email, or the human order number), page through results server-side, open a payment proof in a new tab straight from the list, and jump into the per-order detail view. Default view is the actionable one: the `Pendientes` tab.

## Route & access

- **Path:** `/admin/orders` (`pathMatch: 'full'`), lazy `loadComponent` → `Orders` from `src/app/admin/orders/orders.ts`.
- **Guards:** the whole `/admin` branch has `canActivate: [adminGuard]` + `canActivateChild: [adminGuard]` on the parent route in `src/app/app.routes.ts`. Data access is additionally gated by the `orders` RLS admin policy (`orders_admin_all`) — a non-admin who somehow reached the page would just see empty results.
- **Query params:** none. Status tab, search text, payment filter, page, and page size are in-memory signals only — a reload resets to tab `pending`, empty search, payment `all`, page 1, page size 25.

## Files

- `src/app/admin/orders/orders.ts` — `Orders` component (selector `app-admin-orders`): filter signals, server-side paging, proof opening, label/tone helpers.
- `src/app/admin/orders/orders.html` — page header, filter bar, Material table, empty state, pagination footer.
- `src/app/admin/orders/orders.scss` — `.orders__*` block styles only (scroll wrapper, consignment icon, customer stack, proof button, empty state); table look comes from `.app-table` + shared primitives.
- `src/app/core/orders/orders.service.ts` — `OrdersService` (admin methods used here: `listOrders`, `countByStatus`, `getPaymentProofSignedUrl`; exports `WHATSAPP_PROOF_SENTINEL`).
- `src/app/core/catalog/catalog.types.ts` — `OrderRow`, `OrderStatus`, `PaymentMethod`.

## UI anatomy

Top to bottom:

1. **`<app-page-header>`** — kicker `"Operaciones"`, title `"Pedidos"`, sub `"Recibos, comprobantes y entregas"`. No projected action.
2. **`<app-filter-bar>`** containing:
   - `<app-pill-tabs>` bound to `statusTabs()` / two-way `status`. Tabs (key → label, with counts from `countByStatus()`): `all` → `"Todos"`, `pending` → `"Pendientes"`, `paid` → `"Pagados"`, `completed` → `"Completados"`, `cancelled` → `"Cancelados"`. **There is no `shipped` tab** even though the status exists.
   - `<app-search-input>` two-way bound to `searchText`, placeholder `"Buscar pedido, cliente, SKU…"`.
   - `.spacer`, then `<app-dropdown>` label `"Pago"`, width 200, options (`paymentOptions`): `all` → `"Todos"`, `sinpe_or_transfer` → `"SINPE / Transferencia"`, `payment_link` → `"Enlace de pago"`.
3. **`<mat-progress-bar mode="indeterminate">`** while `loading()`.
4. **`<app-table-card>`** wrapping a `mat-table` (`.app-table.app-table--comfy` inside `.orders__scroll`). Columns (`displayedColumns`):
   - `ref` — header `"Pedido"`; dim `#` prefix (`.orders__hash`) + bold `shortRef(row.order_number)` (just the number as a string). If `row.has_consignment`, a small blue `storefront` icon (`.orders__consign`) with tooltip `"Contiene ítems en consignación"`.
   - `customer` — header `"Cliente"`; stacked `customer_name` (bold) over monospace `customer_email` (`.orders__email`).
   - `total` — header `"Total"` (right-aligned); `<app-money [value]="row.total">`.
   - `payment` — header `"Pago"`; `paymentLabel()` → `"SINPE/Transferencia"` or `"Enlace"`.
   - `proof` — header `"Comprobante"`; per `proofKind(row.payment_proof_url)`:
     - `file` → an unstyled button (`.orders__proof-btn`, title/aria-label `"Abrir comprobante"`) wrapping `<app-pill tone="green" [dot]="true">Recibido</app-pill>`; click → `openProof(row)`.
     - `whatsapp` → static `<app-pill tone="green" [dot]="true">WhatsApp</app-pill>`.
     - `none` → dimmed `—`.
   - `status` — header `"Estado"`; `<app-pill [tone]="statusTone(row.status)">` with `statusLabel(row.status)`. Labels: `pending` → `"Pendiente"`, `paid` → `"Pagado"`, `shipped` → `"Enviado"`, `completed` → `"Completado"`, `cancelled` → `"Cancelado"`. Tones (`PillTone`): pending `amber`; paid/completed `green`; shipped `blue`; cancelled `red`.
   - `date` — header `"Fecha"`; `created_at | date: 'short'`, monospace dim.
   - `actions` — right-aligned `<app-btn variant="ghost" size="sm">Ver</app-btn>` → `goToView(row.id)` → `router.navigate(['/admin/orders', id])`.
5. **Empty state** — `.orders__empty` paragraph `"Sin pedidos en este filtro."` when not loading and `rows()` is empty.
6. **`<app-pagination-footer>`** — `[page]`, `[perPage]`, `[total]`, `[perPageOptions]="[10, 25, 50, 100]"`, emitting `(pageChange)` → `onPage` and `(perPageChange)` → `onPerPage`.

Shared table primitives (`app-page-header`, `app-filter-bar`, `app-table-card`, `app-pill-tabs`, `app-search-input`, `app-dropdown`, `app-pill`, `app-money`, `app-btn`, `app-pagination-footer`) come from `src/app/shared/table/` — see the design manifest.

## Services & backend

All on `OrdersService` (`providedIn: 'root'`), against Supabase via PostgREST — no RPCs on this screen:

- **`listOrders(params: AdminOrderListParams)`** → `AdminOrderListResult { rows, total, page, pageSize }`:
  - `from('orders').select('*, order_items(seller_id)', { count: 'exact' })`, ordered `created_at desc`, `.range()` paged. `pageSize` is clamped to 1–200 server-call-side (`Math.max(1, Math.min(200, …))`).
  - The `order_items(seller_id)` embed exists only to derive `has_consignment` (`AdminOrderListRow extends OrderRow`): true when any line item has `seller_id != null`. Child rows don't disturb the parent-level `range()` pagination or the exact count.
  - `status !== 'all'` → `.eq('status', …)`; `paymentMethod !== 'all'` → `.eq('payment_method', …)`.
  - Search builds a PostgREST `.or()` over `customer_email.ilike.%term%` and `customer_name.ilike.%term%` (with `%`/`_` escaped via `term.replace(/[%_]/g, '\\$&')`). If the term is purely numeric after stripping an optional leading `#` (so `7300` and `#7300` both work), it also adds `order_number.eq.<n>` — exact match, not prefix.
- **`countByStatus()`** → `OrderStatusCounts { all, pending, paid, completed, cancelled }`. Five parallel head-only `count: 'exact'` queries; any individual failure yields 0. `all` counts every order **including `shipped`**, which has no dedicated tab or count field.
- **`getPaymentProofSignedUrl(filePath, expiresIn = 3600)`** — `storage.from('payment-proofs').createSignedUrl(...)` (private bucket, so yes: signed URLs, 1 h default). Returns `null` for a null path, for the WhatsApp sentinel, or on storage errors.
- **`WHATSAPP_PROOF_SENTINEL = '__whatsapp__'`** — value stored in `orders.payment_proof_url` when the customer chose the "ya envié por WhatsApp" path instead of uploading a file.

Backend objects: table `orders` (+ embedded `order_items`), storage bucket `payment-proofs` (private, 5 MiB limit, mime allowlist `image/jpeg`, `image/png`, `image/webp`, `application/pdf`). Admin reads ride the `orders_admin_all` / `order_items_admin_all` RLS policies; proof reads ride `payment_proofs_admin_read` / `payment_proofs_admin_all` storage policies.

## State & data flow

Signals on `Orders`:

- `searchText: signal('')` → `searchValue = toSignal(toObservable(searchText).pipe(debounceTime(250), distinctUntilChanged()), { initialValue: '' })`.
- `status: signal<string>('pending')` — **default tab is `pending`, not `all`**.
- `payment: signal<string>('all')`.
- `rows: signal<AdminOrderListRow[]>`, `total: signal(0)`, `page: signal(1)`, `pageSize: signal(25)`, `loading: signal(false)`.
- `counts: signal<OrderStatusCounts>` (all zeros initially) → `statusTabs = computed<TabItem[]>`.

Load flow: the constructor fires `loadCounts()` once, and registers an `effect` that reads `searchValue()`, `status()`, and `payment()`, then does `page.set(1)` + `refresh()`. The effect's first run is the initial data load. `onPage(page)` and `onPerPage(size)` (which also resets to page 1) call `refresh()` directly without touching the filter signals. `refresh()` wraps `listOrders` in `loading`, writes `rows`/`total`, and snackbars failures (`errorMessage(err)`, fallback `"Error desconocido"`, action `"OK"`, 5000 ms).

Proof opening: `openProof(order)` awaits a fresh signed URL and `window.open(url, '_blank', 'noopener')`; if the URL is null it snackbars `"No se pudo abrir el comprobante."` (`"OK"`, 4000 ms).

## Behaviors & edge cases

- **Debounced search** — 250 ms + `distinctUntilChanged`; every filter change (search, tab, payment) resets to page 1 via the effect.
- **Numeric search** matches the human `order_number` exactly (typed as `7300` or `#7300`); non-numeric terms only hit name/email ILIKE. There is no partial order-number search.
- **Counts are decorative** — `loadCounts()` swallows errors (tabs stay at 0) and runs exactly once at construction. Counts do not refresh when you page, filter, or return from cancelling an order in the same component instance.
- **`shipped` rows** are reachable only via the `Todos` tab (or not at all when another tab is selected); they render label `"Enviado"` / tone `blue` fine, but no tab filters to them and `OrderStatusCounts` has no `shipped` field.
- **WhatsApp proof** pill is not clickable — there is no file, the admin is expected to check WhatsApp.
- **Row click does nothing** — only the `Ver` button navigates to `/admin/orders/:id`.

## Gotchas / invariants

- **The search placeholder promises SKU search (`"Buscar pedido, cliente, SKU…"`) but no SKU search is implemented** — `listOrders` only matches `customer_email`, `customer_name`, and numeric `order_number`. Searching a card name/SKU returns nothing.
- **Tab counts don't sum**: `Todos` includes `shipped` orders, the four other tabs don't, so `pending + paid + completed + cancelled` can be less than `all`.
- ILIKE escaping covers `%` and `_` but not the backslash itself; also the search term is interpolated into a PostgREST `.or()` string, so terms containing `,` or `(`/`)` can corrupt the filter expression and error the query (surfaced via snackbar).
- `openProof` calls `window.open` directly with no `isPlatformBrowser()` guard — drift from the CLAUDE.md "never touch `window`/`document`" convention (harmless today in the client-only SPA, a refactor point if SSR ever lands).
- Filter/page state is not URL-synced — no deep links; the browser Back button loses your tab/page.
- Display the human `order_number` (`#7300`); the UUID `id` stays the source of truth for the detail URL and RPC params.
- `has_consignment` is derived client-side from the `order_items(seller_id)` embed — it reflects the snapshot at order time, not the product's current seller.

## Related docs

- [Order detail](./order-detail.md) — status transitions, cancel flow, proof management
- [Admin shell & nav](./admin-shell.md)
- [Dashboard](./dashboard.md) — pending-orders KPI uses `countPendingOrders()` from the same service
- [Sellers (consignment)](./sellers.md)
- [Checkout](../storefront/checkout.md) — where orders and proofs are created
- [Commerce flow](../../architecture/commerce-flow.md)
- [Data model](../../architecture/data-model.md)
- [Shared table primitives](../../design-manifest.md)
