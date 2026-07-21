# Admin · Subastas (/admin/auctions)
> Part of the Poke-Singles docs set. Verified against source on 2026-07-20. Load together with /CLAUDE.md.

## Purpose
Admin auction list: every product in the `subastas` category (incl. inactive) with live state, bid counts, and winner. Mirror of the raffles admin list. Rows click through to [auction-detail](./auction-detail.md).

## Route & access
- Path: `/admin/auctions` → `Auctions` (lazy, under the `/admin` parent with `adminGuard`). `pathMatch: 'full'`; detail at `/admin/auctions/:id` where `:id` is the **product uuid**.
- Sidenav: Catálogo section, `{ label: 'Subastas', icon: 'gavel' }` right after Rifas, with a live count badge (`auctionCount` = active auctions, fetched best-effort in `AdminShell.ngOnInit`).
- "Agregar subasta" → `/admin/products/new?category=subastas` (the add-product form preselects the category, revealing "Datos de la subasta" — see [add-product](./add-product.md)).

## Files
- `src/app/admin/auctions/auctions.ts` / `.html` / `.scss` — the list.
- `src/app/core/catalog/auctions.service.ts` — `AuctionsService.listSummary()` → `admin_auctions_summary` RPC.
- `supabase/migrations/20260717000100_auctions_tables.sql` — the RPC.

## UI anatomy
- `app-page-header` (kicker "Ventas") + `app-pill-tabs` **Activas** / **Finalizadas** with counts (client-side split on `status`).
- `mat-table` (`app-table--cozy`), columns `['image','name','ends','bid','bids','status','winner']`:
  - Subasta — name (+ "· inactiva" when `!active`, "· relanzada ×N" when `relist_count > 0`).
  - Cierre — `ends_at` while active (or "Por definir"), `closed_at` once closed.
  - Puja actual — `app-money` of `current_bid`, or "₡{starting_price} inicial" dimmed when no bids.
  - Pujas — `bid_count` (+ "({bidders} postor(es))" — distinct live bidders).
  - Estado — pill: active → blue "Activa", ended → green "Vendida", void → neutral "Sin pujas".
  - Ganador — `winner_name` + mono "#{winner_order_number}".
- Empty texts: "No hay subastas activas. Usa \"Agregar subasta\" para crear una." / "Todavía no hay subastas finalizadas."

## Services & backend
`admin_auctions_summary()` — RETURNS TABLE, security definer, `is_admin()` gate (`NOT_AUTHORIZED`). One row per Subastas-category product: product fields + `ends_at, status (coalesced 'active'), min_increment, current_bid, bid_count, bidders (distinct live bidder count), winner_name, winner_order_id, winner_order_number (join orders), reminder_sent_at, closed_at, relist_count`. Ordered actives-first, `ends_at asc nulls last`.

## Gotchas / invariants
- Adding a column to `admin_auctions_summary` changes its RETURNS TABLE type → **DROP FUNCTION then recreate** (same rule as `admin_customers`).
- `bidders` arrives as bigint — `AuctionsService.listSummary()` coerces with `Number()`.

## Related docs
- [auction-detail](./auction-detail.md) · [add-product](./add-product.md) · [raffles](./raffles.md) (the sibling pattern) · [../storefront/subastas.md](../storefront/subastas.md)
