# Admin dashboard
> Part of the Poke-Singles docs set. Verified against source on 2026-07-22. Load together with /CLAUDE.md.

## Purpose
Landing screen of `/admin`: headline KPIs (orders, sales, customers, inventory value, available singles, live visitors), two operational tiles (pending orders, active raffles), a 30-day sales/orders trend with sparklines, and four activity panels — recent orders, newest sign-ups, recently active customers, and the Pokédex leaderboard. Everything is read-only; each block links into its admin screen.

## Route & access
- Path: `/admin` (empty child path, `pathMatch: 'full'`), lazy `AdminDashboard`, rendered inside `AdminShell`.
- Access: inherited `adminGuard` (canActivate + canActivateChild on the `admin` parent).
- No query params. The "Ver pendientes" tile links out with `queryParams: { status: 'pending' }` to `/admin/orders`; Top-Pokédex rows link to `/admin/customers/:id` with `queryParams: { tab: 'pokedex' }`.

## Files
- `src/app/admin/admin-dashboard/admin-dashboard.ts` — `AdminDashboard` component: signals, computeds, all fetches.
- `src/app/admin/admin-dashboard/admin-dashboard.html` — template (KPIs, tiles, trend, panels).
- `src/app/admin/admin-dashboard/admin-dashboard.scss` — `.dashboard__kpis`, `.dashboard__tiles`, `.panel`, `.trend`, `.recent*` styling.
- `src/app/core/dashboard/dashboard.service.ts` — `DashboardService.getStats()` → `admin_dashboard_stats` RPC (returns `EMPTY_STATS` on error).
- `src/app/core/presence/presence.service.ts` — `PresenceService` Realtime presence: `watchOnlineCount()`, `teardown()`, `joinAsVisitor()` (storefront side).
- `src/app/shared/sparkline/sparkline.ts` — `Sparkline` (`app-sparkline`) inline-SVG trend chart.
- `src/app/core/orders/orders.service.ts` — `listOrders({ pageSize: 8 })` for the recent-orders panel.
- `src/app/core/customers/customers.service.ts` — `listCustomers()` (×2) and `pokedexLeaderboard()`.
- `src/app/core/catalog/raffles.service.ts` — `listSummary()` for the raffle tile.
- Types in `src/app/core/catalog/catalog.types.ts`: `DashboardStats`, `DashboardDailyBucket`, `OrderRow`, `OrderStatus`, `CustomerRow`, `PokedexLeaderboardRow`, `RaffleSummaryRow`.

## UI anatomy
Top to bottom inside `section.dashboard`:
1. Header: `<h1>Panel de administración</h1>` + muted `"Resumen del estado de la tienda."`.
2. **KPI row** (`.dashboard__kpis`, six tiles with colored icon chips; `—` until stats resolve):
   - `kpi--orders` (link → `/admin/orders`): `"Pedidos totales"`, `compact(stats.total_orders)`.
   - `kpi--sales` (link → `/admin/orders`): `"Ventas totales"`, `'₡' + compact(stats.total_sales)`.
   - `kpi--customers` (non-link div): `"Clientes"`, `compact(stats.total_customers)`.
   - `kpi--inventory` (non-link div): `"Valor de inventario"`, `'₡' + compact(stats.inventory_value)`.
   - `kpi--singles` (link → `/admin/products`, violet `#7c3aed` accent, `style` icon): `"Singles disponibles"`, `compact(singlesCount()!)` — `—` while `singlesCount() === null` (loading or fetch error).
   - `kpi--online` (non-link div): pulsing `.kpi__live` dot + `"En línea ahora"`, `onlineCount()` (live Realtime presence).
3. **Operational tiles** (`.dashboard__tiles`):
   - Pedidos tile → `/admin/orders?status=pending`. Metric = `pendingCount()`; caption `"Sin pendientes ✓"` / `"Pedido pendiente"` / `"Pedidos pendientes"`; CTA `"Ver pendientes"` when > 0.
   - Rifas tile → `/admin/raffles`, gets `dashboard__tile--alert` when a raffle draws today. Metric = `activeCount()`; caption `"Rifa activa"`/`"Rifas activas"`. Extra line: `"¡Sorteo hoy: {name}!"` (with `celebration` icon) when `todayRaffle()`, else `"Próximo sorteo: d/MM/yyyy · {name}"` (date piped with `'UTC'` timezone), else `"Sin fecha de sorteo definida"` if there are active raffles without dates. CTA `"Ver rifas"`.
4. **Panels grid** (`.dashboard__panels`):
   - `panel--trend` — eyebrow `"Últimos 30 días"`. Two `.trend__row`s: `"Ventas"` (`₡` + `salesLast30 | number:'1.0-0'`) with `<app-sparkline [values]="salesSeries()" stroke="var(--success)" />`, and `"Pedidos"` (`ordersLast30()`) with a default-stroke (`var(--mat-sys-primary)`) sparkline.
   - `panel--orders` — eyebrow `"Pedidos recientes"`, link `"Ver todos"` → `/admin/orders`. Rows (`.recent__row`, link → `/admin/orders/:id`): `#{{order_number}}` (mono), `customer_name`, `₡total`, status pill `order-status--{{status}}` with `statusLabel()` (`Pendiente/Pagado/Enviado/Completado/Cancelado`), date `d/MM HH:mm`. Empty copy: `"Aún no hay pedidos."`; loading: `"Cargando…"`.
   - `panel--customers` (×3, same class):
     - `"Últimos registros"` → newest sign-ups (`full_name || 'Sin nombre'`, email, `created_at | date:'d/MM/yy'`). Empty: `"Aún no hay usuarios registrados."`
     - `"Actividad reciente"` → sorted by last sign-in; date `d/MM HH:mm` or `"Nunca"`. Empty: `"Aún no hay actividad."`
     - `"Top Pokédex"` (link `"Ver clientes"` → `/admin/customers`): ranked rows (`recent-user__row--ranked`) with rank number, name/email, and `catching_pokemon` icon + `caught_count`; row links to `/admin/customers/:id?tab=pokedex`. Empty: `"Aún no hay Pokémon capturados."`

## Services & backend
- `DashboardService.countAvailableSingles()` — resolves the `categories` row with `slug = 'singles'` (`maybeSingle`; missing → throws `SINGLES_CATEGORY_MISSING`), then a `head: true, count: 'exact'` count over `products` with `category_id = <singles>`, `active = true`, `quantity > 0`. Throws on error — the dashboard `.catch()`es (console `[dashboard] countAvailableSingles`) leaving `singlesCount` null, so the tile keeps showing `—`.
- `DashboardService.getStats()` → RPC **`admin_dashboard_stats`** (security definer, gated by `is_admin()` inside the function, no client params). Returns `{ total_orders, total_sales, total_customers, pending_orders, inventory_value, series: [{ d, orders, sales }] }`. `inventory_value` = `sum(price × quantity)` over products where `active = true AND quantity > 0` (per the `DashboardStats` type doc). Service coerces every numeric with `Number(x) || 0` and returns zeroed `EMPTY_STATS` on RPC error (console-logged as `[dashboard] admin_dashboard_stats`).
- `PresenceService.watchOnlineCount()` — subscribes to Supabase Realtime presence channel **`'online'`** (no backing table, anon key) *without tracking*, so the watching admin isn't counted. Counts presence keys having a member with `role === 'visitor'` (storefront shells call `joinAsVisitor()`). Recounts on `sync`/`join`/`leave`. `teardown()` removes the watch channel and resets the count to 0; called in `ngOnDestroy`.
- `OrdersService.listOrders({ pageSize: 8 })` — `orders` table select `*, order_items(seller_id)` with `count: 'exact'`, ordered `created_at` desc; visible via `orders_admin_all` RLS.
- `CustomersService.listCustomers({ pageSize: 8 })` and `({ pageSize: 8, sort: 'active' })` — RPC **`admin_customers`** (`p_search`, `p_limit`, `p_offset`, `p_sort: 'created' | 'active'`).
- `CustomersService.pokedexLeaderboard()` (default `limit = 10`) — RPC **`admin_pokedex_leaderboard`** (`p_limit`); rows `{ id, full_name, email, caught_count }`, `caught_count` coerced with `Number() || 0`.
- `RafflesService.listSummary()` — RPC **`admin_raffles_summary`**.

## State & data flow
Signals (all start `null` = loading): `stats: DashboardStats | null`, `recentOrders: OrderRow[] | null`, `recentCustomers`, `activeCustomers: CustomerRow[] | null`, `raffleRows: RaffleSummaryRow[] | null`, `topPokedex: PokedexLeaderboardRow[] | null`, `singlesCount: number | null`. `onlineCount` is the readonly signal returned by `watchOnlineCount()`.

Computeds:
- `pendingCount` = `stats()?.pending_orders ?? null` (same RPC as the KPIs — no separate count query here).
- `salesSeries` / `ordersSeries` — map `stats().series` to number arrays for the sparklines; `salesLast30` / `ordersLast30` — period sums.
- `activeRaffles` = raffle rows with `status === 'scheduled'`; `activeCount` = length.
- `todayStr` — component-construction-time local (Costa Rica) date as `YYYY-MM-DD`.
- `nextRaffle` — soonest active raffle with `draw_at.slice(0,10) >= todayStr`; `todayRaffle` — active raffle whose `draw_at` UTC date portion equals `todayStr`.

`ngOnInit` fires all seven fetches in parallel (fire-and-forget `void … .then()`); `ngOnDestroy` calls `presence.teardown()`. There is no refresh/reload trigger — data is a point-in-time snapshot except the live presence count.

## Behaviors & edge cases
- Loading: KPI metrics render `—` while `stats() === null`; each panel shows `"Cargando…"` until its signal resolves.
- Errors: `getStats()` degrades to zeroed stats (tiles show `0`, not an error). Each panel fetch `.catch()`es to `[]`, so a failed RPC renders that panel's empty-state copy — errors are indistinguishable from genuinely empty data in the UI.
- `compact(n)` abbreviates OpenCart-style: `>= 1_000_000` → `X.XM`, `>= 1_000` → `X.XK` (one decimal, trailing-zero trimmed via `trim()`), else `Math.round(n)`. Currency tiles prefix `₡` in the template.
- Raffle date comparison is deliberately string-based: `draw_at` is stored at UTC midnight of the admin-picked date, so `slice(0, 10)` compared against the *local* `todayStr` matches the intended calendar day; the template pipes it with `: 'UTC'` for the same reason.
- The presence count only includes members announcing `role: 'visitor'` — admins browsing `/admin` are never counted; an admin who also has the storefront open in another tab *is* (the visitor channel stays tracked).

## Gotchas / invariants
- `pendingCount` comes from the `admin_dashboard_stats` payload — unlike the AdminShell's amber nav badge, which uses `OrdersService.countPendingOrders()`. Two sources; they can transiently disagree.
- `todayStr` is computed once at construction; a dashboard left open past midnight keeps yesterday's "today" until re-navigation.
- Zeroed-stats-on-error means a broken RPC silently shows `0` orders/sales — check the console (`[dashboard] admin_dashboard_stats`) before trusting zeros.
- The three customer panels reuse the same `panel--customers` class — style changes there hit "Últimos registros", "Actividad reciente" *and* "Top Pokédex".
- `Sparkline` inputs: `values: number[]`, `height` (default **44** px), `stroke` (default `'var(--mat-sys-primary)'`). Flat series render a mid-height line (`norm = 0.5` when range is 0); empty series render nothing (`geom()` null). The end-dot is an HTML element (stays round despite `preserveAspectRatio="none"` stretching) with a `var(--surface-card)` ring.
- Always pair `watchOnlineCount()` with `teardown()` in `ngOnDestroy` — the service holds a single `watchChannel` and returns the stale signal on re-subscribe attempts while one exists.
- `panel--orders` rows show `o.total` — realized totals including shipping/discount per the `orders` row, matching the orders screen.

## Related docs
- [Admin shell](./admin-shell.md) · [Orders](./orders.md) · [Customers](./customers.md) · [Customer detail](./customer-detail.md) · [Raffles](./raffles.md)
- [Backend RPCs & functions](../../architecture/backend-rpcs-and-functions.md) · [Loyalty & Pokédex](../../architecture/loyalty-and-pokedex.md) · [Data model](../../architecture/data-model.md)
