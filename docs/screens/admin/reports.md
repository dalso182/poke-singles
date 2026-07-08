# Admin — Reports hub (Reportes)

> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose

One admin screen hosting five analytics reports, each a self-contained child component with its own filters, table, and pagination (the new-stack ports of OpenCart's Customer Orders / Customer Activity / Customer Searches / Coupons reports, plus a loyalty-points ledger report). The hub itself is only a page header plus a pill-tab switcher; everything else lives in the panel components and their admin-only report RPCs.

Note: the *price-review* triage queue is a separate screen (`/admin/price-review`) even though its client logic also lives in `ReportsService` — see [price-review.md](./price-review.md).

## Route & access

- **Path:** `/admin/reports` (`pathMatch: 'full'`, lazy `loadComponent` in `src/app/app.routes.ts` → `Reports`).
- **Guards:** `adminGuard` on the `/admin` parent (`canActivate` + `canActivateChild`).
- **Query params:** none. The active tab and every panel's filters/pagination live in component signals only — a reload always returns to the "Pedidos por cliente" tab with empty filters.
- Every backing RPC is `SECURITY DEFINER` with an `is_admin()` guard (raises `NOT_AUTHORIZED`), so even a direct RPC call by a non-admin fails.

## Files

| File | Role |
|---|---|
| `src/app/admin/reports/reports.ts` | `Reports` hub component (`selector: 'app-admin-reports'`) — `tab` signal + `tabs` array |
| `src/app/admin/reports/reports.html` | Page header + `<app-pill-tabs>` + `@switch (tab())` over the five panels |
| `src/app/admin/reports/reports.scss` | `.reports__tabs { margin-bottom: 16px; }` — that's all |
| `src/app/admin/reports/customer-orders-report/customer-orders-report.{ts,html,scss}` | `CustomerOrdersReport` (`app-customer-orders-report`) |
| `src/app/admin/reports/customer-activity-report/customer-activity-report.{ts,html,scss}` | `CustomerActivityReport` (`app-customer-activity-report`) |
| `src/app/admin/reports/customer-searches-report/customer-searches-report.{ts,html,scss}` | `CustomerSearchesReport` (`app-customer-searches-report`) |
| `src/app/admin/reports/coupons-report/coupons-report.{ts,html,scss}` | `CouponsReport` (`app-coupons-report`) |
| `src/app/admin/reports/loyalty-report/loyalty-report.{ts,html,scss}` | `LoyaltyReport` (`app-loyalty-report`) |
| `src/app/core/reports/reports.service.ts` | `ReportsService` — one `list*` method per panel + all the price-review machinery |
| `src/app/core/search-log/search-log.service.ts` | `SearchLogService.logSearch(term)` — the storefront write side of the Búsquedas report |
| `src/app/core/catalog/catalog.types.ts` | Row/params/result types for every panel (see State & data flow) |
| `supabase/migrations/20260525002600_admin_customer_orders_report.sql` | `admin_customer_orders_report` RPC |
| `supabase/migrations/20260525002700_customer_activity.sql` | `customer_activity` table + `client_ip()` + `log_activity()` |
| `supabase/migrations/20260525002900_admin_customer_activity.sql` | `admin_customer_activity` RPC |
| `supabase/migrations/20260525003000_search_log.sql` | `search_log` table + `count_search_products()` + `log_search()` |
| `supabase/migrations/20260525003100_admin_customer_searches.sql` | `admin_customer_searches` RPC |
| `supabase/migrations/20260525003300_admin_coupons_report.sql` | `admin_coupons_report` RPC |
| `supabase/migrations/20260528000000_loyalty_points.sql` | `loyalty_transactions` table + trigger + `admin_loyalty_transactions_report` RPC |
| `supabase/migrations/20260704000000_pokeball_redemption.sql` | adds the `'redeem'` kind to the ledger check constraint |

## UI anatomy

Hub chrome:

1. **`<app-page-header>`** — kicker `"Operaciones"`, title `"Reportes"`, sub `"Actividad de clientes y pedidos"`.
2. **`.reports__tabs`** wrapping **`<app-pill-tabs [tabs]="tabs" [(value)]="tab" />`** with `tabs`:
   `{ key: 'orders', label: 'Pedidos por cliente' }`, `{ key: 'activity', label: 'Actividad de clientes' }`, `{ key: 'searches', label: 'Búsquedas' }`, `{ key: 'coupons', label: 'Cupones' }`, `{ key: 'loyalty', label: 'Puntos' }`. Default `tab = signal('orders')`.
3. `@switch (tab())` renders exactly one panel; switching tabs destroys the previous panel (its filter state is lost).

Every panel follows the same skeleton (shared primitives per the design manifest): `<app-filter-bar>` → conditional `<mat-progress-bar mode="indeterminate">` while `loading()` → `<app-table-card>` containing a `.report__scroll` div with a `mat-table` (`class="app-table app-table--comfy"`), an empty-state `<p class="report__empty">` when `!loading() && rows().length === 0`, and an `<app-pagination-footer>`. SCSS files hold only `.spacer`, `.report__scroll`, `.report__name` / `.report__keyword`, `.report__empty` (plus panel extras noted below).

### Pedidos por cliente (`orders`)

- Filters: `<app-search-input>` placeholder `"Buscar nombre o email"`, `<app-date-range>`, spacer, `<app-dropdown label="Ordenar" [width]="170">` with options `'total'` → `"Mayor gasto"` (default), `'orders'` → `"Más pedidos"`, `'created'` → `"Más recientes"`.
- `displayedColumns = ['customer', 'email', 'orders', 'products', 'total', 'actions']`: **Cliente** (`row.full_name || 'Sin nombre'` in `.report__name`), **Email** (mono/dim), **Pedidos** (`row.order_count`), **Productos** (`row.no_products`), **Total** (`<app-money [value]="row.total_spent" />`), and a ghost `"Ver"` `<app-btn>` → `goToView(row.id)` → `/admin/customers/:id`.
- Empty state: `"Sin pedidos en este filtro."` `perPageOptions = [10, 25, 50, 100]`, default `pageSize = 25`.

### Actividad de clientes (`activity`)

- Filters: `<app-search-input>` `"Buscar nombre o email"`, `<app-date-range>`, `<app-search-input>` `"IP"` (`[width]="160"`).
- `displayedColumns = ['comment', 'ip', 'date']`. The **Comentario** cell composes a sentence: `displayName(row)` (`customer_name || customer_email || 'Cliente'`) in `.report__name`, then a verb per `row.event_type` — `'login'` → `"inició sesión"`, `'registered'` → `"creó una cuenta"`, `'order_created'` → `"creó"` + either an `<a class="report__link">` `"un nuevo pedido"` routing to `['/admin/orders', row.order_id]` or a plain span `"un nuevo pedido"` when `order_id` is null.
- **`&ngsp;` spacing fix** (commit `105b1d0`): the template puts `&ngsp;` between `</strong>` and the verb span (and again after `"creó"`). Angular's default `preserveWhitespaces: false` strips whitespace-only text nodes between elements, so without `&ngsp;` the name and verb rendered fused ("Diegoinició sesión"). Keep it when editing this cell.
- **IP** cell shows `row.ip || '—'`; **Fecha** shows `row.created_at | date: 'short'`. Empty state: `"Sin actividad en este filtro."` `perPageOptions = [25, 50, 100, 200]`, default `pageSize = 50`. No sort control — always newest first.
- Extra SCSS: `.report__verb` (`--text-secondary`) and `.report__link` (`--brand-blue`, underline on hover).

### Búsquedas (`searches`)

- Filters: `<app-pill-tabs>` `typeTabs` (`'all'` → `"Todos"`, `'registered'` → `"Registrados"`, `'guest'` → `"Invitados"`), `<app-search-input>` `"Buscar palabra clave"`, `"Cliente"` (`[width]="180"`), `"IP"` (`[width]="150"`), `<app-date-range>`.
- `displayedColumns = ['keyword', 'found', 'customer', 'ip', 'date']`: **Palabra clave** (`.report__keyword`), **Productos** (`row.found_count`), **Cliente** (`customerLabel(row)`; `user_id` null renders dim `"Invitado"`), **IP**, **Fecha** (`date: 'short'`).
- Empty state: `"Sin búsquedas en este filtro."` `perPageOptions = [25, 50, 100, 200]`, default `pageSize = 50`. Always newest first.

### Cupones (`coupons`)

- Filters: `<app-search-input>` `"Buscar código o nombre"`, `<app-date-range>`, spacer, `<app-dropdown label="Ordenar" [width]="190">` with `'discount'` → `"Mayor descuento"` (default), `'revenue'` → `"Mayores ingresos"`, `'orders'` → `"Más pedidos"`.
- `displayedColumns = ['name', 'code', 'orders', 'discount', 'revenue', 'actions']`: **Nombre** (`row.name` or dim `—`), **Código** (mono/dim), **Pedidos**, **Descuento** and **Ingresos** (`<app-money>`), and a ghost `"Editar"` `<app-btn>` → `goToEdit(row.id)` → `/admin/coupons/:id/edit`.
- Empty state: `"Sin cupones usados en este filtro."` `perPageOptions = [10, 25, 50, 100]`, default `pageSize = 50`.

### Puntos (`loyalty`)

- Filters: `<app-search-input>` `"Buscar cliente o correo"`, `<app-date-range>`, spacer, `<app-dropdown label="Ordenar" [width]="190">` with `'created'` → `"Más recientes"` (default), `'amount'` → `"Mayor cantidad"`.
- `displayedColumns = ['created', 'customer', 'email', 'kind', 'amount', 'order']`: **Fecha** (`date: 'medium'`), **Cliente** (`row.customer_name` or dim `—`), **Correo**, **Tipo** via `kindLabel(kind)` — `'earn'` → `"Ganados"`, `'reversal'` → `"Revertidos"`, `'adjust'` → `"Ajuste"`, `'redeem'` → `"Canjeados"` —, **Puntos** (signed: `+` prefix for positive, `number: '1.0-0'`; negative amounts get class `loyalty-report__neg`, colored `var(--mat-sys-error)` — the Danger slot, deliberately not brand red), **Pedido** (`#{{ row.order_number }}` or `—`).
- Empty state: `"Sin movimientos de puntos en este filtro."` `perPageOptions = [10, 25, 50, 100]`, default `pageSize = 50`.

## Services & backend

All panel methods live on `ReportsService` (`src/app/core/reports/reports.service.ts`), call their RPC via `(this.supabase.client as any).rpc(...)`, clamp `page >= 1` and `1 <= pageSize <= 200`, coerce numeric aggregates with `Number(...) || 0` (bigint/numeric can arrive as strings), and read pagination `total` from `rows[0].total_count` (a `count(*) over()` window value; `0` on an empty page).

### `listCustomerOrders` → `admin_customer_orders_report(p_search, p_date_start, p_date_end, p_limit, p_offset, p_sort)`

Migration `20260525002600`. Aggregates `profiles` ⋈ `auth.users` with two `LEFT JOIN LATERAL`s over `orders` (order-level and item-level kept separate so `sum(o.total)` isn't multiplied by line count). Semantics mirror `admin_customers` / the dashboard so numbers reconcile:
- Orders attach by `o.user_id = p.id` **OR** `lower(o.customer_email) = lower(u.email)` (logged-out checkouts still count).
- `order_count` = non-cancelled orders; `total_spent` = `sum(o.total)` over `status in ('paid','shipped','completed')` only; `no_products` = `sum(order_items.quantity)` over non-cancelled orders.
- Date range filters `o.created_at` at CR-day boundaries (`at time zone 'America/Costa_Rica'`), matching `admin_dashboard_stats`.
- `p_search` `ilike`-matches `full_name`, `email`, **and `phone`** (the UI placeholder only mentions name/email).
- Only customers with `order_count > 0` in scope are returned (it's an orders report, not the account list).
- `p_sort`: `'total'` (default, spend desc) | `'orders'` | `'created'` (`profiles.created_at` desc — **signup** recency, not last-order recency).

### `listCustomerActivity` → `admin_customer_activity(p_search, p_date_start, p_date_end, p_ip, p_limit, p_offset)`

Migrations `20260525002700` (data) + `20260525002900` (read RPC). Reads `public.customer_activity` — RLS enabled with **no policies**; only reachable through SECURITY DEFINER functions:
- Write side: `log_activity(p_event_type)` (granted to `authenticated`) records `'login'` / `'registered'` for the current user, snapshotting name/email so rows survive renames/deletion. It **rejects `'order_created'`** (forgery guard — that event is written server-side inside `place_order` with the real `order_id`) and **dedupes `'login'` within a 10-minute window** (Supabase fires `SIGNED_IN` on token refresh / multi-tab / reload).
- `client_ip()` parses the first hop of `x-forwarded-for` from PostgREST's `request.headers` GUC; returns null on failure.
- Read RPC filters: name/email contains, IP **prefix** (`host(a.ip) ilike p_ip || '%'` — `"190.171"` narrows to a subnet), CR-day date range. `ip` is returned as text via `host()` (drops any `/32` mask). Ordered `created_at desc`.

### `listCustomerSearches` → `admin_customer_searches(p_search, p_keyword, p_date_start, p_date_end, p_ip, p_customer_type, p_limit, p_offset)`

Migrations `20260525003000` (data) + `20260525003100` (read RPC). Reads `public.search_log` (same no-policy RLS lockdown). Write path, from the storefront header (`src/app/user/header/header.ts` `onSearch()` calls `SearchLogService.logSearch(q)` fire-and-forget before navigating to `/buscar`):
1. `count_search_products(q, p_category_slug)` — `SECURITY INVOKER`, granted to `anon, authenticated`; counts `products_search` matches **in the caller's RLS context** so `found_count` reflects what the shopper actually saw. Uses the same base `search_text ilike` predicate as `search_products` but does *not* special-case the "number/total" (e.g. `15/151`) branch.
2. `log_search(p_term, p_found, p_category_slug)` — SECURITY DEFINER, granted to `anon, authenticated` (guests are logged too); trusts the client-supplied `p_found` (analytics, not security-sensitive), snapshots the customer name, captures IP via `client_ip()`.

Read RPC joins `auth.users` (email) and `categories` (name); filters: keyword contains, customer name/email contains, IP prefix, `p_customer_type` `'all' | 'guest' | 'registered'` (on `user_id` null-ness), CR-day range. Ordered `created_at desc`.

### `listCoupons` → `admin_coupons_report(p_search, p_date_start, p_date_end, p_limit, p_offset, p_sort)`

Migration `20260525003300`. Per-coupon usage from `public.orders` (which carries `coupon_id`, `discount_amount`, `total`, `status`): `order_count`, `total_discount`, `total_revenue` are all computed over the **same non-cancelled order set** so each row reconciles. Only coupons with `order_count > 0` in range are returned; **soft-deleted coupons are included** so history stays complete. `p_search` matches `code` or `name`; `p_sort`: `'discount'` (default) | `'revenue'` | `'orders'`.

### `listLoyaltyTransactions` → `admin_loyalty_transactions_report(p_search, p_date_start, p_date_end, p_limit, p_offset, p_sort)`

Migration `20260528000000`. Every `loyalty_transactions` row with `profiles.full_name`, `auth.users.email`, and `orders.order_number` joined in. Ledger rows are written by the `orders_loyalty_points` trigger (`award_or_reverse_loyalty_points()`: `'earn'` on pending→paid, `'reversal'` on paid→cancelled, descriptions `'Compra #N'` / `'Cancelación #N'`) and by `open_pokeball()` (`'redeem'`, added by migration `20260704000000`; `'adjust'` is reserved for manual fixes). `p_search` matches email or `full_name`; `p_sort`: `'created'` (default) | `'amount'` (largest first). Date range on `lt.created_at`, CR-local.

## State & data flow

Identical pattern in all five panels:

- Filter signals (`searchText`, `dateStart`/`dateEnd` as ISO `YYYY-MM-DD` strings or null from `<app-date-range>`, plus per-panel extras: `sort`, `ipText`, `keywordText`, `customerType`).
- Data signals: `rows`, `total`, `page = signal(1)`, `pageSize` (25 orders / 50 elsewhere), `loading = signal(false)`.
- Free-text filters are debounced 250 ms via `toSignal(toObservable(...).pipe(debounceTime(250), distinctUntilChanged()))`. Panels with multiple text inputs (`activity`: search + IP; `searches`: keyword + customer + IP) `combineLatest` them into one `debouncedText` signal with a tuple-comparing `distinctUntilChanged`, so date pickers and pill tabs fire discretely while typing anywhere debounces together.
- A constructor `effect()` reads every filter signal, resets `page` to 1, and calls `refresh()`; it also fires once on init, so there is no explicit initial load call. `onPage(page)` / `onPerPage(size)` bypass the effect and call `refresh()` directly (`onPerPage` also resets to page 1).
- `refresh()` sets `loading`, calls the service, writes `rows`/`total`; on error opens `MatSnackBar` with `errorMessage(err)` (falls back to `'Error desconocido'`), action `'OK'`, duration 5000 ms — rows keep the last successful fetch.

Types (all in `src/app/core/catalog/catalog.types.ts`): `CustomerOrdersReportParams/Row/Result`, `CustomerActivityParams/Row/Result`, `CustomerSearchParams/Row/Result` + `SearchCustomerType`, `CouponReportParams/Row/Result`, `LoyaltyReportParams/Row/Result` + `LoyaltyTransactionKind`.

## Behaviors & edge cases

- **Tab switch = state reset:** `@switch` destroys the outgoing panel, so filters/pagination reset when you come back to a tab.
- **Loading:** indeterminate bar between filter bar and table; previous rows stay visible during refresh.
- **Out-of-range page:** `total_count` comes from the rows themselves, so an empty page reports `total = 0` and the footer collapses even if earlier pages had data.
- **Orders report can show `₡0` totals with orders > 0** — pending orders count toward `order_count`/`no_products` but not `total_spent` (realized revenue only).
- **Activity `order_created` without a link:** `customer_activity.order_id` is `on delete set null`, so rows for deleted orders render the plain-span variant.
- **Login events are throttled**, not exhaustive: at most one `'login'` row per user per 10 minutes.
- **Guest searches:** `search_log.user_id` null → the report's Cliente cell shows `"Invitado"`; the `Registrados`/`Invitados` tabs filter on exactly that.
- **`found_count` is what the shopper saw:** computed in the shopper's RLS context (active, in-stock via `products_search`'s `security_invoker`), then trusted from the client.
- **Coupons "Editar" can open a soft-deleted coupon** — the report includes them by design.
- **Loyalty negatives** (`reversal`, `redeem`, negative `adjust`) render red via `--mat-sys-error`; balances can legitimately go negative (reversal after points were spent).

## Gotchas / invariants

- **Keep the `&ngsp;` entities in `customer-activity-report.html`.** They are the only thing separating the customer name from the verb; plain spaces are stripped by the compiler's whitespace collapsing (fix landed in commit `105b1d0`).
- **`category_name` is fetched but never displayed** in the Búsquedas panel — `search_log.category_id` is a reserved column (storefront search isn't category-scoped yet), so it's always null today; the RPC and `CustomerSearchRow` already carry it for a future column.
- **`description` is fetched but never displayed** in the Puntos panel — `LoyaltyReportRow.description` (e.g. `'Compra #12'`) is mapped by the service but no column shows it.
- **`'redeem'` rows have no order**, so their Pedido cell is `—`; identify the redemption via the hidden `description` (tier label) if you add a column.
- **The Cliente filter in Búsquedas matches the *snapshotted* `customer_name`** (taken at search time) plus the live `auth.users.email` — a renamed customer's old searches still match the old name.
- **`admin_customer_orders_report` searches `phone` too**, though the placeholder says `"Buscar nombre o email"` — same predicate as `admin_customers`.
- **`'created'` sort in the orders report is customer-signup recency** (`profiles.created_at`), despite living next to order-centric sorts.
- No URL sync anywhere (tab, filters, page all reset on reload), matching the other admin list screens.
- All RPC calls go through `(client as any).rpc(...)` — no compile-time checking of RPC names/params.
- IP filters are **prefix** matches, not contains; the RPCs return `host(ip)` text, never inet.
- `customer_activity` and `search_log` are RLS-enabled with **zero policies** — never add a direct PostgREST read/write against them; go through the definer functions.
- `ReportsService` also owns the whole price-review runner (`priceReviewSummary/Next/Ignore/Accept`, `runPriceReviewNow`, `priceReviewQualifyingCount`) used by `/admin/price-review` — don't assume this file is reports-hub-only when refactoring.

## Related docs

- [customers.md](./customers.md) / [customer-detail.md](./customer-detail.md) — same order-aggregation semantics; the "Ver" target
- [orders.md](./orders.md) / [order-detail.md](./order-detail.md) — the activity report's order links
- [coupons.md](./coupons.md) / [coupon-edit.md](./coupon-edit.md) — the coupons report's "Editar" target
- [price-review.md](./price-review.md) — the other consumer of `ReportsService`
- [config.md](./config.md) — loyalty settings that drive the Puntos ledger
- [../storefront/shell-header-footer.md](../storefront/shell-header-footer.md) — where `SearchLogService.logSearch` fires
- [../../architecture/loyalty-and-pokedex.md](../../architecture/loyalty-and-pokedex.md) — points economy end to end
- [../../architecture/backend-rpcs-and-functions.md](../../architecture/backend-rpcs-and-functions.md) — RPC catalog
- [../../design-manifest.md](../../design-manifest.md) — `app-page-header`, `app-pill-tabs`, `app-filter-bar`, `app-search-input`, `app-date-range`, `app-dropdown`, `app-table-card`, `app-money`, `app-btn`, `app-pagination-footer` props
