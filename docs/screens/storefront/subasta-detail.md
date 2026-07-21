# Subasta detail (/subastas/:slug) — "Live Arena"
> Part of the Poke-Singles docs set. Verified against source on 2026-07-21. Load together with /CLAUDE.md.

## Purpose
The per-auction bidding page, built to the Claude Design "Live Arena" handoff (`.tmp/handoffs/design_handoff_auction/`): a **dark arena hero** (the one place the app inverts to a dark surface) holds the card art, live countdown tiles, current bid and the bid box; everything below returns to the warm storefront — a leaderboard-style bid history, seller notes, and a "Más subastas" rail. The three auction-specific UX pieces live here: the in-place **login-then-bid** flow, the **commit-to-pay confirmation modal** on every bid, and **live updates** pushed to all viewers over Supabase Broadcast.

## Route & access
- Path: `/subastas/:slug` → `SubastaDetail` (lazy, child of `UserShell`, `maintenanceGuard` only). `slug` arrives via `withComponentInputBinding` as `input.required<string>()`; loading happens in `ngOnInit`.
- Public read; **bidding is gated at action time, not by route guard**.

## Files
- `src/app/user/subastas/subasta-detail.ts` / `.html` / `.scss` — the page. The SCSS holds the arena's dark ramp (`#15151A / #23222A / #1B1B20 / #26262C` + white-alpha hairlines) **deliberately component-scoped, not brand tokens**.
- `src/app/user/subastas/bid-confirm-dialog.ts` — dark confirmation modal (spec: `bid-confirm-dialog.spec.ts`); opened with `panelClass: 'arena-dialog'` (surface override in `src/styles/_material-overrides.scss`).
- `src/app/shared/countdown/countdown.ts` — `variant="tiles"` here (DD : HH : MM : SS mono tiles; spec: `countdown.spec.ts` covers the inline variant).
- `src/app/shared/auction-card/` — the vertical tile reused by the "Más subastas" rail.
- `src/app/core/auctions/bids.service.ts` — `listBids()` + `placeBid()` (`PlaceBidResult` envelope).
- `src/app/core/auctions/auction-live.service.ts` — `watch(productId)` → `Signal<AuctionLiveEvent | null>`, `teardown(productId)`.
- `src/app/core/catalog/products.service.ts` — `getAuctionBySlug(slug)`, `listAuctions()` (rail).
- `src/app/core/settings/app-settings.service.ts` — WhatsApp number for "Pedir fotos adicionales".
- `supabase/migrations/20260718000000_place_bid.sql` — `place_bid` RPC + `tg_auction_broadcast` trigger.

## UI anatomy
1. **Breadcrumb** — mono uppercase (arena treatment): home icon (amber) › "Subastas" › auction name.
2. **Arena hero** (`.arena`) — radius 20, dark radial gradient, the sanctioned 3px brand-bar gradient on its top edge, a decorative amber glow. Grid `318px / 1fr`, gap 44 (stacks < 960px):
   - **Left**: card art in a 63/88 frame with drop shadow, warm halo and diagonal sheen; icon fallback when `image_url` is missing. Below it: **"Pedir fotos adicionales"** — a dark-ghost `<a>` with the WhatsApp icon → `wa.me/{app_settings.whatsapp_number}` (store number fallback) prefilled "Hola, quiero más fotos de {name} {set} #{num}." (mirrors the product-detail button).
   - **Right — the console**:
     - Status row: amber **"● EN VIVO"** pulse pill while active (amber by decision — brand red stays restricted); "FINALIZADA"/"SIN PUJAS" neutral pill otherwise; mono meta `{set_name} · #006/198`; the tappable **condition pill** (`.condition-pill--btn` + `.arena__condition` dark overrides) → conditions guide.
     - Title — Manrope 800 38px white.
     - **Active**: countdown block ("Cierra en" + close datetime + `<app-countdown variant="tiles">`, "Por definir" pill when `ends_at` null) + anti-snipe line "⚡ Una puja en los últimos {N} min extiende el cierre {N} min." (hidden when 0/null); current-bid row — label "Puja actual"/"Precio inicial", 52px amber glowing amount, "{n} puja(s)", and the **leader chip** (top bidder's Pokémon avatar or initial, masked name, amber **TÚ** tag when `is_mine`, "va ganando") — hidden with no bids; the **bid box** (amber-glow card): "Próxima puja mínima ₡X · incremento ₡Y", dark `₡` input (spinners hidden, `tabular-nums`) with the `+{incremento}` chip inside, amber-gradient **Pujar** button (gavel, "Pujando…" while in flight), micro-copy "Al pujar te comprometés a pagar si ganás. Se pedirá una confirmación." When active but not open: "La subasta cerró — confirmando el resultado…" (past close, cron pending) or "La fecha de cierre aún no está definida; pronto se abrirán las pujas."
     - **Ended**: console collapses to "Precio final" + 44px amber amount + blue **winner chip** ("Ganó {winner_masked}" + crown) + "Cerró · {d/MM, HH:mm}". **Void**: "Precio inicial" dimmed + "Nadie pujó antes del cierre. No hay ganador."
3. **Below-hero grid** (`1.5fr / 1fr`, stacks < 960px):
   - **Historial de pujas** — header + mono "Se actualiza en vivo" tag. `rankedBids()` renders leaderboard rows: rank (crown on top), 38px avatar (Pokémon portrait or masked-initial disc), masked name + **TÚ** tag (blue on cream), mono time (+" · puja más alta" on top), 18px amount (amber-text on the top row). Top row = `--accent-amber-soft` + `--amber-edge`; own rows lightly amber-tinted. While `biddingOpen()`: a **dashed invite row** — "Este lugar está libre — superá ₡{current} para tomar la delantera." / "Nadie ha pujado todavía — sé la primera persona en pujar." + "≥ ₡{minNext}". Closed with zero bids: "Esta subasta cerró sin pujas."
   - **Right rail** — "Notas del vendedor" tonal card (hidden when `notes` empty), "Anti-sniping activo" info card (hidden when window 0), "Compromiso de pago" info card ("Si ganás recibís una orden de pago por correo. No pagar puede vetarte de futuras subastas.").
4. **Más subastas** — header + `app-pill-tabs` Activas/Finalizadas (counts); up to **4** `<app-auction-card>` tiles (`repeat(4,1fr)`, 2-up < 960px, 1-up < 600px), current auction excluded; per-tab empty texts. Section hidden entirely when there are no other auctions.

## Services & backend
- **Reads**: `getAuctionBySlug` + `listBids` (masked `subastas_bids` view — `bidder_masked`, `avatar_pokemon_number`, `is_mine`); rail via `listAuctions()` (best-effort); `AppSettingsService.get()` for the WhatsApp number (best-effort).
- **Write**: `place_bid(p_product_id, p_amount) returns jsonb` — validation order and codes documented in [../../architecture/backend-rpcs-and-functions.md](../../architecture/backend-rpcs-and-functions.md). `min_next` rides `BID_TOO_LOW` so the box re-prefils.
- **Live**: `tg_auction_broadcast` → `realtime.send` on **public** topic `auction:<product_id>`, event `auction_update`, masked payload.

## State & data flow
- Signals: `auction`, `bidHistory`, `loading`, `notFound`, `placing`, `moreAuctions`, `railTab`, `whatsappNumber`, `clientEnded` (reactivity hook for `biddingOpen`).
- Computeds: `metaLine` (`SET · #num/total`), `rankedBids` (sorted amount-desc — which for live bids IS newest-first, since each bid must beat the last; rank + `isTop`), `topBid` (leader chip), `minNextBid`, `hasBids`, `isActive`, `biddingOpen`, `railTabs`/`railAuctions`, `whatsappLink`.
- `startLive()` effect: each broadcast **optimistically patches** `status/current_bid/bid_count/ends_at`, keeps `bidAmount ≥ minNextBid()`, then `refresh()`es the views for authoritative state. `ngOnDestroy` → `teardown`.
- Countdown `finished` → hide the bid box immediately + `refresh()` after 5 s (the cron closes within the minute).

## Behaviors & edge cases — the bid flow (`onBid()`)
1. Client pre-checks (amount valid, ≥ `minNextBid()`).
2. **Login-then-bid**: signed out → lazy `LoginDialog` (`panelClass: 'login-dialog-panel'`); continue only on `'signed-in'`/`'signed-up'`. No navigation — the bid intent survives.
3. **Confirmation modal** (every bid): `BidConfirmDialog` — dark card, 44px amber amount, required checkbox "Entiendo que al pujar me comprometo a pagar si gano. De lo contrario podría ser vetado de futuras subastas.", ghost Cancelar + amber "Confirmar puja" (disabled until checked). Closes `true` only on confirm.
4. `placeBid()` result → **toned snackbars** (`panelClass` → left-border accents in `_material-overrides`): ok → green "¡Puja registrada! Vas ganando." (or "…El cierre se extendió unos minutos."); `BID_TOO_LOW` → amber "Alguien pujó primero — tu puja no entró. El nuevo mínimo es ₡X." + refresh + re-prefill; `ALREADY_LEADING` → green "Ya sos la puja más alta — vas ganando."; `AUCTION_ENDED`/`AUCTION_NOT_ACTIVE` → blue "La subasta acaba de cerrar — ya no se aceptan pujas."; `AUCTION_BANNED` → **danger** "Tu cuenta está vetada de subastas. Escribinos si creés que es un error."; `INVALID_AMOUNT` → amber "Monto inválido — usá colones enteros."

## Gotchas / invariants
- The broadcast channel is **public and spoofable** — payloads are optimistic hints; `refresh()` after every event is what makes the UI authoritative.
- The dark ramp is **arena-scoped** — do not promote it to `_brand-tokens.scss` or reuse it elsewhere without a design decision. The app bar, breadcrumb and everything below the hero stay on cream.
- Brand red appears **only** on the arena's 3px brand-bar edge. The EN VIVO pill is amber (explicit decision); banned toast uses `--danger`.
- `place_bid` accepts whole colones only; the countdown can jump **upward** on anti-snipe — expected, don't guard against it.
- One broadcast channel per open page; `teardown()` in `ngOnDestroy` or sockets leak.
- The concurrent-bid race is real: the loser gets `BID_TOO_LOW` with fresh `min_next` — always re-prefill, never just error.
- No "Ver carta completa"/wishlist under the art (skipped by decision — auctions have no product page and no wishlist exists); the WhatsApp photos button lives there instead.

## Related docs
- [subastas](./subastas.md) — the listing + tile.
- [login-dialog](./login-dialog.md) — close values the resume flow depends on.
- [../admin/auction-detail.md](../admin/auction-detail.md) — full-name view + reassign/relist.
- [../../architecture/backend-rpcs-and-functions.md](../../architecture/backend-rpcs-and-functions.md) — auction RPC/cron/email catalog.
