# Subastas (/subastas)
> Part of the Poke-Singles docs set. Verified against source on 2026-07-21. Load together with /CLAUDE.md.

## Purpose
The customer auction listing. An auction **is a product** in the `subastas` category (mirror of the rifas pattern): `products.price` = starting bid, `quantity` = 1 while live (0 once the winner order is created), `products.description` = notes; live state (current bid / bid count / close) and the winner live in the 1:1 `auctions` table. The page splits auctions into "Activas" and "Finalizadas" tabs of `<app-auction-card>` tiles. Unlike raffles, each tile links to a detail page — [subasta-detail](./subasta-detail.md) — where bidding happens.

## Route & access
- Path: `/subastas` → `Subastas` (lazy, child of `UserShell`, behind `maintenanceGuard` only — public, no auth guard). No query params, no inputs.
- `/products/:slug` redirects auction slugs to `/subastas/:slug` (see [detail](./detail.md)). Auctions are excluded from `/products`, `/buscar`, the facet counts, and the home rails.
- Reached from the header nav ("Subastas", icon `nav-gavel`) and the footer "Tienda" column.

## Files
- `src/app/user/subastas/subastas.ts` / `.html` / `.scss` — `Subastas` list component (fetch + tab split; grid `minmax(240px,1fr)`, 2-up < 960px, 1-up < 600px).
- `src/app/shared/auction-card/auction-card.ts` / `.html` / `.scss` — `AuctionCard` **vertical tile** (`[auction]` input of `AuctionListingItem`) — the "Live Arena" handoff design, shared with the detail page's "Más subastas" rail.
- `src/app/shared/countdown/countdown.ts` — `<app-countdown>` (the tile uses `variant="chip"`).
- `src/app/core/catalog/products.service.ts` — `listAuctions()` (reads `subastas_listing`), `auctionCategoryId()` (memoised resolver), `list({ excludeAuctions })`.
- `src/app/core/catalog/catalog.types.ts` — `AuctionListingItem`, `AuctionStatus` (`'active' | 'ended' | 'void'`).
- `supabase/migrations/20260717000100_auctions_tables.sql` — the `subastas_listing` definer view.

## UI anatomy
1. **Breadcrumb** — home icon › "Subastas".
2. **Header** — `<h1>` "Subastas" + lead "Pujá por cartas exclusivas y llevátelas al mejor precio. La subasta cierra en la fecha indicada y la carta se vende al mejor postor." (voseo).
3. **Tabs** — `mat-tab-group`: "Activas" (`status === 'active'`) / "Finalizadas" (`'ended' | 'void'`); empty texts "No hay subastas activas en este momento. Vuelve pronto." / "Todavía no hay subastas finalizadas."
4. **Tile** (`<app-auction-card>`, vertical — Live Arena design; the whole tile is an `<a [routerLink]="['/subastas', slug]">`):
   - **Art** — `aspect-ratio: 16/10`, `object-fit: cover; object-position: top center` (portrait card scans crop to the artwork band), diagonal sheen overlay, `image_not_supported` icon fallback. Status `<app-pill>` top-left: active → green with dot "Activa", ended → blue "Finalizada", void → neutral "Sin pujas". Closed tiles desaturate the art (`grayscale(.6) brightness(.96)` via `.tile--done`).
   - **Body** — mono meta line `SET · #006/198 · NM` (parts drop when missing, ellipsized), bold name (ellipsized), then the state-aware price row: label `Puja actual` (amber amount) / `Precio inicial` / `Precio final` / `Sin pujas` (dimmed amount) over `₡{current_bid ?? starting_price}`; right side shows "{n} puja(s)" (active w/ bids), blue "Sé el primero →" (active, no bids), or the winner chip (seeded-hue disc with the masked name's initial + `winner_masked`) for ended.
   - **Footer** (hairline-topped) — active: amber clock icon + `<app-countdown variant="chip">` ("1d · 13h · 17m · 20s"); ended: mono "Cerró · {d/MM, HH:mm}"; void: "Cerró sin ofertas".
   - Hover: `translateY(-3px)` + shadow, gated on `@media (hover: hover)`.

## Services & backend
- `ProductsService.listAuctions()` → plain select on **`subastas_listing`** — a DEFINER view (`security_invoker = false`, like `rifas_listing`) over `products ⨝ auctions ⨝ sets`, filtered to `category_id = auction_category_id() AND active AND deleted_at IS NULL AND price > 0`, ordered actives-first then `ends_at asc nulls last`. Columns include `starting_price` (alias of `products.price`), `current_bid`, `bid_count`, `min_increment`, `anti_snipe_minutes`, `ends_at`, `status` (coalesced `'active'`), `winner_masked` (already masked via `mask_bidder_name()`), `closed_at`. It never exposes `winner_email` or any user ids.
- Exclusions elsewhere: `products_search` + `set_product_counts()` + `card_type_product_counts()` exclude the category (migration `20260717000200`); home rails pass `excludeAuctions: true`; `/buscar`'s Categoría facet filters out `subastas` (`card-list.ts` `categoriesForFilter`).
- `products_public_read` RLS special-cases auctions (like raffles) so they stay visible at `quantity = 0` (migration `20260717000000`).

## State & data flow
Signals `auctions` / `loading`; computeds `activeAuctions` / `completedAuctions`. Single fetch in the constructor; no realtime on the list page (live updates are scoped to the detail page).

## Behaviors & edge cases
- `<app-countdown>` ticks every second; `chip` variant renders "Por definir" / "Finalizada" as a muted mono label when there's no target or it passed. Host classes `is-soon` (< 1 h) / `is-ended`; `finished` emits once per zero-crossing and re-arms if `ends_at` moves (anti-snipe).
- A closed auction stays in "Finalizadas" indefinitely (visibility comes from `active`/`price`, not quantity).
- The tile's condition is plain text in the meta line (not the tappable guide pill — that lives on the detail page's hero).

## Gotchas / invariants
- `subastas_listing` is a **definer view** — its WHERE clause is the security boundary. Never add user-identifying columns to it.
- The tile shows `current_bid` from the fetch snapshot only; it does not subscribe to broadcasts. Don't add per-tile channels — the grid would open N sockets.
- Auction products must never be purchasable through the cart: `place_order` v11 rejects them with `AUCTION_NOT_PURCHASABLE` (migration `20260717000300`). That guard is load-bearing security.
- Status pills use the semantic palette (green/blue/neutral) — never `--brand-red`.

## Related docs
- [subasta-detail](./subasta-detail.md) — the bidding page (Live Arena).
- [rifas](./rifas.md) — the sibling pattern this mirrors.
- [detail](./detail.md) — the auction-slug redirect.
- [../admin/auctions.md](../admin/auctions.md) — admin side.
