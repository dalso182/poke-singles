# Admin — Customers list (Clientes)

> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose

Back-office list of every registered customer account (a `profiles` row joined to `auth.users` for the email), enriched with purchase activity: order count, total spent, and last order date. It is the entry point to the per-customer detail screen and is searchable by name, email, or phone.

## Route & access

- **Path:** `/admin/customers` (`pathMatch: 'full'`, lazy `loadComponent` in `src/app/app.routes.ts`).
- **Guards:** `adminGuard` on the `/admin` parent route (`canActivate` + `canActivateChild`), so only admins reach it.
- **Query params:** none. Search/pagination state lives only in component signals (not URL-synced — lost on reload).

## Files

| File | Role |
|---|---|
| `src/app/admin/customers/customers.ts` | `Customers` component (`selector: 'app-admin-customers'`) — signals, debounced search, pagination, navigation |
| `src/app/admin/customers/customers.html` | Template: page header, filter bar, `mat-table`, pagination footer |
| `src/app/admin/customers/customers.scss` | Screen-specific bits only (`.customers__scroll`, `.customers__customer`, `.customers__email`, `.customers__empty`) — table chrome comes from `.app-table` + shared primitives |
| `src/app/core/customers/customers.service.ts` | `CustomersService` — wraps the `admin_customers`, `admin_customer`, and `admin_pokedex_leaderboard` RPCs |
| `src/app/core/catalog/catalog.types.ts` | `CustomerRow`, `AdminCustomerListParams`, `AdminCustomerListResult` |
| `supabase/migrations/20260525002300_admin_customers.sql` | Creates the original `admin_customers` / `admin_customer` RPCs |
| `supabase/migrations/20260525002500_admin_customers_last_sign_in.sql` | Drops + recreates `admin_customers` with `last_sign_in_at` and a `p_sort` param |

## UI anatomy

Top to bottom (all shared primitives are documented in the design manifest — see [Related docs](#related-docs)):

1. **`<app-page-header>`** — kicker `"Operaciones"`, title `"Clientes"`, sub `"Cuentas registradas y su actividad de compra"`.
2. **`<app-filter-bar>`** containing a single **`<app-search-input>`** two-way bound to `searchText`, placeholder `"Buscar nombre, email o teléfono"`.
3. **`<mat-progress-bar mode="indeterminate">`** — shown only while `loading()`.
4. **`<app-table-card>`** wrapping:
   - `.customers__scroll` (horizontal overflow guard) with a `mat-table` (`class="app-table app-table--comfy"`). `displayedColumns = ['customer', 'phone', 'orders', 'spent', 'last', 'actions']`:
     - **Cliente** — `.customers__customer`: `<strong>` full name (fallback `"Sin nombre"`) over `.customers__email` (mono, dim).
     - **Teléfono** — mono; em-dash `—` (class `is-dim`) when null.
     - **Pedidos** — right-aligned, mono, `row.order_count`.
     - **Total gastado** — right-aligned `<app-money [value]="row.total_spent" />`.
     - **Último pedido** — `row.last_order_at | date: 'short'`, or `—` when null.
     - **(actions)** — `<app-btn variant="ghost" size="sm">` labeled `"Ver"` → `goToView(row.id)`.
   - Empty state: `.customers__empty` paragraph `"Sin clientes en este filtro."` (only when `!loading() && rows().length === 0`).
   - **`<app-pagination-footer>`** — `perPageOptions = [10, 25, 50, 100]`, wired to `onPage` / `onPerPage`.

## Services & backend

- **`CustomersService.listCustomers(params)`** → RPC **`admin_customers(p_search, p_limit, p_offset, p_sort)`**:
  - `SECURITY DEFINER` + `is_admin()` guard (raises `NOT_AUTHORIZED`), `STABLE`, `set search_path = public, pg_temp`, granted to `authenticated`. Definer access is required because it reads `auth.users` (not exposed over PostgREST).
  - Reads `public.profiles` joined to `auth.users` with a `LEFT JOIN LATERAL` aggregate over `public.orders`. **Orders attach to an account by `user_id` OR case-insensitive `customer_email` match** — checkouts placed while logged out still count.
  - Semantics (mirrors the dashboard): `order_count` = `count(*) filter (where status <> 'cancelled')`; `total_spent` = `sum(total) filter (where status in ('paid','shipped','completed'))` (realized revenue only — pending orders count toward `order_count` but not `total_spent`); `last_order_at` = `max(created_at)` of non-cancelled orders.
  - Search: `p_search` matched with `ilike '%…%'` against `full_name`, `email`, and `phone`.
  - `p_sort`: `'created'` (default, `created_at desc`) or `'active'` (`last_sign_in_at desc nulls last`). The **Customers screen never passes `sort`** — the `'active'` option exists for the dashboard's "Actividad reciente" panel.
  - Pagination: `count(*) over()` returned as `total_count` on every row; the service reads it from `rows[0]` (0 when the page is empty).
  - The service coerces `order_count` / `total_spent` with `Number(...) || 0` because bigint/numeric aggregates may arrive as strings; clamps `page >= 1` and `1 <= pageSize <= 200`, default `pageSize` 25.
- **`CustomersService.getCustomer(id)`** → RPC `admin_customer(p_id)` — used by the detail screen, see [customer-detail.md](./customer-detail.md).
- **`CustomersService.pokedexLeaderboard(limit = 10)`** → RPC `admin_pokedex_leaderboard(p_limit)` — used by the dashboard "Top Pokédex" panel, not by this screen.

## State & data flow

Signals on `Customers`:

- `searchText = signal('')` — raw input value.
- `searchValue` — `toSignal(toObservable(searchText).pipe(debounceTime(250), distinctUntilChanged()), { initialValue: '' })`.
- `rows = signal<CustomerRow[]>([])`, `total = signal(0)`, `page = signal(1)`, `pageSize = signal(25)`, `loading = signal(false)`.

Flow: a constructor `effect()` reads `searchValue()`, resets `page` to 1, and calls `refresh()`. It also fires once on init, so the first load needs no explicit call. `onPage(page)` / `onPerPage(size)` set the signals and call `refresh()` directly (per-page change also resets to page 1). `refresh()` sets `loading`, calls `listCustomers({ search: searchValue() || undefined, page, pageSize })`, writes `rows`/`total`, and on error opens a `MatSnackBar` with the error message (`'Error desconocido'` fallback), action `'OK'`, duration 5000 ms. `goToView(id)` navigates to `/admin/customers/:id`.

## Behaviors & edge cases

- **Loading:** indeterminate progress bar above the card; the table stays rendered with the previous rows during refresh.
- **Empty:** `"Sin clientes en este filtro."` under the table; pagination footer still renders with `total = 0`.
- **Error:** snackbar only — rows keep whatever the last successful fetch returned.
- **Debounce:** 250 ms on the search box; page resets to 1 on every committed search change.
- No date filtering, no export, no row-click navigation (only the `"Ver"` button navigates).

## Gotchas / invariants

- **`last_sign_in_at` is fetched but never displayed here.** The RPC and `CustomerRow` carry it (added by migration `20260525002500` for the dashboard's recent-activity panel), yet `displayedColumns` has no sign-in column. If you add one, the data is already in the row.
- The `p_sort` capability (`'created' | 'active'`) is plumbed through `AdminCustomerListParams.sort` but this screen never sets it — service default is `'created'`.
- Migration `20260525002500` had to `DROP FUNCTION public.admin_customers(text, int, int)` before recreating with 4 args: adding a column to `RETURNS TABLE` changes the return type (no `CREATE OR REPLACE`), and dropping the old overload avoids PostgREST ambiguity. Repeat that pattern for any future column addition.
- Filter/pagination state is not URL-synced — browser refresh returns to page 1 with an empty search.
- All service RPC calls go through `(this.supabase.client as any).rpc(...)` — the generated DB types don't cover these functions, so there is no compile-time checking of RPC names/params.
- `total_count` is a window aggregate repeated on every row; an empty page yields `total = 0` even if earlier pages had rows (out-of-range paging shows an empty table).
- `total_spent` ≠ "sum of orders in the Pedidos column": counts exclude cancelled, spend only counts paid/shipped/completed.

## Related docs

- [customer-detail.md](./customer-detail.md) — the `"Ver"` target, `/admin/customers/:id`
- [dashboard.md](./dashboard.md) — consumes `admin_customers` (`sort: 'active'`) and `admin_pokedex_leaderboard`
- [reports.md](./reports.md) — the "Pedidos por cliente" report reuses the same aggregation semantics
- [../../design-manifest.md](../../design-manifest.md) — `app-page-header`, `app-filter-bar`, `app-search-input`, `app-table-card`, `app-money`, `app-btn`, `app-pagination-footer` props
- [../../architecture/routing-and-guards.md](../../architecture/routing-and-guards.md) — `adminGuard` details
- [../../architecture/backend-rpcs-and-functions.md](../../architecture/backend-rpcs-and-functions.md) — RPC catalog
