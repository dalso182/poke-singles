# Rifas (/rifas)
> Part of the Poke-Singles docs set. Verified against source on 2026-07-22. Load together with /CLAUDE.md.

## Purpose
The customer raffle page. A raffle **is a product** in the `rifas` category: `quantity` = entries (tickets/"espacios") remaining, `price` = per-entry price, `products.description` = notes; schedule and draw result live in the 1:1 `raffles` table. The page splits raffles into "Activas" (still buyable) and "Completadas" (drawn or void) tabs of `<app-raffle-card>` tiles; tickets are bought by adding the raffle product to the ordinary cart.

## Route & access
- Path: `/rifas` → `Rifas` (lazy, child of `UserShell`, behind `maintenanceGuard` only — public, no auth guard). No query params, no route data, no inputs.
- Raffles have **no detail page**: `/products/:slug` bounces raffle slugs back to `/rifas` (see [detail](./detail.md)), and raffles are excluded from `/products`, `/buscar`, and the home rails at the view/RPC level.
- Reached from the header nav and the raffle bounce.

## Files
- `src/app/user/rifas/rifas.ts` — `Rifas` component (list fetch + tab split). No spec file exists.
- `src/app/user/rifas/rifas.html` — breadcrumb, header, tab group, grids.
- `src/app/user/rifas/rifas.scss` — page chrome only (breadcrumb, `.rifas-header`, `.cards-grid` — the "Live Arena" tile recipe: `minmax(240px, 1fr)` / 2-up < 960px / 1-up < 600px, same as /subastas, `.rifas-empty`); the tile styles itself.
- `src/app/shared/raffle-card/raffle-card.ts` — `RaffleCard` tile: stepper, day countdown, condition pill, add-to-cart, status pill mapping, `winnerHue()` seeded disc.
- `src/app/shared/raffle-card/raffle-card.html` — the vertical "Live Arena" tile (art on top), status-switched body.
- `src/app/shared/raffle-card/raffle-card.scss` — vertical tile mirroring `auction-card.scss` (`.tile*` vocabulary): `.tile__agotada` (brand red), `.tile__soon-chip`, `.tile__market`, buy-in-place `.tile__actions`.
- `src/app/core/catalog/products.service.ts` — `listRaffles()` (the customer-side read).
- `src/app/core/catalog/raffles.service.ts` — **admin-only** lifecycle (`listSummary()` → `admin_raffles_summary` RPC, `get()`/`upsert()` on `raffles`, `draw()` → `draw_raffle` RPC). It has **no customer-side methods**; its header comment explicitly points /rifas at `ProductsService.listRaffles()`.
- `src/app/core/cart/cart.service.ts` — `add()` (ticket purchase path).
- `src/app/core/preview/card-conditions-dialog.service.ts` — condition-guide modal (static page slug `estado-de-cartas`).
- `src/app/core/catalog/catalog.types.ts` — `RaffleCardItem`, `RaffleStatus` (`'scheduled' | 'drawn' | 'void'`).
- `supabase/migrations/20260525000200_raffles_table.sql` (+ `..000800`, `..000900`, `20260525001000`, `20260528000100`) — the `rifas_listing` view and its column history.

## UI anatomy
1. **Breadcrumb** — `.breadcrumb`: home icon (`aria-label="Inicio"`) › "Rifas".
2. **Header** — `.rifas-header`: `<h1>` "Rifas" + `.lead` "Participá por cartas y productos exclusivos. Comprá tus números y esperá el sorteo en la fecha indicada." (voseo — this page's copy uses it).
3. **Loading** — `<mat-progress-bar mode="indeterminate">` while `loading()`.
4. **Tabs** — `<mat-tab-group mat-stretch-tabs="false" animationDuration="0ms">` with "Activas" and "Completadas". Each tab: `.rifas-empty` text ("No hay rifas activas en este momento. Vuelve pronto." / "Todavía no hay rifas finalizadas.") only when `!loading()` and the list is empty, else a `.cards-grid` of `<app-raffle-card [raffle]>` tracked by `raffle.id`.
5. **Tile** (`<app-raffle-card>`, the vertical "Live Arena" design shared visually with `<app-auction-card>` — but the root is a `<div>`, NOT a link: raffles have no detail page, so the purchase UI lives on the tile):
   - Root `.tile` gains `product-card--on-sale` (global amber ring + `$` badge) when on sale **and** scheduled; `.tile--done` (art `grayscale(.6) brightness(.96)`) when not scheduled. Hover lift `translateY(-3px)` gated on `@media (hover: hover)` — no pointer cursor on the root.
   - `.tile__art` — 16/10 crop, `object-position: top center` (portrait scans show the artwork band), diagonal sheen; `image_not_supported` fallback. Overlays: status `<app-pill>` top-LEFT (`scheduled` → green dot "Activa", `drawn` → blue "Sorteada", `void` → neutral "Sin participantes"); `.tile__agotada` "AGOTADA" top-RIGHT (brand red — the sanctioned sold-out-badge use) when sold out and scheduled.
   - `.tile__meta` — mono `metaLine()` "SET · #num/printedTotal" + the tappable condition pill (`conditionClass()`, tooltip/aria "Ver guía de condiciones" → conditions modal; kept tappable here, unlike the auction tile, because no detail page exists to host the guide). `.tile__name` bold, ellipsized, full name in `title`.
   - `.tile__price-row` per status: **`scheduled`** — label "Por espacio" + `₡price` (`.tile__price-sale` amber + `.tile__price-original` struck when discounted); right side `.tile__tickets`: ticket icon (`assets/images/raffle-ticket.png`) + mono "×{quantity}/{totalSpaces()}", or dim "Rifa completa" when sold out. **`drawn`** — label "Ganador" + winner name (amber text) + seeded-hue `.tile__winner-disc` initial on the right. **`void`** — label "Sin participantes" + dimmed `₡price`.
   - `.tile__market` (scheduled, when `market_price != null`): "Precio de mercado **₡X**", small dim line.
   - `.tile__notes` — clamped to **2 lines** (`-webkit-line-clamp`), full text in `title` (no detail page to overflow into).
   - `.tile__footer` (hairline, pushed to the tile bottom with `margin-top: auto` so rows align): **`scheduled`** — calendar icon + "Sorteo: {d/MM}" + `countdown()` `.tile__soon-chip` ("¡Hoy!" / "en 1 día" / "en N días"; `--soon` gold + bolt < 3 days) or "Fecha por definir". **`drawn`** — "Sorteada · {d/MM/yyyy}". **`void`** — "Finalizada · sin participantes".
   - `.tile__actions` (scheduled only, below the footer): qty stepper (`role="group"` "Cantidad de números", aria "Menos"/"Más", compact 30px icon buttons) + `.tile__add-btn` (brand-blue flat) — "Agregar ticket" (qty 1) / "Agregar tickets" (qty > 1) / disabled "AGOTADA".

## Services & backend
- `ProductsService.listRaffles()` — plain `select('*')` on the **`rifas_listing`** view. Final shape (after `20260528000100_rifas_listing_condition.sql`): `id, slug, name, image_url, price, sale_price, quantity, notes` (= `products.description`), `set_name, draw_at, status` (`coalesce(r.status, 'scheduled')`), `winner_name, total_entries, entries_sold, card_number, set_printed_total, market_price, condition`. Source: `products ⨝ raffles ⨝ sets` + a lateral sum of **non-cancelled** `order_items` quantities (= `entries_sold`); filtered to `category_id = raffle_category_id()`, `active = true`, `price > 0`; ordered `draw_at asc nulls last, created_at desc`; granted to `anon, authenticated`.
- The view is **`security_invoker = false`** (definer) — deliberately, so it can read the admin-only `raffles` table and `order_items`; it enforces its own visibility predicate instead of RLS. This is the documented exception to the "public views need security_invoker" rule.
- `raffle_category_id()` — stable `security definer` SQL function resolving the `rifas` category id (used by the view, RLS, and listing-exclusion functions).
- Ticket purchase: `CartService.add(raffle.id, qty)` — the raffle is an ordinary product, so tickets ride the normal cart (localStorage `cart:v1` anon / `cart_items` signed-in), checkout, and `place_order` flow; the entries a customer holds are simply `order_items` rows for the raffle product. Stock decrementing and over-sell protection are the standard product paths.
- The condition pill opens `CardConditionsDialogService.open()` → lazy-imports `CardConditionsDialog`, content from `StaticPagesService.getBySlug('estado-de-cartas')` (**`static_pages`**), cached on the root-provided service.
- `RafflesService` (admin: `raffles` table, `admin_raffles_summary`, `draw_raffle`) is **not used** by this page.

## State & data flow
- `Rifas` signals: `raffles: RaffleCardItem[]`, `loading` (starts `true`).
- Computeds: `activeRaffles` (`status === 'scheduled'` — includes sold-out ones awaiting the draw), `completedRaffles` (`'drawn' || 'void'`).
- Fetch happens once in the constructor (`bootstrap()`); errors → `MatSnackBar` (message or "Error desconocido", "OK", 5000 ms); `finally` clears `loading`. No URL state, no reload triggers.
- `RaffleCard` input: `raffle` (required `RaffleCardItem`). Signals/computeds: `qty` (starts 1; `step(delta)` clamps to `[1, max(1, quantity)]`), `isOnSale` (`sale_price != null && sale_price < price`), `soldOut` (`quantity === 0`), `metaLine` (joins with `' · '`), `totalSpaces` (`quantity + entries_sold` — original number of spaces), `countdown` (parses `draw_at.slice(0, 10)` as UTC midnight, compares with today's UTC date; `null` when absent/unparseable/past; `soon` = `days < 3` including today), `statusLabel`/`statusTone` (the `app-pill` mapping), `winnerHue()` (char-code hue for the winner disc).
- `onAddToCart()` → `cart.add(id, qty())`; error → snackbar (4000 ms); success → `qty` resets to 1. The tile itself never updates `quantity`/`entries_sold` — those refresh only on the next page load.

## Behaviors & edge cases
- Sold-out **scheduled** raffles stay listed under Activas as "Rifa completa" with the AGOTADA badge (public RLS keeps raffle products visible at `quantity = 0`, unlike normal cards; the view repeats the predicate for its definer read).
- A raffle with no `raffles` row yet still lists: `status` coalesces to `'scheduled'`, `draw_at` null → "Fecha por definir", no countdown.
- Empty-state copy is suppressed during the initial load (`!loading()` guard), so tabs don't flash "No hay rifas…" before data lands.
- Dates render with `DatePipe` timezone `'UTC'` to match the countdown's UTC-midnight math and avoid off-by-one-day drift in CR time (UTC−6).
- Countdown of a past `draw_at` on a still-`scheduled` raffle renders nothing (label `null`) — the date line still shows.
- `winner_name` is exposed publicly by design; `winner_email` is deliberately **not** in the view.
- Buying more tickets than remain fails in `CartService` with "Solo hay {n} en stock." (the stepper already caps at `quantity`).
- No pagination — the view returns every active raffle plus all completed ones, ever.

## Gotchas / invariants
- **Customer reads go through `ProductsService.listRaffles()`, not `RafflesService`** — despite the name, `RafflesService` is admin-only. Don't add customer methods there without revisiting its RLS assumptions (`raffles` is `raffles_admin_all`).
- **`rifas_listing` must stay a definer view** (`security_invoker = false`). Flipping it to invoker (per the general storefront-view rule) would break it: anon can't read `raffles` or `order_items`. Its own WHERE clause is the visibility gate — keep `active = true and price > 0` in every recreation.
- `CREATE OR REPLACE VIEW` only allows **appending** columns — every migration recreates the view verbatim with new columns at the end (`entries_sold` → `card_number`/`set_printed_total` → `market_price`/`condition`). Keep that order; reordering requires drop + recreate + regrant.
- `entries_sold` counts **all non-cancelled** orders, including `pending` (unpaid) ones — the "×remaining/total" figure moves as soon as an order is placed, not when it's paid. (Contrast: the admin `draw_raffle` pool gates on paid.)
- `totalSpaces()` (= `quantity + entries_sold`) only equals the true original space count if `products.quantity` was never manually edited after sales started; the view's `total_entries` column (from `raffles`) is populated at draw time, not before.
- The drawer only opens for **new** cart lines (`CartService.add()` → `setQuantity()` path skips `openDrawer()`), so adding tickets for a raffle already in the cart gives no visible feedback beyond the qty reset.
- `step()` uses `Math.max(1, quantity)` as its cap, so on a `quantity = 0` tile the stepper would allow qty 1 — harmless because the stepper and button are hidden/disabled when `soldOut()`, but don't remove those guards.
- The tile links **nowhere** — no `routerLink`, by design (no raffle detail page). `slug` is selected by the view but unused by the UI.
- The on-sale ring reuses the global `.product-card--on-sale` utility class on a non-product-card root — intentional (single source for the amber sale treatment), and it's suppressed for completed raffles.
- The AGOTADA `.tile__agotada` background is `var(--brand-red)` — a sanctioned use (sold-out badge), noted in-file. Status pills use the semantic palette (green/blue/neutral), never brand red.
- `countdown()` computes from `new Date()` once per signal evaluation — it won't tick across midnight without a re-render; fine for a listing page. It is deliberately day-based (NOT `app-countdown`'s ticking clock) because `draw_at` is date-only.
- The tile grid is kept in lock-step with `/subastas` (`minmax(240px, 1fr)`, gap 16, 2-up < 960px, 1-up < 600px); the tile itself mirrors `auction-card.scss`'s `.tile*` vocabulary — visual changes should usually land in both files.

## Related docs
- [Product detail](./detail.md)
- [Card list](./card-list.md)
- [Cart drawer](./cart-drawer.md)
- [Checkout](./checkout.md)
- [Dialogs](./dialogs.md)
- [Admin raffles](../admin/raffles.md)
- [Admin raffle detail](../admin/raffle-detail.md)
- [Data model](../../architecture/data-model.md)
- [Backend RPCs & functions](../../architecture/backend-rpcs-and-functions.md)
