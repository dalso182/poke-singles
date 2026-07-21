# Subastas (/subastas)
> Part of the Poke-Singles docs set. Verified against source on 2026-07-20. Load together with /CLAUDE.md.

## Purpose
The customer auction listing. An auction **is a product** in the `subastas` category (mirror of the rifas pattern): `products.price` = starting bid, `quantity` = 1 while live (0 once the winner order is created), `products.description` = notes; live state (current bid / bid count / close) and the winner live in the 1:1 `auctions` table. The page splits auctions into "Activas" and "Finalizadas" tabs of `<app-auction-card>` tiles. Unlike raffles, each tile links to a detail page — [subasta-detail](./subasta-detail.md) — where bidding happens.

## Route & access
- Path: `/subastas` → `Subastas` (lazy, child of `UserShell`, behind `maintenanceGuard` only — public, no auth guard). No query params, no inputs.
- `/products/:slug` redirects auction slugs to `/subastas/:slug` (see [detail](./detail.md)). Auctions are excluded from `/products`, `/buscar`, the facet counts, and the home rails.
- Reached from the header nav ("Subastas", icon `nav-gavel`) and the footer "Tienda" column.

## Files
- `src/app/user/subastas/subastas.ts` / `.html` / `.scss` — `Subastas` list component (fetch + tab split; page chrome kept in lock-step with /rifas).
- `src/app/shared/auction-card/auction-card.ts` / `.html` / `.scss` — `AuctionCard` tile (`[auction]` input of `AuctionListingItem`).
- `src/app/shared/countdown/countdown.ts` — `<app-countdown>` live ticker (shared with the detail page; see below).
- `src/app/core/catalog/products.service.ts` — `listAuctions()` (reads `subastas_listing`), `auctionCategoryId()` (memoised resolver), `list({ excludeAuctions })`.
- `src/app/core/catalog/catalog.types.ts` — `AuctionListingItem`, `AuctionStatus` (`'active' | 'ended' | 'void'`).
- `supabase/migrations/20260717000100_auctions_tables.sql` — the `subastas_listing` definer view.

## UI anatomy
1. **Breadcrumb** — home icon › "Subastas".
2. **Header** — `<h1>` "Subastas" + lead "Pujá por cartas exclusivas y llevátelas al mejor precio. La subasta cierra en la fecha indicada y la carta se vende al mejor postor." (voseo, matching /rifas).
3. **Tabs** — "Activas" (`status === 'active'`) / "Finalizadas" (`'ended' | 'void'`); empty texts "No hay subastas activas en este momento. Vuelve pronto." / "Todavía no hay subastas finalizadas."; `.cards-grid` `minmax(400px, 1fr)`, 1-col below 600px.
4. **Tile** (`<app-auction-card>`, horizontal — 150px image left):
   - Image + name are `<a [routerLink]="['/subastas', slug]">`. Badges: `ended` → `.auction-badge--sold` "VENDIDA" (amber); `void` → `.auction-badge--void` "FINALIZADA" (neutral). No brand red — AGOTADA stays reserved for regular products.
   - `metaLine()` "SetName, #num/printedTotal" + condition pill (opens the shared conditions modal).
   - `@switch (auction().status)`: **ended** → trophy "Ganador: {winner_masked}" + winning `₡` + "Cerrada el {d/MM/yyyy}"; **void** → "Subasta finalizada · sin pujas"; **default (active)** → "Cierra: {d/MM/yyyy, HH:mm}" + `<app-countdown>` chip (or "Fecha por definir"), `displayAmount()` (`current_bid ?? starting_price`) with unit "puja actual" / "puja inicial", gavel icon "{bid_count} puja(s)", optional notes.
   - CTA link "Ver y pujar" (active) / "Ver subasta" → the detail page.

## Services & backend
- `ProductsService.listAuctions()` → plain select on **`subastas_listing`** — a DEFINER view (`security_invoker = false`, like `rifas_listing`) over `products ⨝ auctions ⨝ sets`, filtered to `category_id = auction_category_id() AND active AND deleted_at IS NULL AND price > 0`, ordered actives-first then `ends_at asc nulls last`. Columns include `starting_price` (alias of `products.price`), `current_bid`, `bid_count`, `min_increment`, `anti_snipe_minutes`, `ends_at`, `status` (coalesced `'active'`), `winner_masked` (already masked via `mask_bidder_name()`), `closed_at`. It never exposes `winner_email` or any user ids.
- Exclusions elsewhere: `products_search` + `set_product_counts()` + `card_type_product_counts()` exclude the category (migration `20260717000200`); home rails pass `excludeAuctions: true`; `/buscar`'s Categoría facet filters out `subastas` (`card-list.ts` `categoriesForFilter`).
- `products_public_read` RLS special-cases auctions (like raffles) so they stay visible at `quantity = 0` (migration `20260717000000`).

## State & data flow
Signals `auctions` / `loading`; computeds `activeAuctions` / `completedAuctions`. Single fetch in the constructor; no realtime on the list page (live updates are scoped to the detail page).

## Behaviors & edge cases
- `<app-countdown>` (`src/app/shared/countdown/countdown.ts`) ticks every second: `"2d 04:12:45"` → `"04:12:45"` under a day → `"Finalizada"` at zero → `"Por definir"` with no `endsAt`. Host classes `is-soon` (< 1 h, amber treatment) and `is-ended`; emits `finished` once per zero-crossing and re-arms if `endsAt` moves (anti-snipe).
- A closed auction stays in "Finalizadas" indefinitely (visibility comes from `active`/`price`, not quantity).

## Gotchas / invariants
- `subastas_listing` is a **definer view** — its WHERE clause is the security boundary. Never add user-identifying columns to it.
- The tile shows `current_bid` from the fetch snapshot only; it does not subscribe to broadcasts. Don't add per-tile channels — the grid would open N sockets.
- Auction products must never be purchasable through the cart: `place_order` v11 rejects them with `AUCTION_NOT_PURCHASABLE` (migration `20260717000300`). That guard is load-bearing security.

## Related docs
- [subasta-detail](./subasta-detail.md) — the bidding page.
- [rifas](./rifas.md) — the sibling pattern this mirrors.
- [detail](./detail.md) — the auction-slug redirect.
- [../admin/auctions.md](../admin/auctions.md) — admin side.
