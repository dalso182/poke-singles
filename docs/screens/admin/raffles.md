# Admin — Raffles list

> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose

Back-office list of every raffle — i.e. every product in the **Rifas** category, including inactive ones — split into "Activas" (scheduled) and "Completadas" (drawn or void) tabs. Shows draw date, entries sold, unpaid-entry warnings, draw status, and the winner. Row click opens the raffle detail; "Agregar rifa" hands off to the add-product form pre-set to the Rifas category.

## Route & access

- Path: `/admin/raffles` (`pathMatch: 'full'`), lazy `loadComponent` → `Raffles`.
- Guarded by `adminGuard` (`canActivate` + `canActivateChild` on the `/admin` parent).
- No query params. Tab selection is component state only (not URL-synced); a reload resets to "Activas".

## Files

- `src/app/admin/raffles/raffles.ts` — `Raffles` component (selector `app-admin-raffles`): load, tab filter, navigation.
- `src/app/admin/raffles/raffles.html` — page header, pill tabs, Material table, empty states.
- `src/app/admin/raffles/raffles.scss` — `raffles__*` block styles.
- `src/app/core/catalog/raffles.service.ts` — `RafflesService.listSummary()` (the method this screen uses).
- `src/app/core/catalog/catalog.types.ts` — `RaffleSummaryRow` interface.
- `supabase/migrations/20260525000700_admin_raffles_summary.sql` — the `admin_raffles_summary()` RPC.

## UI anatomy

Top to bottom:

1. `<app-page-header>` — kicker `"Sorteos"`, title `"Rifas"`, sub `"Rifas activas, su estado de pago, y el historial de sorteos"`. Projected action: `<app-btn variant="primary">` with `add` icon, label `"Agregar rifa"` → `goToNew()`.
2. `<app-pill-tabs class="raffles__tabs">` — two tabs with live counts: `Activas` (status `scheduled`) and `Completadas` (status `drawn` or `void`).
3. `<mat-progress-bar mode="indeterminate">` while `loading()`.
4. `<app-table-card>` wrapping a horizontally scrollable (`.raffles__scroll`) `mat-table` with classes `app-table app-table--cozy`. Columns (`displayedColumns = ['image', 'name', 'draw', 'entries', 'status', 'winner']`):
   - **image** — `<app-thumb [src]="row.image_url">`, no header.
   - **name** ("Rifa") — bold `.raffles__name`; when `!row.active` appends `.raffles__inactive` text `" · inactiva"`.
   - **draw** ("Sorteo") — `draw_at | date: 'd/MM/yyyy' : 'UTC'`, or `"Por definir"` when null. Cell classes `is-mono is-dim`.
   - **entries** ("Entradas") — `"{n} vendida(s)"` (`entries_sold`, singular/plural); when `entries_pending > 0`, a red `<app-pill tone="red">` reading `"{n} sin pagar"`.
   - **status** ("Estado") — `<app-pill>` with `statusTone()`/`statusLabel()` (see below).
   - **winner** ("Ganador") — `winner_name` or a dim mono `—`.
   Rows have class `raffles__row` and `(click)="goTo(row.product_id)"`.
5. Empty state `.raffles__empty` (only when not loading): Activas tab → `No hay rifas activas. Usa "Agregar rifa" para crear una.`; Completadas tab → `Todavía no hay rifas completadas.`

Status mapping (`statusLabel` / `statusTone`):

| status | label | pill tone |
|---|---|---|
| `scheduled` (default) | `Programada` | `blue` |
| `drawn` | `Sorteada` | `green` |
| `void` | `Sin participantes` | `neutral` |

Shared primitives (`app-page-header`, `app-pill-tabs`, `app-table-card`, `app-thumb`, `app-pill`, `app-btn`) are documented in [design-manifest](../../design-manifest.md).

## Services & backend

- `RafflesService.listSummary()` → RPC **`admin_raffles_summary()`** (security definer, `is_admin()` guard, raises `NOT_AUTHORIZED` otherwise; granted to `authenticated`). Returns one row per product in the Rifas category (`p.category_id = raffle_category_id()`), including inactive products, left-joined to `raffles` and a lateral aggregate over `order_items ⨝ orders`:
  - `entries_sold` — `sum(oi.quantity)` where order status `<> 'cancelled'`.
  - `entries_pending` — `sum(oi.quantity)` where order status `= 'pending'`.
  - `participants` — `count(distinct lower(customer_email))` excluding cancelled.
  - `status` — `coalesce(r.status, 'scheduled')`, so a Rifas product with no `raffles` row still shows as Programada.
  - Server-side ordering: scheduled first, then `draw_at asc nulls last`, then `created_at desc`.
  The service coerces `entries_sold` / `entries_pending` / `participants` with `Number(...)` (Postgres `bigint` arrives as string).
- Tables involved (via the RPC only): `products`, `raffles`, `order_items`, `orders`. Helper fn `raffle_category_id()`.

## State & data flow

- Signals: `rows: signal<RaffleSummaryRow[]>`, `loading: signal(false)`, `filter: signal<'active' | 'completed'>('active')`.
- Computeds: `visibleRows` (filters `rows` by tab: active → `status === 'scheduled'`; completed → `'drawn' || 'void'`), `filterTabs` (`TabItem[]` with counts).
- Load: constructor calls `void this.refresh()` once. `refresh()` sets `loading`, calls `listSummary()`, snackbars errors (`errorMessage(err)` → `err.message` or `'Error desconocido'`, action `'OK'`, 5000 ms).
- No polling/realtime; data refreshes only on re-navigation. Tab switching (`onFilterChange`) is purely client-side filtering — no refetch.
- Navigation: `goTo(productId)` → `/admin/raffles/{productId}` (the **product** UUID, since `raffles.product_id` is the PK); `goToNew()` → `/admin/products/new?category=rifas` (raffle creation is the add-product flow, not a dedicated form).

## Behaviors & edge cases

- Loading: indeterminate progress bar; table renders (empty) beneath it.
- Error: snackbar with the backend message; the table stays with whatever rows it had (initially `[]`).
- Empty per-tab copy differs (see UI anatomy).
- Inactive raffle products still list (the RPC does not filter on `active`); they're flagged with the `" · inactiva"` suffix.
- A Rifas product that has never been touched by the draw flow (no `raffles` row) appears as `Programada` with `draw_at` `"Por definir"`.
- The admin sidenav "Rifas" item badge is fed by the same `listSummary()` call from `AdminShell` (count of `scheduled` rows) — a second, independent RPC call per shell load.

## Gotchas / invariants

- **Route param is the product id**, not a raffle id — `raffles` is 1:1 keyed on `product_id`.
- `draw_at` renders with the `'UTC'` timezone arg on the `DatePipe` — draw dates are treated as date-only values pinned to UTC; do not "fix" this to local time or dates can shift a day.
- Tab counts come from the full `rows` set, so counts stay correct regardless of which tab is displayed.
- `entries_pending` counts entries on `pending` orders; a raffle cannot be drawn while any exist (enforced server-side, see [raffle-detail](./raffle-detail.md)).
- `filter` is not persisted to the URL — deep-linking to the Completadas tab is not possible.
- `listSummary()` casts the client `as any` for the RPC call (the RPC is not in the generated types), as does most of `RafflesService`.

## Related docs

- [raffle-detail](./raffle-detail.md) — participants, payment tracking, draw flow.
- [add-product](./add-product.md) — the `?category=rifas` creation path.
- [product-edit](./product-edit.md) — where `draw_at` / `market_price` are edited (`RafflesService.upsert`).
- [admin-shell](./admin-shell.md) — sidenav badge count source.
- [rifas (storefront)](../storefront/rifas.md) — the public `rifas_listing` view counterpart.
- [backend-rpcs-and-functions](../../architecture/backend-rpcs-and-functions.md), [data-model](../../architecture/data-model.md).
