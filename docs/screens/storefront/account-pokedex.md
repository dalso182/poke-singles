# Account — Pokédex panel & Pokéball redemption

> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose

The customer's Pokédex: the full national dex (~1,025 entries) grouped by region, with owned Pokémon in colour and not-yet-caught ones greyed out. Ownership lives in `profiles.caught_pokemon_numbers` (an `integer[]` on the profile row). The "Capturar más Pokémon" CTA opens the Pokéball redemption modal, where the customer spends Poke-Monedas (loyalty points) on a Pokéball tier that awards N random not-owned Pokémon — the entire economy move runs atomically server-side in the `open_pokeball` SECURITY DEFINER RPC.

## Route & access

- Rendered inside `/account` when the rail's "Mi Pokédex" view is active; deep link `/account/pokedex` (route data `{ initialView: 'pokedex' }`, behind `customerGuard`). Lazily instantiated via `@defer (when view() === 'pokedex')` in `account.html`.
- Reached from: the account rail item "Mi Pokédex", and the header account dropdown's "Canjear" link (`routerLink="/account/pokedex"`).
- Reused read-only by the admin customer detail (`/admin/customers/:id`, Pokédex tab — `src/app/admin/customers/customer-detail.ts` imports `Pokedex` and passes `caughtNumbers` + `tileSize` 75).

## Files

- `src/app/user/account/pokedex/pokedex.ts` — `Pokedex` component (`app-pokedex`): region grouping, ownership filter, scroll-spy, capture CTA.
- `src/app/user/account/pokedex/pokedex.html` — header, region jump bar + filters, per-region grids, back-to-top FAB.
- `src/app/user/account/pokedex/pokedex.scss` — `.pdx__*` styles; grid sized off `--pdx-tile`; tiles use `content-visibility: auto` + `contain-intrinsic-size` so all tiles can render at once cheaply.
- `src/app/user/account/pokedex/pokeball-dialog/pokeball-dialog.ts` — `PokeballDialog` (`app-pokeball-dialog`): choose → open → reveal flow.
- `src/app/user/account/pokedex/pokeball-dialog/pokeball-dialog.html` — the three `@switch (step())` stages.
- `src/app/user/account/pokedex/pokeball-dialog/pokeball-dialog.scss` — `.pbd__*`; CSS-drawn ball art (`.pbd__ball--{key}`), shake/burst animations.
- `src/app/core/pokemon/pokemon.service.ts` — `PokemonService`: national-dex reference data + sprite/portrait URLs; `POKEDEX_REGIONS` constant.
- `src/app/core/loyalty/loyalty.service.ts` — `LoyaltyService.openPokeball()`, shared `balance` signal.
- `src/app/core/auth/profiles.service.ts` — owned set rides on the cached profile (`caught_pokemon_numbers`).
- `src/app/core/settings/app-settings.service.ts` — `AppSettingsService.load()` (60 s TTL cache) supplies `pokeball_tiers`.
- `supabase/migrations/20260630000000_add_caught_pokemon_to_profiles.sql` — adds `profiles.caught_pokemon_numbers integer[] not null default '{}'`.
- `supabase/migrations/20260704000000_pokeball_redemption.sql` — `'redeem'` ledger kind, `app_settings.pokeball_tiers`, column-grant lockdown, `open_pokeball()` RPC.

## UI anatomy

1. Indeterminate `<mat-progress-bar>` while `loading()`.
2. **Header** (`.pdx__head`): `catching_pokemon` icon, title `{{ title() }}` (default "Mi Pokédex"), subtitle "Completa tu colección por región." (hidden in external mode). Right side: overall progress "`{{ progress().total }} / {{ total() }}`" (brand-mono) and — self mode only — the navy CTA "Capturar más Pokémon" (`.pdx__capture`).
3. **Sticky region jump bar** (`.pdx__regions`, `position: sticky; top: 0`, aria-label "Saltar a región"): one `.pdx__region-link` button per non-empty region (Kanto, Johto, Hoenn, Sinnoh, Unova, Kalos, Alola, Galar, Paldea), `.is-active` follows the scroll-spy. Trailing filter group (`.pdx__filters`, aria-label "Filtrar por captura"): "Todos" / "Capturados" / "Faltantes".
4. **Region sections** (`#regionSection`, `id="region-{key}"`, `data-region` attr): header with region label + per-region count "`{{ progress().byRegion.get(r.key) ?? 0 }} / {{ r.list.length }}`"; then `.pdx__grid` of `.pdx__card` tiles (modifier `.pdx__card--locked` when not caught → greyed). Each tile: `.pdx__thumb` (white frame; hidden `.pdx__ph` dex-number placeholder revealed by `onImgError`), lazy `<img class="pdx__img">` from the pokemondb CDN, `#{{ dex(p.number) }}` (zero-padded to 4, e.g. `#0007`), and `{{ p.displayName }}`.
5. **Back-to-top FAB** (`.pdx__top`, fixed bottom-right, aria-label "Volver arriba") once scrolled past 600 px.
6. **Pokéball dialog** (width 720px, maxWidth 95vw, maxHeight 85vh, `autoFocus: 'first-tabbable'`, `restoreFocus: true`), title "Capturar más Pokémon", three steps:
   - **choose**: intro "Canjea tus Poke-Monedas por Pokébolas y captura Pokémon al azar para tu Pokédex.", balance chip "Tienes {{ balance() }} Poke-Monedas" with `assets/images/coin-sm.png`; one `.pbd__tier` card per tier — CSS ball art `.pbd__ball--{{ t.key }}`, `{{ t.label }}`, "Otorga {{ t.award }} Pokémon", cost via `costLabel()` (`"N Poke-Moneda"` singular / `"N Poke-Monedas"` plural), CTA "Canjear" (disabled when unaffordable) and, when unaffordable, the hint `EARN_HINT` = "Ganarás Poke-Monedas con tus compras".
   - **open**: big ball (`.pbd__ball--big`; `.is-shaking` while the RPC is in flight, `.is-bursting` during the 350 ms burst), tier name + cost, button "Abrir" → "Abriendo…" while opening/bursting, link "Volver".
   - **reveal**: "¡Capturaste 1 Pokémon!" or "¡Capturaste N Pokémon!"; awarded sprites (88×88) zoom in staggered `i * 140` ms with name labels. Actions: "Abrir otra" (back to choose) + "Listo" (close). Non-reveal steps show "Cerrar" instead.
   - Error line `.pbd__error` renders `errorMsg()` on the choose/open steps.

## Services & backend

- `PokemonService.list()` — loads `assets/data/pokemon.json` (~105 KB, ~1,025 `Pokemon { number, name, displayName, region }` rows) once per session (signal cache + in-flight dedupe). Pure client-side reference data; the DB only stores ownership.
- `PokemonService.spriteUrl(name)` — `https://img.pokemondb.net/sprites/home/normal/2x/avif/{slug}.avif` (remote CDN; `SPRITE_NAME_OVERRIDES` map is currently empty).
- `ProfilesService.profile()` — the caught set is read reactively from the already-loaded profile; **no extra fetch** for the grid. `PokeballDialog` calls `profiles.getMine()` after a successful open to refresh it.
- `AppSettingsService.load()` — reads the `app_settings` singleton (`id = true`); `pokeball_tiers` is a jsonb array of `PokeballTier { key, label, cost, award }`. Migration default (placeholder economy): poke/"Poké Ball" 1→1, super/"Super Ball" 2→3, ultra/"Ultra Ball" 3→5, master/"Master Ball" 4→10. Tuned by updating the row — no code change.
- `LoyaltyService.openPokeball(tierKey)` — calls RPC `open_pokeball` with `{ p_tier: tierKey }`. Transport errors → `{ ok: false, error: 'RPC_ERROR' }`; on success sets the shared `balance` signal from `new_balance` (header chip + /account hero update instantly).
- **`open_pokeball(p_tier text) returns jsonb`** (SECURITY DEFINER, `search_path = public, pg_temp`, granted to `authenticated`), atomically:
  1. `auth.uid()` null → `{ ok:false, error:'NOT_AUTHENTICATED' }`.
  2. Tier looked up in `app_settings.pokeball_tiers` by `key`; unknown → `UNKNOWN_TIER`.
  3. `SELECT … FOR UPDATE` on the caller's `profiles` row (serializes concurrent opens per user); missing → `NO_PROFILE`.
  4. Balance = `sum(amount)` over `loyalty_transactions` for the user; `< cost` → `INSUFFICIENT_POINTS`.
  5. Picks `award` random numbers from `generate_series(1, 1025)` not already in `caught_pokemon_numbers`; none left → `POKEDEX_COMPLETE` (checked **before** any debit).
  6. Inserts the debit: `loyalty_transactions (user_id, amount = -cost, kind = 'redeem', description = 'Pokébola: ' || label)`.
  7. Appends to `profiles.caught_pokemon_numbers`.
  8. Returns `{ ok: true, awarded: int[], new_balance: balance - cost }`.
- Write-path lockdown (same migration): `UPDATE`/`INSERT` on `profiles` are column-granted to `authenticated` for only `full_name`, `phone`, `default_shipping_address`, `avatar_pokemon_number` (+ `id` on insert) — `caught_pokemon_numbers` is writable only by the RPC (table owner). The `loyalty_transactions_kind_check` constraint allows `('earn','reversal','adjust','redeem')`; customers have no INSERT path on the ledger.

## State & data flow

`Pokedex`:
- Inputs: `caughtNumbers = input<number[] | null>(null)` (non-null → **external mode**: someone else's dex, capture CTA hidden), `title = input('Mi Pokédex')`, `tileSize = input(100)` (bound to host `--pdx-tile` in px via `host: { '[style.--pdx-tile.px]': 'tileSize()' }`).
- Output: `coinsSpent = output<void>()` — emitted when the dialog closes with `true` (≥1 ball opened); `Account.onCoinsSpent()` re-fetches the points history.
- Signals/computeds: `all` (full list), `loading`, `activeRegion` (init `POKEDEX_REGIONS[0].key` = `'kanto'`), `filter` (`'all' | 'owned' | 'missing'`), `showTop`, `total`, `external`, `caught` (Set from the input override else `profiles.profile()?.caught_pokemon_numbers ?? []`), `regions` (grouped + filter-narrowed; empty regions dropped unless filter is `'all'`), `progress` (`{ total, byRegion: Map }`).
- Scroll-spy: constructor `effect` over `viewChildren('regionSection')` re-creates an `IntersectionObserver` (root = closest `mat-sidenav-content`, fallback viewport; `rootMargin: '-20% 0px -70% 0px'`) whenever the section list changes (the filter adds/removes regions). A one-time scroll listener on the same root drives `showTop` (`scrollTop > 600`). Both torn down in `ngOnDestroy`.
- `jumpTo(key)` — `scrollIntoView({ behavior:'smooth' })` on `#region-{key}`; `scrollToTop()` scrolls the root container.
- `openCapture()` — lazy `import('./pokeball-dialog/pokeball-dialog')`, opens the dialog, emits `coinsSpent` if `afterClosed()` resolves truthy.
- `dex(n)` — `padStart(4, '0')`. `onImgError` hides the broken `<img>` and reveals the placeholder (`display:flex`).

`PokeballDialog`:
- Signals: `step` (`'choose' | 'open' | 'reveal'`), `tiers`, `selected`, `loading`, `opening` (RPC in flight — ball shakes), `bursting` (350 ms transition), `awarded: Pokemon[]`, `errorMsg`; `balance` computed from `loyalty.balance() ?? 0`. Private: `openedAny` (the dialog close result), `byNumber` map for dex-number → `Pokemon` lookup.
- `bootstrap()`: `Promise.all` of `settings.load()`, `pokemon.list()`, `loyalty.ensureLoaded().catch(() => 0)`; failure → "No pudimos cargar las Pokébolas. Intenta de nuevo."
- `choose(tier)` guards affordability; `open()` calls `loyalty.openPokeball(tier.key)`:
  - Business errors map through `ERROR_MESSAGES`: `INSUFFICIENT_POINTS` → "No tienes suficientes Poke-Monedas.", `POKEDEX_COMPLETE` → "¡Felicidades, ya completaste tu Pokédex!"; anything else → "Algo salió mal al abrir la Pokébola. No se descontaron Poke-Monedas." On `INSUFFICIENT_POINTS` it also `loyalty.refresh()`es (a raced spend elsewhere may have changed the balance).
  - Success: maps `result.awarded` through `byNumber` (fallback stub `{ number: n, name: String(n), displayName: '#'+n, region: '' }`), fire-and-forget `profiles.getMine()` (lights up the grid behind the dialog), 350 ms burst → `step 'reveal'`.
- `close()` → `dialogRef.close(openedAny)`.

## Behaviors & edge cases

- All ~1,025 tiles render at once (no pagination); cheap because images are natively `loading="lazy"` and tiles are `content-visibility: auto` (`contain-intrinsic-size: auto calc(var(--pdx-tile,100px) + 50px)`).
- Filter "Capturados"/"Faltantes" drops regions left empty, so the jump bar shrinks accordingly; "Todos" keeps every region even if a count is 0/N.
- External/admin mode (`caughtNumbers` set): subtitle and capture CTA hidden; everything read-only; ownership never touches the signed-in profile.
- Near-complete dex: when fewer than `award` Pokémon remain, the remainder is awarded at full cost (explicit SQL comment: acceptable edge). A fully complete dex returns `POKEDEX_COMPLETE` **before** debiting — no charge.
- Concurrency: the `FOR UPDATE` profile lock serializes two simultaneous opens by the same user, so both can't pass the balance check or double-award.
- "Abrir otra" loops back to the choose step with the fresh balance; `openedAny` stays true so the account page still refreshes its history on close.
- Missing sprite artwork: grid tiles fall back to the dex-number placeholder; reveal cards just hide the image (`visibility: hidden`), keeping the name.

## Gotchas / invariants

- **`caught_pokemon_numbers` is server-only by column grants**, not RLS — any future client-editable `profiles` column must be appended to the GRANT lists in `20260704000000_pokeball_redemption.sql` or client saves will 403.
- **The RPC's dex universe is hard-coded `generate_series(1, 1025)`** (matching the `avatar_pokemon_number` check constraint), independent of `assets/data/pokemon.json`. If the JSON and the range ever diverge, awards can reference Pokémon the UI can't name — the dialog then shows the `#N` stub with an empty `region`, which no region section will ever display in the grid.
- **Tier data is trusted from `app_settings.pokeball_tiers`** on both sides — UI display and RPC enforcement read the same row, so there's no client/server price drift, but bad jsonb (missing `cost`/`award`) would break the RPC cast (`::int`).
- Balance is **derived** (SUM of ledger), never cached server-side — `INSUFFICIENT_POINTS` can occur even when the UI showed an affordable tier if another session spent first; the dialog handles this by refreshing.
- The grid update after an open is **fire-and-forget** (`void profiles.getMine()`); the reveal shows instantly, the dex tiles behind may light up a beat later.
- Scroll-spy roots against the closest `mat-sidenav-content` — if the UserShell markup changes, the observer silently falls back to the viewport (may mis-highlight).
- The scroll listener binds once (`scrollBound`) inside a reactive effect — safe, but it never rebinds if the scroll root element itself is replaced.
- The account page loads points history independently; only `coinsSpent` keeps it consistent after redemptions (see [account.md](./account.md)).
- Ball artwork is CSS-drawn placeholder (`.pbd__ball--{key}` classes keyed by tier key: `poke`, `super`, `ultra`, `master`); template comment says to swap for `<img>` when artwork lands — new tier keys added in DB get no art class until SCSS follows.

## Related docs

- [account.md](./account.md) — host page, rail, points panel that consumes `coinsSpent`.
- [shell-header-footer.md](./shell-header-footer.md) — header "Canjear" deep link and Poke-Coins chip fed by the same `balance` signal.
- [../../architecture/loyalty-and-pokedex.md](../../architecture/loyalty-and-pokedex.md) — full loyalty economy (earn/reversal side).
- [../../architecture/backend-rpcs-and-functions.md](../../architecture/backend-rpcs-and-functions.md) — `open_pokeball` alongside the other RPCs.
- [../../architecture/data-model.md](../../architecture/data-model.md) — `profiles`, `loyalty_transactions`, `app_settings`.
- [../admin/customer-detail.md](../admin/customer-detail.md) — the admin reuse of this component.
