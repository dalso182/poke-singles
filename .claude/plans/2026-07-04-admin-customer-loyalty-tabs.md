# Admin customer detail: Poke-Monedas balance + Pedidos / Poke-Monedas tabs

## Context

`/admin/customers/:id` (CustomerDetail) shows profile info, KPIs (pedidos / total gastado /
último pedido) and a flat order-history table — but nothing about loyalty. Diego wants to see
each customer's Poke-Monedas balance, and wants the history area split into two tabs —
**Pedidos** and **Poke-Monedas** (the ledger/redemption history) — mirroring what the customer
sees in the storefront `/account` "Mis puntos" panel.

The data comes from the `loyalty_transactions` ledger (balance = SUM(amount), can be negative).
Customers read it via RLS self-scope (`LoyaltyService`); admin currently has no per-customer
read — only the global `admin_loyalty_transactions_report`. The clean path is to extend the
existing `admin_customer(p_id)` RPC (security definer + `is_admin` guard, returns jsonb) with
the balance and recent ledger rows — one round trip, same pattern as its `orders` array.

## Approach

One migration extends `admin_customer` with `loyalty_balance` + `loyalty_transactions`
(reusing the existing `LoyaltyTransactionRow` shape). The UI adds a 4th KPI cell for the
balance and wraps the history card in a `mat-tab-group` (precedent: admin `order-detail.html:79`)
with the existing orders table in tab 1 and a new ledger table (shared `app-table` primitives)
in tab 2. No new routes, no new components.

## Steps

1. **Migration — extend `admin_customer`** — `supabase/migrations/<next-timestamp>_admin_customer_loyalty.sql`
   - ⚠️ Per project workflow: the shared dev DB can run ahead of the repo. **Pull the current
     function definition from dev first** (`mcp__supabase__execute_sql` →
     `pg_get_functiondef('public.admin_customer(uuid)'::regprocedure)`) and base the edit on
     that, not on `20260525002500_admin_customers_last_sign_in.sql`.
   - Returns jsonb → `CREATE OR REPLACE` is fine (no drop). Add two keys to the
     `jsonb_build_object`:
     - `'loyalty_balance'` — `coalesce(loy.balance, 0)` via
       `left join lateral (select sum(lt.amount) as balance from public.loyalty_transactions lt where lt.user_id = p.id) loy on true`.
       Ledger rows are keyed by `user_id` only — no email fallback needed (unlike orders).
     - `'loyalty_transactions'` — `coalesce(ltx.transactions, '[]'::jsonb)`, a `jsonb_agg` of
       the 100 most recent ledger rows ordered `created_at desc`, each with
       `id, user_id, order_id, amount, kind, description, created_at` (exactly the
       `LoyaltyTransactionRow` fields, so the client type is reused verbatim). Use the same
       inner-subquery-then-agg shape as the existing `orders` lateral.
   - Keep the existing `grant execute ... to authenticated;` line.
   - Apply with `npm run db:push:dev` (NOT MCP apply_migration). No `database.types.ts` regen
     needed — the RPC's declared return type (`jsonb`/`Json`) is unchanged.

2. **Types** — `src/app/core/catalog/catalog.types.ts`
   - Extend `CustomerDetail` (line ~639): add `loyalty_balance: number;` and
     `loyalty_transactions: LoyaltyTransactionRow[];` (type already exists at line ~798).

3. **Service coercion** — `src/app/core/customers/customers.service.ts` `getCustomer()`
   - In the returned object: `loyalty_balance: Number(c.loyalty_balance) || 0`, and
     `loyalty_transactions: (c.loyalty_transactions ?? []).map(t => ({ ...t, amount: Number(t.amount) || 0 }))`
     — same numeric-coercion idiom as `total_spent`/`orders`.

4. **Component TS** — `src/app/admin/customers/customer-detail.ts`
   - Add `MatTabsModule` to imports.
   - Add `loyaltyColumns = ['date', 'description', 'kind', 'amount']`.
   - Add label helpers mirroring the storefront (`account.ts` `pointsLabel()` /
     `statusLabel` style, Spanish):
     - `txLabel(tx)`: `tx.description` else kind fallback — earn → 'Puntos ganados',
       reversal → 'Puntos revertidos', adjust → 'Ajuste', redeem → 'Poke-Monedas canjeadas'.
     - `txTone(kind): PillTone` — earn → 'green', redeem → 'blue', reversal → 'red',
       adjust → 'amber'; and a short kind label for the pill (Ganado / Canje / Reversión / Ajuste).

5. **Template** — `src/app/admin/customers/customer-detail.html`
   - **KPI card**: add a 4th `kpi__cell` "Poke-Monedas" showing
     `{{ c.loyalty_balance | number: '1.0-0' }}` with the coin image
     (`assets/images/coin-sm.png`, as the storefront hero uses) inline before the value.
     Negative balances are legitimate (reversals) — no clamping.
   - **History card**: inside the existing `app-table-card`, replace the single
     `orders-head` + table with a `mat-tab-group` (`animationDuration="180ms"`, per
     order-detail):
     - Tab `"Pedidos (" + c.orders.length + ")"` — the existing orders table + empty state,
       moved as-is.
     - Tab `"Poke-Monedas (" + c.loyalty_transactions.length + ")"` — empty state
       ('Este cliente no tiene movimientos de Poke-Monedas.') or a
       `table mat-table class="app-table app-table--comfy"` with columns:
       - `date` — `created_at | date: 'short'`, `is-mono is-dim`
       - `description` — `txLabel(tx)`
       - `kind` — `<app-pill [tone]="txTone(tx.kind)">`
       - `amount` — right-aligned, signed (`+` prefix on positive), `is-mono`; red/green
         tint classes for negative/positive.
   - Rows with an `order_id`? Keep them non-clickable for now (ledger rows reference orders
     but the label already says why) — out of scope to deep-link.

6. **SCSS** — `src/app/admin/customers/customer-detail.scss`
   - `.kpi` grid → `repeat(4, 1fr)`; if the cells get cramped at the card's half-width,
     drop `kpi__cell` left padding to 16px. (Below 880px the outer grid already stacks to
     one column, so the KPI card gets full width.)
   - Small coin-image sizing class for the KPI (e.g. 18px, vertical-align middle).
   - Amount tint classes (`.tx-amount--positive/--negative`) — layout-level only; table
     chrome stays on the shared `.app-table` classes (admin table system rule).
   - Minor: tab-body padding so tables sit flush like the current card.

## Files to modify / create

- `supabase/migrations/<timestamp>_admin_customer_loyalty.sql` — **new**; extend `admin_customer` RPC
- `src/app/core/catalog/catalog.types.ts` — `CustomerDetail` gains 2 fields
- `src/app/core/customers/customers.service.ts` — coerce new fields in `getCustomer()`
- `src/app/admin/customers/customer-detail.ts` — MatTabsModule, columns, label/tone helpers
- `src/app/admin/customers/customer-detail.html` — KPI cell + tab group + ledger table
- `src/app/admin/customers/customer-detail.scss` — 4-col KPI grid, coin img, amount tints

## Reused utilities

- `admin_customer` RPC + `is_admin()` guard pattern — extended, not duplicated
- `LoyaltyTransactionRow` at `catalog.types.ts:798` — RPC emits its exact field set
- `app-table-card`, `app-pill`, `.app-table app-table--comfy` — admin table primitives
- `mat-tab-group` styling precedent at `src/app/admin/order-detail/order-detail.html:79`
- Kind→Spanish label mapping mirrored from `account.ts` `pointsLabel()` (`account.ts:243`)

## Verification

1. `npm run db:push:dev` applies cleanly; then in SQL editor:
   `select public.admin_customer('<uuid-with-loyalty-activity>');` → jsonb includes
   `loyalty_balance` + `loyalty_transactions` (and still works for a customer with none:
   balance 0, `[]`).
2. Dev server is already running on http://localhost:4242 (do not restart it).
   `/admin/customers` → open a customer who has opened Pokéballs / earned points:
   - KPI row shows the balance; cross-check the number against that user's `/account` panel.
   - Tabs: Pedidos shows the same table as before; Poke-Monedas lists ledger rows
     newest-first with signed amounts and kind pills; empty states render for fresh customers.
3. `npm run build` and `npm test` pass (RouterLink `should create` NG0201 failures are
   pre-existing — ignore those).

## Out of scope

- Admin-initiated balance adjustments (manual `adjust` entries) — separate feature
- Pagination of the ledger beyond the 100 most recent rows
- A balance column on the `/admin/customers` list screen
- Deep-linking ledger rows to their source order
- Changes to `admin_loyalty_transactions_report` / the loyalty report screen
