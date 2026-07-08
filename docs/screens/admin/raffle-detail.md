# Admin — Raffle detail

> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose

Per-raffle back-office screen: raffle metadata (draw date, entry price, market price, entries remaining/sold), the participants table with per-order payment status, a copy-to-clipboard export of paid names for an external wheel site, and the draw itself. The draw is gated on every non-cancelled entry order being paid; drawing triggers a DB trigger that emails all participants (winner variant + admin summary) via the `send-raffle-result` edge function.

## Route & access

- Path: `/admin/raffles/:id` — `:id` is the **product UUID** (raffles are 1:1 with a Rifas-category product). Lazy `loadComponent` → `RaffleDetail`.
- Guarded by `adminGuard` on the `/admin` parent.
- `id` binds via `input.required<string>()` (router `withComponentInputBinding`). No query params.

## Files

- `src/app/admin/raffles/raffle-detail.ts` — `RaffleDetail` component (selector `app-admin-raffle-detail`).
- `src/app/admin/raffles/raffle-detail.html` — header, info panel, winner banner, participants table.
- `src/app/admin/raffles/raffle-detail.scss` — `raffle-detail__*` blocks; winner-row amber highlight.
- `src/app/core/catalog/raffles.service.ts` — `get()`, `draw()` (also `upsert()`, used by product-edit/add-product, not here).
- `src/app/core/orders/orders.service.ts` — `listRaffleBuyers(productId)`.
- `src/app/core/catalog/products.service.ts` — `get(id)` (plain `products` select).
- `src/app/core/catalog/catalog.types.ts` — `RaffleRow`, `RaffleBuyerRow`, `OrderStatus`, `ProductRow`.
- `supabase/migrations/20260525000200_raffles_table.sql` — `raffles` table + RLS + `rifas_listing` view.
- `supabase/migrations/20260525000300_raffle_draw.sql` — original `draw_raffle` RPC + `notify_raffle_result()` trigger fn + `raffles_notify_result` trigger.
- `supabase/migrations/20260525000400_fix_raffle_notify_net_http.sql` — trigger fix: `net.http_post` (not `extensions.http_post`).
- `supabase/migrations/20260525000600_raffle_draw_paid_gate.sql` — current `draw_raffle` with the `UNPAID_ENTRIES` gate.
- `supabase/migrations/20260525001000_raffle_market_price.sql` — `raffles.market_price` column + `rifas_listing` rebuild.
- `supabase/functions/send-raffle-result/index.ts` — result-notification edge function.

## UI anatomy

1. Header `.raffle-detail__header`: `<app-icon-btn label="Volver">` (`arrow_back`) → `goBack()`; eyebrow `"Rifa"` (`.brand-eyebrow`) + `<h1>{{ product()?.name }}</h1>`.
2. `<mat-progress-bar mode="indeterminate">` while `loading()`.
3. Not-found card (when `notFound()`): `"No se encontró la rifa."` + ghost `app-btn` `"Volver al listado"`.
4. Info panel (`mat-card.raffle-detail__panel`, `.raffle-detail__info`): product image thumb (`.raffle-detail__thumb`, 104×146) and a `<dl>` in `.raffle-detail__meta`:
   - `Sorteo` — `raffle().draw_at | date: 'd/MM/yyyy' : 'UTC'` or `"Por definir"`.
   - `Precio por entrada` — `₡{{ p.price | number: '1.0-0' }}`.
   - `Precio de mercado` — `₡{{ raffle()!.market_price! | number: '1.0-0' }}` or `—` when null. (Admin-entered card market value; also shown publicly on `/rifas` via `rifas_listing` to show the raffle isn't profit-taking.)
   - `Entradas restantes` — `p.quantity` (raffle "stock" = unsold spaces).
   - `Entradas vendidas` — `soldEntriesTotal()`.
   Plus ghost `app-btn` `"Editar rifa"` (`edit` icon) → `/admin/products/{id}/edit` (draw date + market price live on the product-edit form).
5. Result banner (after a draw):
   - `status === 'drawn'` → `.raffle-detail__winner` (amber tint, `emoji_events` icon): `Ganador: {winner_name}` + muted line `{winner_email} · {total_entries} entradas · sorteada el {drawn_at | date:'short'}`.
   - `status === 'void'` → `.raffle-detail__winner--void` (`do_not_disturb` icon): `"La rifa se sorteó sin participantes."`
6. Participants panel (`mat-card.raffle-detail__panel`):
   - `mat-card-title` `"Participantes"`; subtitle `{{ entries().length }} pedido(s) · {{ soldEntriesTotal() }} entradas`, and when `hasUnpaid()` an appended red `.raffle-detail__warn`: `"hay entradas sin pagar"`.
   - Actions row `.raffle-detail__actions` (only if `entries().length > 0`):
     - **`Sortear ganador`** (`casino` icon, `variant="primary"`) — rendered only while `!raffle() || raffle()!.status === 'scheduled'`; disabled unless `canDraw()` and not `drawing()`; tooltip `"Hay entradas sin pagar"` when `hasUnpaid()`.
     - **`Copiar nombres`** (`content_copy`, ghost) — tooltip `"Copia los nombres pagados repetidos por sus entradas (para la ruleta)"`.
   - Table (`.raffle-detail__scroll` → `mat-table.app-table.app-table--comfy`), `columns = ['order', 'name', 'contact', 'entries', 'payment']`:
     - **order** ("Pedido") — mono link `#{{ b.order_number }}` → `/admin/orders/{order_id}` (`.raffle-detail__orderlink`).
     - **name** ("Nombre") — `customer_name`.
     - **contact** ("Contacto") — phone as a `wa.me` link (`.raffle-detail__contact`, `target="_blank" rel="noopener"`) + `.raffle-detail__email` line.
     - **entries** ("Entradas") — right-aligned mono `quantity`.
     - **payment** ("Pago") — `<app-pill>` with status label/tone (below).
     - Winner's row gets `.raffle-detail__row--winner` (amber background, bold cells) when `raffle()?.winner_order_id === b.order_id`.
   - Empty state: `"Nadie ha comprado entradas todavía."`

Order-status pill mapping (`statusLabel` / `statusTone`):

| status | label | tone |
|---|---|---|
| `pending` (default) | `Pendiente` | `amber` |
| `paid` | `Pagado` | `green` |
| `shipped` | `Enviado` | `blue` |
| `completed` | `Completado` | `green` |
| `cancelled` | `Cancelado` | `red` |

Shared primitives (`app-pill`, `app-btn`, `app-icon-btn`) → [design-manifest](../../design-manifest.md).

## Services & backend

- `ProductsService.get(id)` — `products` select by id (admin RLS sees inactive rows).
- `RafflesService.get(productId)` — `raffles` select `.eq('product_id', …).maybeSingle()`. May be `null` (raffle never configured) — the UI treats null as scheduled.
- `OrdersService.listRaffleBuyers(productId)` — `order_items` select `quantity, orders(id, order_number, customer_name, customer_phone, customer_email, status, created_at)` filtered by `product_id`; maps to `RaffleBuyerRow[]`, sorted newest-first client-side. Relies on admin RLS (`order_items_admin_all` / `orders_admin_all`) to see all rows.
- `RafflesService.draw(productId)` — RPC **`draw_raffle(p_product_id uuid)`** (current definition in `20260525000600_raffle_draw_paid_gate.sql`; security definer, granted to `authenticated`):
  1. `is_admin()` else raise `NOT_AUTHORIZED`.
  2. Product must be in the Rifas category (`raffle_category_id()`) else `NOT_A_RAFFLE`.
  3. Upserts a `raffles` row if missing, locks it `for update`; **idempotent** — if status ≠ `scheduled` it returns the existing row unchanged.
  4. **Paid gate:** raises `UNPAID_ENTRIES` if any non-cancelled entry order has status `pending`.
  5. Picks uniformly over per-entry rows (`generate_series(1, oi.quantity)`) from orders with status in `('paid','shipped','completed')` — i.e. weighted by quantity. No eligible entries → status `void`.
  6. Writes `status` (`drawn`/`void`), `winner_order_id`, `winner_name`, `winner_email`, `winning_entry`, `total_entries`, `drawn_by = auth.uid()`, `drawn_at = now()` and returns the row.
- Trigger **`raffles_notify_result`** (after update of `status`, when `scheduled → drawn|void`): `notify_raffle_result()` reads Vault secrets `raffle_result_url` and `supabase_anon_key` and fires a best-effort `net.http_post` with body `{"product_id": …}`; any failure is swallowed so the draw never rolls back.
- Edge function **`send-raffle-result`** (`verify_jwt = false`; env: `RESEND_API_KEY`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`, `STORE_PUBLIC_URL`, plus auto-injected `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`): re-reads the raffle with the service role (skips with `{skipped:'not_drawn'}` if not drawn/void), collects distinct non-cancelled participant emails, and sends via Resend:
  - winner: subject `🎉 ¡Ganaste la rifa! — {raffleName}`;
  - other participants: `Resultado de la rifa — {raffleName}` (names the winner);
  - admin summary to the comma-separated `app_settings.order_notification_recipients`: `Rifa sorteada — {raffleName}` (or `Rifa sin participantes — {raffleName}` for void);
  - finally stamps `raffles.notified_at`.
- `raffles` table (RLS `raffles_admin_all`, admin-only): `product_id` PK → `products` cascade, `draw_at`, `status in ('scheduled','drawn','void')`, `winner_order_id`, `winner_name`, `winner_email`, `winning_entry`, `total_entries`, `drawn_by`, `drawn_at`, `notified_at`, `market_price numeric(12,2) >= 0`, timestamps. Customers only see raffles through the definer view `rifas_listing` (no `winner_email`).

## State & data flow

- Signals: `product: ProductRow | null`, `raffle: RaffleRow | null`, `buyers: RaffleBuyerRow[]`, `loading`, `drawing`, `notFound`.
- Computeds:
  - `entries` — buyers minus `cancelled` (cancelled orders returned their entries to stock).
  - `hasUnpaid` — any entry with status `pending`.
  - `soldEntriesTotal` — sum of `quantity` over `entries`.
  - `paidEntriesTotal` — sum over entries whose status is in `PAID_STATUSES = ['paid', 'shipped', 'completed']`.
  - `canDraw` — (no raffle row or status `scheduled`) AND `!hasUnpaid()` AND `paidEntriesTotal() > 0`.
  - `wheelEntries` — paid customer names, each repeated `quantity` times, joined with `', '` — paste-ready for an external wheel site.
- `ngOnInit` → `bootstrap()`: `Promise.all` of `products.get(id)`, `raffles.get(id)`, `orders.listRaffleBuyers(id)`. Missing product → `notFound`. Errors → snackbar.
- Draw flow (`onDrawWinner`): guarded by `product()`, `!drawing()`, `canDraw()`; native `confirm()` with copy `¿Sortear el ganador ahora? Se enviará un correo a todos los participantes y no se puede deshacer.`; on success sets `raffle` from the RPC return, re-fetches buyers, and snackbars either `No había participantes pagados; la rifa quedó sin ganador.` (void) or `Ganador sorteado: {winner_name}. Se notificará a los participantes.` (6000 ms). Errors containing `UNPAID_ENTRIES` map to `Hay entradas sin pagar. Marca los pedidos como pagados (o cancélalos) antes de sortear.`
- `copyWheelEntries()`: no-op when text is empty or not `isPlatformBrowser(this.platformId)`; uses `navigator.clipboard.writeText` with a hidden-textarea `document.execCommand('copy')` fallback; snackbars `Nombres copiados al portapapeles` / `No se pudo copiar`.
- `waLink(phone)`: strips non-digits; 8-digit numbers get the `506` Costa Rica prefix; returns `https://wa.me/{full}`.

## Behaviors & edge cases

- Raffle with sales but no `raffles` row: banner absent, draw button rendered (`!raffle()`), and `draw_raffle` creates the row on demand.
- Draw button disappears (not just disables) once status is `drawn`/`void`; the paid gate means marking every pending order Pagado (or cancelling it) from [order-detail](./order-detail.md) is a prerequisite.
- Double-fire safety: client `drawing` flag + server row lock + idempotent early return.
- Winner notification is asynchronous and best-effort — the UI never waits on the emails; `notified_at` is the only evidence they went out (not surfaced in this UI).
- Cancelled orders remain visible in `buyers` data but are filtered from `entries`, so they never appear in the table, totals, or wheel export.
- "Entradas restantes" is simply `products.quantity` — sold-out raffles show 0 but remain drawable.

## Gotchas / invariants

- **`:id` is the product UUID.** All three loads key on it; `raffles.product_id` is the PK.
- **The draw pool is paid-only and the gate is absolute** — one lingering `pending` order blocks the whole draw with `UNPAID_ENTRIES`.
- **Winner/status columns are owned by `draw_raffle`**; `RafflesService.upsert()` deliberately writes only `draw_at` + `market_price`. Don't widen it.
- The notify trigger originally called `extensions.http_post`, which didn't exist — silently swallowed, so no emails fired. Fixed in `20260525000400` to `net.http_post`. If notifications stop again, check the exception-swallowing block first.
- `send-raffle-result` has `verify_jwt = false` (pg_net calls carry no session JWT); it trusts its inputs only to the extent of re-reading state with the service role — calling it for a non-drawn raffle is a harmless no-op.
- The participant email fan-out sends **one Resend call per participant sequentially**; large raffles make the function run long. Winner detection inside the function is by lowercased email match.
- `confirm()` is a native browser dialog (inconsistent with the Material dialogs used elsewhere) and is called without an `isPlatformBrowser` guard (fine today — CSR-only app — but a trap if SSR lands).
- Draw dates are date-only-at-UTC; both this screen and the list format with the `'UTC'` `DatePipe` arg.
- The `raffle-detail.ts` `waLink` 506-prefix assumes Costa Rican 8-digit phones; foreign numbers must already include their country code.

## Related docs

- [raffles](./raffles.md) — the list this screen is reached from.
- [order-detail](./order-detail.md) — where entry orders get marked Pagado/Cancelado.
- [product-edit](./product-edit.md) — editing `draw_at` and `market_price` (via `RafflesService.upsert`).
- [rifas (storefront)](../storefront/rifas.md) — public view fed by `rifas_listing` (includes `market_price`).
- [config](./config.md) — `order_notification_recipients` used for the admin summary email.
- [backend-rpcs-and-functions](../../architecture/backend-rpcs-and-functions.md), [data-model](../../architecture/data-model.md), [commerce-flow](../../architecture/commerce-flow.md).
