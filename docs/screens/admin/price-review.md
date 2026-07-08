# Admin — Price review (Revisión de precios)

> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose

Card-by-card triage of products whose store price (CRC) has drifted from the TCGplayer market price (USD × configured exchange rate). Scope: **active singles in NM condition with a `card_ref` and price ≥ the configured floor** (the screen states it verbatim: `"Solo cartas singles en NM (Near Mint)"`). Two runners populate the same `price_reviews` queue through the same RPC (`admin_record_price_check`):

1. **Weekly cron** — pg_cron job `price-check-weekly` → `price-check` Edge Function.
2. **Manual run** — the "Ejecutar revisión ahora" button, which runs entirely **in the browser** (`ReportsService.runPriceReviewNow`), *not* via the Edge Function.

The admin then reviews one card at a time (highest |deviation| first): **Aceptar** commits a new price (editable, pre-filled with the suggestion) or **Ignorar** hides the card until the next run re-flags it.

## Route & access

- **Path:** `/admin/price-review` (child of the lazy `AdminShell` route; `canActivate: [adminGuard]` + `canActivateChild: [adminGuard]` on the parent `admin` route in `src/app/app.routes.ts`).
- **Sidenav:** group "Herramientas" → item `Revisión de precios` (icon `price_check`), no count badge.
- **Query params:** none.

## Files

| File | Role |
|---|---|
| `src/app/admin/price-review/price-review.ts` | `PriceReview` component (`selector: 'app-admin-price-review'`) — phases, triage handlers, run options |
| `src/app/admin/price-review/price-review.html` | Header/progress, last-run line, options panel, triage card, empty state |
| `src/app/admin/price-review/price-review.scss` | BEM styles under `.price-review__*` |
| `src/app/core/reports/reports.service.ts` | `ReportsService` — `priceReviewSummary/Next/Ignore/Accept/QualifyingCount`, `runPriceReviewNow`, `processConcurrent` |
| `src/app/core/catalog/tcgplayer-pricing.ts` | Pure helpers `firstTcgplayerVariant`, `tcgplayerMarketUsd`, `tcgplayerUpdatedAt` (shared with add-product) |
| `src/app/core/catalog/catalog.types.ts` | `PriceReviewCard`, `PriceReviewSummary`, `PriceReviewProgress` |
| `supabase/functions/price-check/index.ts` | Edge Function — cron runner (batched, self-chaining) |
| `supabase/config.toml` | `[functions.price-check] verify_jwt = false` (pg_net calls without a session JWT) |
| `supabase/migrations/20260525003500_price_review.sql` | Core: `app_settings` columns, `price_reviews`, `price_check_runs`, `products.price_checked_at`, all RPCs |
| `supabase/migrations/20260525003600_price_review_cron.sql` | pg_cron schedule `price-check-weekly` (`'0 10 * * 1'` = Monday 10:00 UTC / 04:00 CR) via pg_net + Vault secrets |
| `supabase/migrations/20260525003700_price_review_clear_on_start.sql` | `admin_price_review_start` wipes prior queue + run rows (clean-snapshot semantics) |
| `supabase/migrations/20260525003800_price_review_tcgplayer_product_id.sql` | Snapshots `tcgplayer_product_id` for the deep link (re-creates `admin_record_price_check` + `admin_price_review_next`) |
| `supabase/migrations/20260525003900_price_review_start_safedelete.sql` | `delete from price_reviews where true` — pg-safeupdate appeasement |

## UI anatomy

1. `<app-page-header>` — `kicker="Operaciones"`, `title="Revisión de precios"`, `sub` = `"{pending_count} carta(s) por revisar"` (or `"Cargando…"`). Header slot switches on `phase()`:
   - `running` → live chip (`aria-live="polite"`): spinner icon `autorenew` + `"{scanned} / {total} · {flagged} marcadas"`.
   - `configuring` → nothing (the panel owns the actions).
   - default → `<app-btn variant="primary">` icon `refresh`, `"Ejecutar revisión ahora"`.
2. **Last-run line** (when `summary().last_run_started`): `"Última ejecución: {formatted}"`, `" (automática)"` when `last_run_trigger === 'cron'`, plus `"· N escaneadas / N con precio / N marcadas"`.
3. Scope note: `"Solo cartas singles en NM (Near Mint)"` (`.price-review__scope`).
4. **Options panel** (`.price-review__options`, `phase() === 'configuring'`): heading `"Opciones de esta revisión"` + note that values are one-run-only (`"…la configuración guardada en /admin/config no cambia."`). Fields: `Umbral de desviación` (`thresholdCtrl`, number, suffix `%`, min 0.01 / max 100 / step 0.5) and `Piso de valor` (`floorCtrl`, number, prefix `₡`, min 0 / step 500). Live hint: `"Calculando cartas a revisar…"` → `"{N} cartas singles en NM serán revisadas con este piso"`. Actions: `Cancelar` (ghost) and `Iniciar revisión` (primary, icon `play_arrow`, disabled when either control invalid or `qualifyingCount() === 0`).
5. **Triage card** (`.price-review__card`, when `current()` exists): left `<app-thumb [size]="225">` (card image + language badge); right column —
   - identity: name, set name, meta row `card_number · variant · condition · language`;
   - facts: `Tu precio` (`<app-money>`), `Mercado (TCGplayer)` (`<app-money>` CRC + `${usd}` + external-link icon `open_in_new` with tooltip `"Ver en TCGplayer"` or `"Buscar en TCGplayer"`, plus `"al {date}"` staleness label when `market_updated_at` exists), `Diferencia` (signed `₡` delta + `<app-pill [dot]="true">` — tone `red` when over market, `amber` when under, title `"sobre el mercado"` / `"bajo el mercado"`);
   - commit row: `Precio sugerido` field (`priceCtrl`, prefix `₡`, min 1 / step 100, pre-filled with `suggested_price`) + `Ignorar` (ghost, icon `visibility_off`) + `Aceptar` (primary, icon `check`).
6. Progress counter under the card: `"Revisando carta {X} de {Y}"` (`progressLabel()`).
7. **Empty state** (icon `verified`): `"Todas las cartas están dentro del rango"` — with either `"Aún no se ha ejecutado una revisión. Hacé clic en Ejecutar revisión ahora arriba para empezar."` (no run yet) or `"No hay cartas que revisar en este momento. La próxima revisión semanal se ejecutará automáticamente."`.

Component providers pin `MAT_FORM_FIELD_DEFAULT_OPTIONS` to `{ floatLabel: 'always' }` — zoneless app, async `patchValue()` doesn't notify CD, so labels would otherwise overlap prefilled values.

## Services & backend

`ReportsService` methods (all through `SupabaseService.client`):

- `priceReviewSummary()` → RPC `admin_price_review_summary` — `pending_count` (rows where `ignored_at is null or ignored_at < checked_at`), `total_flagged`, and the latest `price_check_runs` row (returns one row even with zero runs).
- `priceReviewNext()` → RPC `admin_price_review_next` — the single next card: `price_reviews` joined to `products` + `sets`, filtered by the same pending predicate, ordered `abs(diff_pct) desc, checked_at asc`, `limit 1`. Includes `tcgplayer_product_id` since migration `…3800`.
- `priceReviewIgnore(productId)` → RPC `admin_price_review_ignore` — sets `ignored_at = now()`.
- `priceReviewAccept(productId, newPrice)` → RPC `admin_price_review_accept` — `update products set price = p_new_price` + deletes the review row; rejects `p_new_price <= 0` with `INVALID_PRICE`. The new price may still be out of band — the next run simply re-flags.
- `priceReviewQualifyingCount(floor)` — head-count of `products` with `active = true`, `card_ref not null`, `condition = 'NM'`, `category_id = <singles>`, `price >= floor`.
- `runPriceReviewNow(progress?, overrides?)` — the browser runner: checks `price_review_enabled` (throws `'PRICE_REVIEW_DISABLED'`) and `exchange_rate_usd_crc > 0` (throws `'NO_EXCHANGE_RATE'`); resolves threshold/floor from `overrides` else persisted settings; counts qualifying rows as the loop bound; RPC `admin_price_review_start({ p_trigger: 'manual' })`; then loops pages of 50 ordered `price_checked_at` asc NULLS FIRST — always `range(0, 49)` because each processed row's cursor bump sinks it to the end. Per card (concurrency 4 via `processConcurrent`): TCGdex SDK fetch (`this.tcgdex.client.fetch('cards', card_ref)`), extract USD/updated/productId via `tcgplayer-pricing.ts` helpers, then RPC `admin_record_price_check`. Termination guards: `maxIterations = ceil(total/50) + 2` and a `seen` id set. Finishes with `admin_price_review_finish` (even on error, passing `p_error`).

Edge Function `price-check` (`supabase/functions/price-check/index.ts`):

- `POST { trigger: 'cron' | 'manual', run_id?, batch_size? }`; batch size default 200 (clamped 1–500). Uses `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
- Gates: `price_review_enabled` (`{ skipped: 'disabled' }`) and exchange rate (`{ skipped: 'no_exchange_rate' }`). Always uses **persisted** settings — no overrides on the cron path.
- Starts a run only when `run_id` is absent; **self-chains** by POSTing its own URL with the same `run_id` while batches come back full, accumulating counters onto the `price_check_runs` row so the sweep reads as one logical run. Duplicates the pricing helpers by hand (`"Mirrors src/app/core/catalog/tcgplayer-pricing.ts — kept in sync by hand."`) and fetches cards from `https://api.tcgdex.net/v2/en/cards/<ref>` REST (concurrency 4).

Database (migrations `…3500`–`…3900`):

- `app_settings` gains `price_review_threshold_pct numeric(5,2) default 10.00` (0 < x ≤ 100), `price_review_floor_crc numeric(12,2) default 5000.00` (≥ 0), `price_review_enabled boolean default true` — all editable in `/admin/config` under the `"Revisión de precios"` form section (`price_review_enabled` toggle `"Activar revisión semanal"`, `Umbral de desviación`, `Piso de valor`).
- `price_reviews` (pk `product_id`, FK cascade): snapshots `card_ref`, `store_price`, `market_usd`, `exchange_rate`, `market_crc` (= usd × rate, 2dp), `suggested_price` (= `ceil(market_crc / 100) * 100`, same rule as add-product), signed `diff_pct`, `market_updated_at`, `tcgplayer_product_id`, `checked_at`, `ignored_at`. Index on `abs(diff_pct) desc`. RLS admin-only (`price_reviews_admin_all`) — the table leaks the store's whole pricing position, customers must never read it.
- `price_check_runs`: audit rows (`trigger in ('manual','cron')`, `scanned_count`, `priced_count`, `flagged_count`, `error`, `started_at`/`finished_at`). Admin-only RLS.
- `products.price_checked_at timestamptz` + partial index (`nulls first` where `active and card_ref is not null`) — the sweep cursor.
- RPCs (all `security definer` with an explicit `is_admin()` guard raising `NOT_AUTHORIZED`; granted to `authenticated`): `admin_record_price_check(p_product_id, p_store_price, p_market_usd, p_exchange_rate, p_threshold_pct, p_market_updated_at, p_tcgplayer_product_id default null)` returns whether flagged — upserts on flag (`ignored_at = null` — a fresh check un-ignores), deletes on in-band or no-signal (`market_crc <= 0`), and always bumps `price_checked_at`; `admin_price_review_start(p_trigger)` — inserts the run row then **wipes** `price_reviews` (`where true` for pg-safeupdate) and all other `price_check_runs` rows; `admin_price_review_finish(run_id, scanned, priced, flagged, error)`; `admin_price_review_summary()`; `admin_price_review_next()`; `admin_price_review_ignore(product_id)`; `admin_price_review_accept(product_id, new_price)`.
- Cron (`…3600`): `select cron.schedule('price-check-weekly', '0 10 * * 1', …)` — Monday 04:00 Costa Rica. The job body re-checks `app_settings.price_review_enabled` (flipping it off disables the cron without unscheduling), reads Vault secrets `price_check_url` + `supabase_anon_key`, and fires `net.http_post` with body `{"trigger": "cron"}`; every failure is swallowed (next week retries).

## State & data flow

Signals on `PriceReview`: `summary`, `current`, `loading`, `acting` (accept/ignore in flight), `phase = signal<RunPhase>('idle')` (`'idle' | 'configuring' | 'running'`), `progress = signal<PriceReviewProgress | null>`, `batchTotal` (anchors the `"X de Y"` denominator so it doesn't shrink mid-triage), `floorValue`, `qualifyingCount`. Free-standing `FormControl`s (no FormGroup): `thresholdCtrl`, `floorCtrl`, `priceCtrl`.

Computeds: `diffLabel` (`"+12.3%"` style, minus sign is U+2212 `−`), `direction` (`'over' | 'under' | 'flat'`), `directionLabel`, `diffCrcLabel` (signed `₡` delta, `es-CR` formatting), `progressLabel` (`"Revisando carta {position} de {total}"` where `position = total - pending + 1`, clamped), `tcgplayerLink` — deep link `https://www.tcgplayer.com/product/{tcgplayer_product_id}` when the id was snapshotted, else a search URL `https://www.tcgplayer.com/search/pokemon/product?q={name card_number set_name}` (TCGdex sometimes has market pricing but no productId, especially e-card era).

Flow:

- Constructor: subscribes `floorCtrl.valueChanges` → `floorValue`; an `effect` on the 250 ms-debounced `floorDebounced` (via `toSignal(toObservable(...))`) refreshes `qualifyingCount` **only while `phase() === 'configuring'`**, with a stale-result guard; then `refreshAll()`.
- `refreshAll()`: parallel `priceReviewSummary()` + `priceReviewNext()`; pre-fills `priceCtrl` with `suggested_price` (`emitEvent: false`, marked pristine); `batchTotal` set on first non-empty queue or when the queue grows beyond the prior total, cleared at 0.
- `onOpenOptions()`: loads settings (defaults threshold 10 / floor 5000 if unreadable); blocks with snackbars `"La revisión de precios está desactivada en /admin/config."` or `"Falta configurar el tipo de cambio en /admin/config antes de revisar precios."`; pre-fills controls; `phase = 'configuring'`.
- `onStartRun()`: validates, builds `{ threshold_pct, floor_crc }` overrides, `phase = 'running'`, resets `batchTotal`, awaits `runPriceReviewNow(this.progress, overrides)`; success snackbar `` `Revisión completada: ${flagged} cartas marcadas de ${scanned} revisadas` ``; finally `phase = 'idle'`.
- `onAccept()` / `onIgnore()`: guard `acting`, call the RPC wrapper, `refreshAll()` pulls the next card. Accept snackbar: `"Precio actualizado"` (2500 ms).
- `errorMessage()` maps `NO_EXCHANGE_RATE` / `PRICE_REVIEW_DISABLED` to the Spanish messages above; fallback `"Error desconocido"`.

## Behaviors & edge cases

- **Ignore re-surface rule:** a row is hidden when `ignored_at >= checked_at`; the pending predicate everywhere is `ignored_at is null or ignored_at < checked_at`. The next run's upsert writes `ignored_at = null` + fresh `checked_at`, so a still-out-of-band card naturally re-surfaces. There is no separate ignored table. (With `…3700`'s clean-snapshot wipe, `ignored_at < checked_at` can no longer actually occur — every run starts from an empty table — but the predicate is kept as a defensive invariant.)
- **Clean-snapshot runs:** `admin_price_review_start` deletes all `price_reviews` and all other `price_check_runs` rows. Only the latest run's data ever exists; ignores do not persist across runs.
- **Manual options are one-run-only** — the panel values never write to `app_settings`; the cron always uses persisted settings.
- **Both runners converge on `admin_record_price_check`**, so the queue is identical regardless of trigger; cards without TCGplayer pricing pass `usd = 0` and are treated as "no signal" (row deleted, cursor bumped, counted in `scanned` but not `priced`).
- Manual run in the browser: closing the tab mid-run abandons the sweep — the run row keeps no `finished_at`; the next run (manual or cron) starts fresh and wipes it.
- Edge Function self-chain heuristic: continues while `batch.length === batchSize`; a chain failure is logged and dropped (`finished_at` stays null).
- Suggested price rounds market CRC **up** to the nearest ₡100; the admin can accept any positive value, including one still outside the band.
- Accept persists to `products.price` only — it does not touch `sale_price`.
- `qualifyingCount() === 0` disables `Iniciar revisión`; the count query and the runner use exactly the same filter, so `scanned` matches the preview.

## Gotchas / invariants

- **CLAUDE.md drift:** the always-on route list doesn't mention `price-review` (it names "reports, config" only) and the original migration comment says the queue feeds `/admin/reports` — the surface has since moved to its own top-level route `/admin/price-review` under the "Herramientas" nav group.
- The Edge Function **duplicates** `tcgplayer-pricing.ts` by hand (Deno can't import the Angular tree). If you change variant selection (currently: first non-`updated`/`unit` key — per-variant matching is explicitly out of scope), change **both** copies.
- `verify_jwt = false` on `price-check` + service-role client inside: the function is unauthenticated by design (pg_net has no session). Do not add admin checks that assume a user JWT; conversely, do not expose new mutations through it casually.
- Cron prerequisites live in **Vault**, not migrations: secrets `price_check_url` and `supabase_anon_key` must exist or the job silently does nothing (all failures swallowed).
- All RPCs raise `NOT_AUTHORIZED` unless `is_admin()`; `price_reviews` / `price_check_runs` RLS is admin-only — never loosen, the data reveals the store's full pricing position.
- The browser runner's cursor trick (always `range(0, 49)`, rely on `price_checked_at` bumps to rotate rows out) breaks if `admin_record_price_check` ever stops bumping the cursor on every path — all three exit paths currently do.
- `run_id` returned by `runPriceReviewNow` comes straight from the `admin_price_review_start` RPC; the run row may be deleted by the *next* run's wipe, so never persist it client-side.
- The `"X de Y"` progress label is an approximation anchored to `batchTotal`; accepting/ignoring shrinks `pending_count` but the denominator intentionally stays fixed for the batch.

## Related docs

- [Config (threshold / floor / enabled + exchange rate)](./config.md)
- [Add product (same suggested-price rounding + pricing helpers)](./add-product.md)
- [Reports](./reports.md) — sibling ReportsService consumers
- [Admin shell & nav](./admin-shell.md)
- [Backend RPCs & functions](../../architecture/backend-rpcs-and-functions.md) · [Data model](../../architecture/data-model.md) · [Environments & deploy (edge functions)](../../architecture/environments-and-deploy.md)
