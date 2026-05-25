# Dashboard: second panel for recently-active users (by last login)

## Context

The admin dashboard now has one customers panel ("Usuarios recientes") listing the 8
latest sign-ups (`admin_customers` sorted by `created_at desc`, showing registration
date). The user wants **two** distinct customer panels:

- **Últimos registros** — newest accounts, by `created_at` (the existing panel; date shown = registration).
- **Actividad reciente** — most recently *active* accounts, by `auth.users.last_sign_in_at` (date shown = last login).

`last_sign_in_at` is maintained by Supabase Auth and is already reachable through the
join the RPC does, but the RPC neither returns it nor can sort by it — so this needs a
small DB change plus a second panel.

## Approach

Extend `admin_customers` to (a) return `last_sign_in_at` and (b) accept a `p_sort`
param (`'created'` default | `'active'`). Thread an optional `sort` through the service,
add a second signal + panel on the dashboard. The panels grid is already 2-up, so the
two customer panels naturally fill row 2 (trend + orders on row 1).

Because adding a column to a `RETURNS TABLE` changes the function's return type, a plain
`CREATE OR REPLACE` errors — the migration must `DROP` then recreate. Dropping the 3-arg
function and recreating it 4-arg-with-default keeps the existing
`rpc('admin_customers', {p_search,p_limit,p_offset})` call resolving (p_sort defaults) and
avoids PostgREST overload ambiguity, so pushing the migration first does not break the
live `/admin/customers` screen.

## Steps

1. **Pull the live function def first** (migration workflow — shared dev DB may be ahead
   of the committed migration). Use MCP `execute_sql`:
   `select pg_get_functiondef('public.admin_customers(text,int,int)'::regprocedure);`
   Base the DROP+CREATE on whatever is actually live, not just the committed
   `20260525002300_admin_customers.sql`, in case it drifted.

2. **New migration** `supabase/migrations/20260525002500_admin_customers_last_sign_in.sql`:
   - `drop function if exists public.admin_customers(text, int, int);`
   - Recreate with new signature `admin_customers(p_search text default '', p_limit int default 25, p_offset int default 0, p_sort text default 'created')`.
   - Add `last_sign_in_at timestamptz` to the `returns table(...)` (place it right after `created_at`) and `u.last_sign_in_at` to the SELECT list. Keep all existing columns/agg logic identical.
   - Replace the single `order by p.created_at desc` with:
     ```sql
     order by
       case when p_sort = 'active' then u.last_sign_in_at end desc nulls last,
       p.created_at desc
     ```
     (For `'created'` the CASE is NULL for every row → pure `created_at desc`. For `'active'` it sorts by last login, nulls last, with created_at as tiebreaker.)
   - `grant execute on function public.admin_customers(text, int, int, text) to authenticated;`
   - Also add `'last_sign_in_at', u.last_sign_in_at` to the `admin_customer(uuid)` detail
     `jsonb_build_object` (same file) so `CustomerDetail` (which extends `CustomerRow`)
     stays type-honest. Detail fn is jsonb-returning, so `CREATE OR REPLACE` is fine there.

3. **Apply + regen types**: `npm run db:push:dev`, then `npm run db:types:dev` to refresh
   `src/app/core/supabase/database.types.ts` (generated; the app uses the hand-written
   interfaces below, but keep generated types in sync per project habit).

4. **Types** (`src/app/core/catalog/catalog.types.ts`):
   - Add `last_sign_in_at: string | null;` to `CustomerRow` (after `created_at`).
   - Add `sort?: 'created' | 'active';` to `AdminCustomerListParams`.

5. **Service** (`src/app/core/customers/customers.service.ts`):
   - Pass `p_sort: params.sort ?? 'created'` in the `admin_customers` rpc args.
   - Map `last_sign_in_at: r.last_sign_in_at` in the row mapper (and the `CustomerListRpcRow`
     type inherits it via the `Omit<CustomerRow, ...>` base, so no extra field needed there).

6. **Dashboard component** (`src/app/admin/admin-dashboard/admin-dashboard.ts`):
   - Add `protected readonly activeCustomers = signal<CustomerRow[] | null>(null);`
   - In `ngOnInit()`, add a parallel fetch mirroring the existing one:
     `void this.customers.listCustomers({ pageSize: 8, sort: 'active' }).then((r) => this.activeCustomers.set(r.rows)).catch(() => this.activeCustomers.set([]));`
   - (`recentCustomers` stays as-is, the registration list.)

7. **Template** (`src/app/admin/admin-dashboard/admin-dashboard.html`):
   - Rename the existing panel's eyebrow from "Usuarios recientes" → **"Últimos registros"** (disambiguates from the new one). It keeps showing `c.created_at | date: 'd/MM/yy'`.
   - Add a second `<section class="panel panel--customers">` right after it, titled
     **"Actividad reciente"**, "Ver todos" → `/admin/customers`, iterating `activeCustomers()`
     with the same null/empty/row structure. Each row's date column shows last login:
     `@if (c.last_sign_in_at) { {{ c.last_sign_in_at | date: 'd/MM HH:mm' }} } @else { Nunca }`
     (matches the orders panel's `d/MM HH:mm`; "Nunca" for never-logged-in). Empty-state
     copy: "Aún no hay actividad."
   - Rows reuse the existing `.recent-user__*` classes and link to `['/admin/customers', c.id]`.

8. **SCSS** (`src/app/admin/admin-dashboard/admin-dashboard.scss`): no new rules needed —
   both panels reuse `.panel*` and `.recent-user__*`. With four panels in the
   `repeat(2, minmax(0,1fr))` grid they tile 2×2 (trend, orders / registros, actividad);
   collapses to one column under 720px as already configured. Verify visually.

## Files to modify / create
- `supabase/migrations/20260525002500_admin_customers_last_sign_in.sql` — new (drop+recreate `admin_customers`, add column + p_sort; add field to `admin_customer`)
- `src/app/core/catalog/catalog.types.ts` — `CustomerRow.last_sign_in_at`, `AdminCustomerListParams.sort`
- `src/app/core/customers/customers.service.ts` — pass `p_sort`, map `last_sign_in_at`
- `src/app/admin/admin-dashboard/admin-dashboard.ts` — `activeCustomers` signal + fetch
- `src/app/admin/admin-dashboard/admin-dashboard.html` — rename panel 1, add panel 2
- `src/app/core/supabase/database.types.ts` — regenerated

## Reused utilities
- `CustomersService.listCustomers()` at `src/app/core/customers/customers.service.ts:24` — now param-driven by `sort`
- Existing `.recent-user__*` styles + `.panel*` classes in `admin-dashboard.scss` — both panels share them
- `DatePipe` (already imported in `admin-dashboard.ts`) — no new imports

## Verification
- `npm run db:push:dev` applies cleanly; re-run the `pg_get_functiondef` check to confirm
  the new 4-arg signature and that the old 3-arg one is gone.
- Quick data sanity via MCP `execute_sql`:
  `select email, created_at, last_sign_in_at from admin_customers('',8,0,'active');`
  → rows ordered by last login desc, nulls last.
- `npm start` (already on :4242) → `/admin`: row 1 = trend + orders, row 2 = "Últimos
  registros" + "Actividad reciente". Confirm registros is newest-signup-first and actividad
  is most-recently-active-first; "Nunca" shows for any never-logged-in account.
- The existing `/admin/customers` list still loads (proves the default-sort call path is intact).
- `npm run build` → no TS/template type errors.

## Out of scope
- A true relative-time ("hace 2 h") pipe — using `d/MM HH:mm` to match the orders panel.
- Surfacing last-login on the `/admin/customers` list or `customer-detail` UI (the detail
  RPC returns the field for type-consistency, but no UI is added there).
- Sorting controls / pagination on either dashboard panel (fixed top-8, like recent orders).
