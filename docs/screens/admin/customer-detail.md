# Admin — Customer detail (Cliente)

> Part of the Poke-Singles docs set. Verified against source on 2026-07-20. Load together with /CLAUDE.md.

## Purpose

Single-customer view for the admin: identity/contact card with saved shipping address, a 4-cell KPI strip (orders, total spent, last order, Poke-Monedas balance), and a tabbed history section with three tabs — **Pedidos** (recent orders), **Poke-Monedas** (loyalty ledger), and **Pokédex** (the customer's caught-Pokémon collection, reusing the storefront `app-pokedex` component in read-only mode). Everything comes from one `admin_customer` RPC call.

## Route & access

- **Path:** `/admin/customers/:id` (lazy `loadComponent` in `src/app/app.routes.ts`).
- **Guards:** `adminGuard` on the `/admin` parent (`canActivate` + `canActivateChild`).
- **Route param:** `id` (customer UUID) — bound to the required `id` input via `withComponentInputBinding()` (enabled in `src/app/app.config.ts`).
- **Query param:** `?tab=` selects the initially open tab: `pokedex` → index 2, `monedas` → index 1, anything else/absent → 0 (Pedidos). The dashboard "Top Pokédex" panel links here with `[queryParams]="{ tab: 'pokedex' }"`. Nothing in the app currently links with `tab=monedas` — supported but unused.

## Files

| File | Role |
|---|---|
| `src/app/admin/customers/customer-detail.ts` | `CustomerDetail` component (`selector: 'app-admin-customer-detail'`) — load, tab resolution, avatar, status/kind label+tone maps |
| `src/app/admin/customers/customer-detail.html` | Template: back header, not-found card, info + KPI grid, `mat-tab-group` with the three tabs |
| `src/app/admin/customers/customer-detail.scss` | `.customer-detail__*`, `.info__*`, `.kpi__*`, `.tx-amount*` blocks; card chrome from `app-table-card`, tables from `.app-table` |
| `src/app/core/customers/customers.service.ts` | `CustomersService.getCustomer(id)` — calls `admin_customer`, coerces numerics, defaults arrays |
| `src/app/core/catalog/catalog.types.ts` | `CustomerDetail` (type, aliased `CustomerDetailRow` in the component), `CustomerOrderRow`, `LoyaltyTransactionRow`, `LoyaltyTransactionKind`, `OrderStatus` |
| `src/app/user/account/pokedex/pokedex.ts` | Shared `Pokedex` component (`app-pokedex`) reused for the Pokédex tab |
| `src/app/shared/forms/back-header/back-header.ts` | `app-back-header` used at the top |
| `supabase/migrations/20260525002300_admin_customers.sql` | Original `admin_customer(p_id)` (profile + stats + orders) |
| `supabase/migrations/20260525002500_admin_customers_last_sign_in.sql` | Adds `last_sign_in_at` to the payload |
| `supabase/migrations/20260704110000_admin_customer_loyalty.sql` | Adds `loyalty_balance` + `loyalty_transactions` to the payload |
| `supabase/migrations/20260704120000_admin_customer_pokedex.sql` | Adds `caught_pokemon_numbers` to the payload |
| `supabase/migrations/20260719000000_auction_ban_admin.sql` | Adds `auction_banned_at` + `auction_ban_reason` to the payload + the `admin_set_auction_ban` RPC (current function definition) |

## UI anatomy

Wrapper `.customer-detail` (max-width 1280px, column flex, 16px gap):

1. **`<app-back-header>`** — kicker `"Cliente"`, title = `customer()?.full_name || 'Cliente'`, `backLink="/admin/customers"`.
2. **`<mat-progress-bar mode="indeterminate">`** while `loading()`.
3. **Not-found card** (when `notFound()`): `app-table-card` with `.customer-detail__not-found` — copy `"No encontramos este cliente."` and an `app-btn variant="ghost"` labeled `"Volver al listado"` → `goBack()`.
4. **`.customer-detail__grid`** (two columns `1.1fr / 1fr`, single column under 880px), rendered inside `@if (customer(); as c)`:
   - **Info card** (`app-table-card` > `.info`):
     - `.info__head`: `.info__avatar` — monogram circle with `initials(name)` (first letters of the first two words, uppercased, `'?'` fallback) on a stable hue derived from the name char-code sum: background `oklch(0.94 0.04 <hue>)`, color `oklch(0.40 0.08 <hue>)`. Beside it `.info__name` (fallback `"Sin nombre"`) and `.info__tag` = `recurringTag(order_count)`: `"Cliente recurrente"` when `order_count > 1`, else `"Cliente"`; a red `<app-pill>` `"Vetado subastas"` appears when `c.auction_banned_at` is set.
     - `.info__rows`: label/value rows **Email** (mono), **Teléfono** (mono, `—` when null), **Registrado** (`created_at | date: 'mediumDate'`).
     - `.info__address`: label `"Dirección guardada"`; when `c.default_shipping_address` exists renders `line1`, optional `, line2`, then `city, province`, optional dim `notes`. Empty state: `.info__address-empty` with a `.info__dot` and `"Sin dirección guardada."`.
     - `.info__ban`: label `"Subastas"`. Banned → `"Vetado desde el {mediumDate}."` (+ dim `"Motivo: {auction_ban_reason}"` when present) and `"Quitar veto"` (subtle). Not banned → `"Puede participar en subastas."` and `"Vetar de subastas"` (danger). `onToggleBan()`: banning uses native `prompt()` with an optional reason ("Motivo (opcional):", cancel aborts); unbanning uses `confirm()`. Calls `CustomersService.setAuctionBan`, snackbars, and `load()`s again. `togglingBan` signal disables the button while in flight.
   - **KPI card** (`app-table-card` > `.kpi`, 4 cells with left-border dividers):
     - `"Pedidos"` → `c.order_count`.
     - `"Total gastado"` → `₡` (`.kpi__cur`) + `c.total_spent | number: '1.0-0'`, footer `"CRC"`.
     - `"Último pedido"` → `c.last_order_at | date: 'd/MM/yy'` or `—` (`.kpi__value--sm`).
     - `"Poke-Monedas"` → coin icon `assets/images/coin-sm.png` (`.kpi__coin`) + `c.loyalty_balance | number: '1.0-0'`.
5. **History card** (`app-table-card`) — `mat-tab-group` (`animationDuration="180ms"`, class `customer-detail__tabs`, one-way `[selectedIndex]="selectedTab()"`):

   ### Tab 0 — `Pedidos (N)`
   Label is `'Pedidos (' + c.orders.length + ')'`. Empty: `"Este cliente no tiene pedidos todavía."` (`.customer-detail__empty`). Else a `mat-table` (`app-table app-table--comfy`) with `orderColumns = ['ref', 'total', 'status', 'date', 'actions']`:
   - **Pedido** — mono, dim `#` + bold `o.order_number`.
   - **Total** — right-aligned `<app-money>`.
   - **Estado** — `<app-pill [tone]="statusTone(o.status)">` with `statusLabel`: `pending → 'Pendiente'`, `paid → 'Pagado'`, `shipped → 'Enviado'`, `completed → 'Completado'`, `cancelled → 'Cancelado'`. Tones: paid/completed `green`, shipped `blue`, cancelled `red`, default (pending) `amber`.
   - **Fecha** — `o.created_at | date: 'short'`.
   - **(actions)** — `app-btn` `"Ver"` → `goToOrder(o.id)`; the cell stops propagation because the whole row (`.customer-detail__row`, cursor pointer) also has `[routerLink]="['/admin/orders', o.id]"`.

   ### Tab 1 — `Poke-Monedas (N)`
   Label `'Poke-Monedas (' + c.loyalty_transactions.length + ')'`. Empty: `"Este cliente no tiene movimientos de Poke-Monedas."`. Else a `mat-table` with `loyaltyColumns = ['date', 'description', 'kind', 'amount']`:
   - **Fecha** — `tx.created_at | date: 'short'`.
   - **Descripción** — `txLabel(tx)`: the row's `description`, else per-kind fallback `earn → 'Puntos ganados'`, `reversal → 'Puntos revertidos'`, `adjust → 'Ajuste'`, `redeem → 'Poke-Monedas canjeadas'` (same fallbacks as the `/account` "Mis puntos" panel).
   - **Tipo** — `<app-pill [tone]="txTone(tx.kind)">` with `txKindLabel`: `earn → 'Ganado'`, `redeem → 'Canje'`, `reversal → 'Reversión'`, `adjust → 'Ajuste'`. Tones: earn `green`, redeem `blue`, reversal `red`, adjust `amber`.
   - **Monto** — signed, `+` prefix for positive, `.tx-amount--negative` (color `var(--mat-sys-error)` — the Danger slot, deliberately **not** brand red) for negatives.

   ### Tab 2 — `Pokédex (N)`
   Label `'Pokédex (' + c.caught_pokemon_numbers.length + ')'`. Content is wrapped in `<ng-template matTabContent>` so the ~1025 tiles only render when the tab is first opened (template comment: "Lazy: ~1025 tiles only render when the tab is first opened."). Renders `.customer-detail__pokedex` > `<app-pokedex [caughtNumbers]="c.caught_pokemon_numbers" title="Pokédex" [tileSize]="75" />`. Passing a non-null `caughtNumbers` puts `Pokedex` in **external/read-only mode**: ownership comes from the input instead of the signed-in profile and the Pokéball capture CTA is hidden (it would spend the *viewer's* coins). `tileSize` 75px vs the storefront default 100px; title default would be `'Mi Pokédex'`.

## Services & backend

- **`CustomersService.getCustomer(id)`** → RPC **`admin_customer(p_id uuid) returns jsonb`** (`SECURITY DEFINER`, `is_admin()` guard raising `NOT_AUTHORIZED`, `STABLE`, granted to `authenticated`). One call returns the whole payload; the service coerces `order_count`, `total_spent`, `loyalty_balance`, each `orders[].total`, and each `loyalty_transactions[].amount` with `Number(...) || 0` and defaults `caught_pokemon_numbers` to `[]`. On RPC error it logs and **returns `null`** (surfaces as not-found, not as an error state).
- Current function definition lives in `supabase/migrations/20260704120000_admin_customer_pokedex.sql` (jsonb-returning, so each evolution used `CREATE OR REPLACE`). Payload keys and sources:
  - Identity: `id`, `full_name`, `phone`, `created_at`, `default_shipping_address` from `public.profiles`; `email`, `last_sign_in_at` from `auth.users` (the reason for SECURITY DEFINER).
  - Stats (same lateral as `admin_customers`, over `public.orders` matched by `user_id` OR case-insensitive `customer_email`): `order_count` excludes cancelled, `total_spent` counts only `paid/shipped/completed`, `last_order_at` = max non-cancelled `created_at`.
  - `orders`: the **100 most recent orders including cancelled** ("so history reads complete"), each `{id, order_number, status, total, payment_method, created_at}`, newest first.
  - `loyalty_balance` (added by `20260704110000`): `SUM(loyalty_transactions.amount)` over **all** the user's rows — derived, can legitimately be negative after a reversal.
  - `loyalty_transactions` (same migration): the **100 most recent** ledger rows, newest first, emitting exactly the `LoyaltyTransactionRow` field set (`id, user_id, order_id, amount, kind, description, created_at`). Ledger rows are keyed by `user_id` only (NOT NULL, no guest path) — unlike orders there is **no email fallback**.
  - `caught_pokemon_numbers` (added by `20260704120000`): `to_jsonb(p.caught_pokemon_numbers)` — `profiles.caught_pokemon_numbers` is `integer[] NOT NULL DEFAULT '{}'`, so no coalesce needed.
- The Pokédex tab additionally triggers `PokemonService.list()` (dex data) and sprite fetches inside `app-pokedex` — no extra Supabase call for ownership.

## State & data flow

- Inputs: `id = input.required<string>()` (route param), `tab = input<string | undefined>()` (query param). Both bound via `withComponentInputBinding()`.
- `selectedTab = computed(() => ...)` maps `tab()` → `2` (`'pokedex'`), `1` (`'monedas'`), else `0`. It is bound **one-way** (`[selectedIndex]`) — after init, Material manages tab clicks itself; clicking tabs does not write back to the URL.
- `customer = signal<CustomerDetailRow | null>(null)`, `loading = signal(true)`, `notFound = signal(false)`.
- `ngOnInit()` → `load()`: sets `loading`, awaits `getCustomer(this.id())`, sets `customer` and `notFound = (c === null)`, clears `loading`. **One-shot** — there is no effect on `id`, see gotchas.
- No filters, no pagination, no reload triggers after the initial load.

## Behaviors & edge cases

- **Loading:** progress bar only; the grid/tabs don't render until `customer()` is set.
- **Not found / error:** both collapse into the same `notFound` card (`getCustomer` returns null on any RPC error, including `NOT_AUTHORIZED`).
- **`?tab=` on plain navigations:** the `tab` input arrives `undefined` when the query param is absent — the computed's `default` branch handles it (this is the safe pattern per the `withComponentInputBinding` undefined-default footgun; no `navigate()` is ever called with the raw input).
- **Order rows are doubly clickable:** row `routerLink` + the `"Ver"` button (which stops propagation) both go to `/admin/orders/:id`.
- **Pokédex tab is deferred** via `matTabContent`; opening it once keeps it rendered thereafter.

## Gotchas / invariants

- **`load()` only runs in `ngOnInit`.** Navigating from one customer detail straight to another (same route, different `:id`) would update the `id` input but never re-fetch — stale data. Latent today because no UI links customer-detail → customer-detail, but wire an `effect`/`OnChanges` on `id` before adding such a link.
- **Tab-label counts can disagree with the KPI card.** `Pedidos (N)` counts the embedded `orders` array (includes cancelled, capped at 100), while the `Pedidos` KPI is `order_count` (excludes cancelled, uncapped). Same capping applies to `Poke-Monedas (N)` vs the balance (balance sums *all* rows; the table shows only the last 100).
- `loyalty_balance` may be negative (reversal after cancellation); the KPI renders it as-is.
- Any change to the `admin_customer` payload is a jsonb evolution: `CREATE OR REPLACE` is fine (no return-type change), but keep the whole function body — each migration re-states it in full.
- `CustomerDetail` (the component class) and `CustomerDetail` (the type) collide by name; the component imports the type as `CustomerDetailRow`.
- Negative ledger amounts use `var(--mat-sys-error)` (Danger `#B91C1C`) — never brand red (`#CE1126`); see the hard rule in CLAUDE.md.
- `app-pokedex` in external mode must receive a non-null `caughtNumbers` array — `null` flips it to self mode (reads the signed-in *admin's* profile and shows the capture CTA).
- RPC calls go through `(supabase.client as any).rpc(...)` — no generated typing for the function.

## Related docs

- [customers.md](./customers.md) — the list this screen backs out to
- [order-detail.md](./order-detail.md) — target of the order-row links
- [dashboard.md](./dashboard.md) — links here with `?tab=pokedex` from the "Top Pokédex" panel
- [reports.md](./reports.md) — the Puntos report shows the same ledger across all customers
- [../storefront/account-pokedex.md](../storefront/account-pokedex.md) — the shared `app-pokedex` component in self mode
- [../../architecture/loyalty-and-pokedex.md](../../architecture/loyalty-and-pokedex.md) — ledger kinds, award/reversal trigger, Pokéball economy
- [../../design-manifest.md](../../design-manifest.md) — `app-back-header`, `app-table-card`, `app-pill`, `app-money`, `app-btn` props
