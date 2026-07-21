# Admin · Subasta detail (/admin/auctions/:id)
> Part of the Poke-Singles docs set. Verified against source on 2026-07-20. Load together with /CLAUDE.md.

## Purpose
Per-auction back office: product summary + auction config, the **full-name** bid log (customers only ever see masked names), the winner block linking the auto-created order, and the non-payment tools — **Cancelar y reasignar** (crown the next bidder) and **Relanzar subasta** (rerun it).

## Route & access
`/admin/auctions/:id` (`:id` = product uuid, bound via `input.required<string>()`; load runs in `ngOnInit`). Under `adminGuard`.

## Files
- `src/app/admin/auctions/auction-detail.ts` / `.html` / `.scss` — the screen (mirrors raffle-detail's panel/winner/table treatment).
- `src/app/core/catalog/auctions.service.ts` — `get()`, `listBids()` (raw `bids` table under admin RLS), `reassign()`, `relist()`.
- `supabase/migrations/20260718000100_auction_close.sql` — `auction_create_winner_order`, `process_auctions`, `auctions_notify_result` trigger.
- `supabase/migrations/20260719000100_auction_reassign_relist.sql` — `reassign_auction_winner`, `relist_auction`.

## UI anatomy
1. **Header** — back arrow + eyebrow "Subasta" + product name.
2. **Info panel** — thumb + `<dl>`: Estado pill (Activa/Vendida/Sin pujas, + "relanzada ×N"), Cierre (`ends_at` while active, `closed_at` after), Puja inicial (`products.price`), Puja actual (+ "N pujas · M postores"), Incremento mínimo, Anti-sniping ("N min" / "Desactivado"). "Editar subasta" → `/admin/products/:id/edit`.
3. **Winner block** (status `ended`) — amber banner: "Ganador: {winner_name}", email, winning `₡`, "cerrada el …", "· correo enviado" when `notified_at`; link "Ver pedido del ganador →" (`/admin/orders/:winner_order_id`); actions **Cancelar y reasignar** (danger) + **Relanzar subasta** (ghost). Void block shows "La subasta cerró sin pujas elegibles." + Relanzar.
4. **Pujas panel** — subtitle "N puja(s) en la ronda actual · M de rondas anteriores"; table `['bidder','amount','time','state']` with full name + email, `₡amount`, `d/MM/yyyy, HH:mm:ss`, and a state pill: amber "Puja más alta" on the current top live bid, neutral "Ronda anterior" on invalidated rows (row dimmed via `.auction-detail__row--stale`).

## Services & backend
- **Reassign** (`reassign_auction_winner(p_product_id)`): `is_admin()` gate (raises `NOT_AUTHORIZED`); requires `status='ended'` + `winner_order_id` (`NO_WINNER_TO_REASSIGN`); locks the auctions row; cancels the defaulted order **via `cancel_order()`** (restock + coupon release + loyalty reversal — identical to a manual admin cancel; `ALREADY_TERMINAL` tolerated); calls `auction_create_winner_order(p_exclude_user := old winner)` which picks the top live bid excluding the old winner, **skipping banned and deleted accounts**, creates the new pending order + item snapshot + stock decrement + `customer_activity`; then a single auctions UPDATE swaps the winner columns — the `winner_order_id` transition **re-fires `auctions_notify_result`** → the new winner email. No eligible bidder left → winner columns cleared, `status='void'`, returns `{outcome:'void'}`.
- **Relist** (`relist_auction(p_product_id, p_ends_at)`): `is_admin()`; `p_ends_at` must be future (`INVALID_END_DATE`); status must be `ended|void` (`AUCTION_STILL_ACTIVE`); cancels the winner order if present; stamps `invalidated_at` on all live bids (audit kept; public views + `place_bid` minimums reset); resets every live/winner column, `status='active'`, new `ends_at`, `relist_count+1`, `reminder_sent_at=null` (the 30-min reminder re-arms); ensures `products.quantity = 1`. First new bid must meet `starting_price` again.
- Both fire the broadcast trigger, so open storefront tabs flip live.
- UI confirmations: reassign uses `confirm()` including the next bidder's name + amount (computed client-side by `nextBidder()` — server re-checks eligibility) and reminds that banning the deadbeat happens on their customer page; relist uses `prompt()` for the new close ("formato: 2026-07-25 18:00", parsed locally → ISO).

## Gotchas / invariants
- Reassign excludes **only the current winner**; a twice-defaulting bidder must be **banned** (customers screen) or they can win again on the next reassign.
- Stock accounting nets to zero on reassign (cancel restores +1, new order takes −1) and lands on 1 after relist. Verified end-to-end; don't "fix" quantities by hand alongside these RPCs.
- `nextBidder()` in the confirm dialog ignores bans (client doesn't know them); the server pick is authoritative — the dialog is informational.
- The winner email fires from the `winner_order_id` **transition** — writing winner columns in two separate UPDATEs would double-fire; keep the single-UPDATE shape.

## Related docs
- [auctions](./auctions.md) · [customers](./customers.md) (the ban lives there) · [order-detail](./order-detail.md) (payment tracking) · [../storefront/subasta-detail.md](../storefront/subasta-detail.md)
