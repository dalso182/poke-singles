# Dashboard — Inventory value KPI

## Context
Admin wants a headline number for "how much money is sitting in stock right now" —
the sum of `price × quantity` over products that are **active** and have
**quantity > 0** (out-of-stock or hidden SKUs don't count as inventory). It
belongs next to the other KPIs (Pedidos totales / Ventas totales / Clientes / En
línea ahora) on the admin dashboard, and should be one round trip — same RPC as
the rest of the headline stats, not a separate call.

## Approach
Extend the existing `admin_dashboard_stats()` RPC with an `inventory_value`
field, thread it through `DashboardStats` and `DashboardService` (defensive
numeric coercion like the other sums), and render a fifth KPI card following the
existing `.kpi` pattern. The card gets a new accent (indigo `#4338ca`) to stay
distinct from the four existing accents (primary, success, amber, teal) and
honors the brand-red rule by avoiding red entirely. The auto-fit grid already in
place absorbs the extra tile with no layout change.

## Steps

1. **New migration — extend the dashboard RPC** —
   `supabase/migrations/20260525003400_admin_dashboard_stats_inventory.sql`.
   `create or replace function public.admin_dashboard_stats()` (same signature
   and `is_admin()` guard) and add to the `jsonb_build_object` payload:
   ```sql
   'inventory_value', coalesce(
     (select sum(price * quantity) from public.products
      where active = true and quantity > 0), 0)
   ```
   Keep every other field byte-identical to the current definition so the diff
   is exactly the new key. Apply via `npm run db:push:dev` (per
   [[project_migration_workflow]] — not MCP `apply_migration`).

2. **Type — extend `DashboardStats`** —
   `src/app/core/catalog/catalog.types.ts:545`. Add
   `inventory_value: number;` alongside the other totals, with a short comment
   noting it counts only `active = true AND quantity > 0`.

3. **Service — coerce + default** —
   `src/app/core/dashboard/dashboard.service.ts`. Add `inventory_value: 0` to
   `EMPTY_STATS`, and `inventory_value: Number(stats.inventory_value) || 0` to
   the normalized return (matches how `total_sales` is handled — Postgres
   numeric sums can arrive as strings).

4. **Regenerate types (optional but tidy)** —
   `npm run types:gen` so `database.types.ts` reflects the updated RPC return
   shape. Skip if it churns unrelated types; the manual `DashboardStats`
   interface is what the component actually uses.

5. **Dashboard component — new KPI tile** —
   `src/app/admin/admin-dashboard/admin-dashboard.html`. Add a fifth
   `.kpi.kpi--inventory` card after `.kpi--customers` (and before
   `.kpi--online` so "live" stays at the right edge), non-clickable (no
   `/admin/inventory` route exists), with:
   - icon: `inventory_2` (Material — boxes, reads as stock)
   - label: `Valor de inventario`
   - metric: `'₡' + compact(stats()!.inventory_value)` using the existing
     `compact()` helper for K/M abbreviation (consistent with `total_sales`).

6. **Styles — new accent** —
   `src/app/admin/admin-dashboard/admin-dashboard.scss:99` area. Add
   `.kpi--inventory { --kpi-accent: #4338ca; }` (indigo). Sits below the
   existing `.kpi--customers` rule with the same inline-comment convention; the
   chosen color is deliberately not brand red (per [[theme]] hard rule) and not
   reused from the other four accents.

## Files to modify / create
- `supabase/migrations/20260525003400_admin_dashboard_stats_inventory.sql` — new migration, redefines RPC with `inventory_value`.
- `src/app/core/catalog/catalog.types.ts` — add field to `DashboardStats`.
- `src/app/core/dashboard/dashboard.service.ts` — default + coerce.
- `src/app/admin/admin-dashboard/admin-dashboard.html` — new `.kpi--inventory` tile.
- `src/app/admin/admin-dashboard/admin-dashboard.scss` — accent rule for the new tile.
- `src/app/core/supabase/database.types.ts` — regenerated (only if `npm run types:gen` is run).

## Reused utilities
- `compact(n)` at `src/app/admin/admin-dashboard/admin-dashboard.ts:115` — formats large numbers as `1.2K` / `62.6M`, reused so the inventory tile matches the `total_sales` tile's look.
- `.kpi` / `.kpi__icon` / `.kpi__body` / `.kpi__label` / `.kpi__metric` pattern in `admin-dashboard.scss:31` — new tile reuses these classes; only the accent override is new.
- `admin_dashboard_stats()` security pattern at `supabase/migrations/20260525002200_admin_dashboard_stats.sql` — `security definer` + `is_admin()` guard already gates the whole payload, so the new aggregate inherits the same protection.

## Verification
1. `npm run db:push:dev` — migration applies cleanly.
2. `npm start` and load `/admin` as an admin user — the new "Valor de inventario" tile renders between Clientes and En línea ahora, shows `₡<value>`, and shows `—` only during initial load.
3. Spot-check the number in SQL:
   `select sum(price * quantity) from public.products where active and quantity > 0;`
   should equal the displayed amount (modulo K/M rounding from `compact`).
4. As a non-admin (logged-out or customer), calling `admin_dashboard_stats()` must still raise `NOT_AUTHORIZED` — the guard is unchanged.
5. Visually: no brand red on the new tile; the indigo accent only appears on its icon chip; existing four KPIs unchanged.

## Out of scope
- A dedicated `/admin/inventory` route or drilldown — the tile is informational, not a link.
- A "low stock" or "by-set inventory value" breakdown — separate feature.
- Currency formatting other than `₡` + `compact` (no thousands separators on the headline; the trend panel keeps its `| number: '1.0-0'` formatting).
- Caching the aggregate — products is small enough (~5k rows) that `sum(price * quantity)` over the partial index is cheap; revisit if the RPC slows down.
