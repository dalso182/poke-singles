# Subasta detail (/subastas/:slug)
> Part of the Poke-Singles docs set. Verified against source on 2026-07-20. Load together with /CLAUDE.md.

## Purpose
The per-auction bidding page: card large, live current bid + countdown, masked bid history, and the bid box. This is where the three auction-specific UX pieces live: the in-place **login-then-bid** flow, the **commit-to-pay confirmation modal** shown on every bid, and **live updates** pushed to all viewers over Supabase Broadcast.

## Route & access
- Path: `/subastas/:slug` → `SubastaDetail` (lazy, child of `UserShell`, `maintenanceGuard` only). `slug` arrives via `withComponentInputBinding` as `input.required<string>()`; loading happens in `ngOnInit` (inputs aren't set at construction).
- Public read; **bidding is gated at action time, not by route guard** — a signed-out "Pujar" opens the LoginDialog and resumes.

## Files
- `src/app/user/subastas/subasta-detail.ts` / `.html` / `.scss` — the page.
- `src/app/user/subastas/bid-confirm-dialog.ts` — `BidConfirmDialog` (inline template; spec: `bid-confirm-dialog.spec.ts`).
- `src/app/shared/countdown/countdown.ts` — `<app-countdown>` (spec: `countdown.spec.ts`).
- `src/app/core/auctions/bids.service.ts` — `BidsService`: `listBids()` (public view) + `placeBid()` (RPC) + the `PlaceBidResult` envelope type.
- `src/app/core/auctions/auction-live.service.ts` — `AuctionLiveService`: `watch(productId)` → `Signal<AuctionLiveEvent | null>`, `teardown(productId)`. Channel lifecycle mirrors `PresenceService`.
- `src/app/core/catalog/products.service.ts` — `getAuctionBySlug(slug)` (single row of `subastas_listing`).
- `supabase/migrations/20260718000000_place_bid.sql` — `place_bid` RPC + `tg_auction_broadcast` trigger.

## UI anatomy
1. **Breadcrumb** — home › "Subastas" (link) › auction name.
2. **Two-column layout** (`minmax(260px,380px) 1fr`, stacking < 768px): image card (with VENDIDA/FINALIZADA badge) left; info right.
3. **Info column** by status:
   - **active** — `.bid-state` card: label "Puja actual"/"Puja inicial", big `₡` amount, "{bid_count} puja(s)"; close line "Cierra: {d/MM/yyyy, HH:mm}" + `<app-countdown>`; anti-snipe note "Una puja en los últimos {N} min extiende el cierre {N} min." (hidden when `anti_snipe_minutes` = 0). Then the **bid box** (only while `biddingOpen()`): hint "Próxima puja mínima: **₡X**" (+ "(incremento ₡Y)" once there are bids), `₡` number input (spinners hidden; the `+₡Y` button is the stepper), and the "Pujar" button (gavel icon; "Pujando…" while placing). If active but not open: "La subasta cerró — confirmando el resultado…" (past close, cron pending) or "La fecha de cierre aún no está definida; pronto se abrirán las pujas." (`ends_at` null).
   - **ended** — amber `.winner-banner`: trophy, "Ganador: **{winner_masked}**", winning `₡`, "Cerrada el …".
   - **void** — neutral banner "Subasta finalizada · sin pujas".
4. **Historial de pujas** — `<ol>` of rows: 32px avatar circle (Pokémon portrait via `PokemonService.portraitUrl(avatar_pokemon_number)`, fallback person icon), `bidder_masked` (+ amber "tú" tag when `is_mine`), `₡amount`, `d/MM, HH:mm`, trophy icon on the top row. `.bid-row--top` amber border; `.bid-row--mine` tinted background. Empty: "Todavía no hay pujas. ¡Sé la primera persona en pujar!".

## Services & backend
- **Reads**: `getAuctionBySlug` (listing view) + `BidsService.listBids` → **`subastas_bids`** definer view: `id, product_id, amount, created_at, bidder_masked` (server-side `mask_bidder_name()`: 'Diego Alvarez' → 'D***o A.'), `avatar_pokemon_number`, `is_mine` (`user_id is not distinct from auth.uid()` — works inside the definer view). Invalidated bids (relists) are filtered server-side.
- **Write**: `place_bid(p_product_id, p_amount) returns jsonb` — security definer, **granted to `authenticated` only** (anon gets a permission error; UI never lets it get that far). Validation order: session (raises `NOT_AUTHORIZED`), whole-colones sanity (`INVALID_AMOUNT`), `FOR UPDATE` lock on the auctions row (serializes concurrent bids AND the cron close), `NOT_AN_AUCTION` / `AUCTION_NOT_ACTIVE` (product inactive/deleted, status ≠ active, `ends_at` null) / `AUCTION_ENDED` / `AUCTION_BANNED` (profiles.auction_banned_at) / `ALREADY_LEADING` (leader can't outbid themselves) / `BID_TOO_LOW` (returns `min_next` = `current_bid + min_increment`, or `starting_price` for the first bid). Anti-snipe: a bid with < `anti_snipe_minutes` left pushes `ends_at` to `now() + window`. Inserts the bid with a **name/email snapshot** (profiles.full_name → email local-part → 'Anónimo'), updates the denormalized `current_bid`/`bid_count`/`leader_user_id`/`ends_at` (fires the broadcast), returns `{ok, bid_id, current_bid, bid_count, ends_at, extended}`.
- **Live**: `tg_auction_broadcast` (AFTER UPDATE OF `current_bid, bid_count, ends_at, status` ON auctions) calls `realtime.send(payload, 'auction_update', 'auction:<product_id>', false)` — a **public** Broadcast topic with an already-masked payload `{product_id, status, current_bid, bid_count, ends_at, top_bidder, top_avatar}`. Failures are swallowed (never roll back a bid/close).

## State & data flow
- Signals: `auction`, `bidHistory`, `loading`, `notFound`, `placing`, plus `clientEnded` (bumped by the countdown's `finished` to force `biddingOpen()` re-evaluation).
- Computeds: `metaLine`, `hasBids`, `minNextBid` (`current_bid + min_increment` else `starting_price`), `isActive`, `biddingOpen` (active AND `ends_at` future, client-side).
- `startLive(productId)` (called after load) creates an `effect` (with the component `Injector`) on `AuctionLiveService.watch()`: each event **optimistically patches** `status/current_bid/bid_count/ends_at` on the `auction` signal, keeps `bidAmount ≥ minNextBid()`, then calls `refresh()` — an authoritative re-fetch of the listing row + history. `ngOnDestroy` → `live.teardown(id)`.
- Countdown `finished` → `onCountdownFinished()`: bumps `clientEnded` (bid box hides immediately) and schedules a `refresh()` after 5 s (the cron closes server-side within the minute).

## Behaviors & edge cases — the bid flow (`onBid()`)
1. Client pre-checks: valid amount, `≥ minNextBid()` (snackbars "Ingresá un monto válido." / "La puja mínima es ₡X.").
2. **Login-then-bid**: `await auth.ready`; if signed out, lazily import `LoginDialog`, open with `panelClass: 'login-dialog-panel'`, and continue **only** when `afterClosed()` resolves `'signed-in'` or `'signed-up'`. The page never navigates — the bid intent survives. (This is the first in-place login-resume in the app; guards elsewhere redirect.)
3. **Confirmation modal** (every bid): `BidConfirmDialog` shows the formatted amount + product and requires checking "Entiendo que al pujar me comprometo a pagar si gano. De lo contrario podría ser vetado de futuras subastas." before "Confirmar puja" enables. Closes `true` only on confirm.
4. `placeBid()` result mapping: ok → "¡Puja registrada! Vas ganando." (or "…El cierre se extendió unos minutos." when `extended`), refresh, re-prefill `bidAmount`; `BID_TOO_LOW` → refresh + prefill `min_next` + "Alguien pujó primero — la nueva puja mínima es ₡X."; `ALREADY_LEADING` → "Ya tenés la puja más alta."; `AUCTION_ENDED`/`AUCTION_NOT_ACTIVE` → refresh + "La subasta ya cerró."; `AUCTION_BANNED` → "Tu cuenta no puede participar en subastas. Escribinos si creés que es un error."; `INVALID_AMOUNT` → "Monto inválido — usá colones enteros."

## Gotchas / invariants
- The broadcast channel is **public and therefore spoofable** — treat payloads strictly as optimistic hints; `refresh()` after every event is what makes the UI authoritative. Never render trusted state purely from a broadcast payload.
- `place_bid` accepts **whole colones only** (`p_amount <> round(p_amount)` → `INVALID_AMOUNT`).
- The race is real and tested: two concurrent bids serialize on the row lock; the loser gets `BID_TOO_LOW` with the fresh `min_next` — the UI must re-prefill, not just error.
- The countdown must react to `endsAt` input changes (anti-snipe pushes it while on screen) — it does, and re-arms its one-shot `finished`.
- One channel per open detail page; `teardown()` in `ngOnDestroy` or sockets leak across navigations.

## Related docs
- [subastas](./subastas.md) — the listing.
- [login-dialog](./login-dialog.md) — close values `'signed-in'` / `'signed-up'` the resume flow depends on.
- [../admin/auction-detail.md](../admin/auction-detail.md) — full-name view + reassign/relist.
- [../../architecture/backend-rpcs-and-functions.md](../../architecture/backend-rpcs-and-functions.md) — auction RPC/cron/email catalog.
