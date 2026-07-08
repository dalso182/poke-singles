# Loyalty & Pokédex

> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose

Documents the loyalty-coin economy ("Poke-Monedas" / "Poke-Coins") and the Pokédex gamification layer built on top of it: how coins are earned (paid orders), reversed (cancellations), spent (Pokéball redemption), how the caught-Pokémon collection and avatar live on `profiles`, where the client-side Pokémon reference data comes from, and the admin surfaces that expose all of it.

## Scope

- **In scope:** `loyalty_transactions` ledger + earn/reversal trigger, `LoyaltyService` (current on-disk state — file has uncommitted changes), header coins chip, `/account/puntos` panel, `/account/pokedex` + Pokéball dialog, `open_pokeball` RPC, `profiles.caught_pokemon_numbers` / `avatar_pokemon_number`, `PokemonService` + `scripts/fetch-pokemon-data.mjs`, admin customer loyalty/Pokédex tabs and the dashboard leaderboard.
- **Out of scope:** how an order becomes `paid` (→ [commerce-flow.md](./commerce-flow.md)), general profile/auth plumbing (→ [auth-and-roles.md](./auth-and-roles.md)).

## Key files

| Layer | File |
|---|---|
| Ledger schema + earn trigger + admin report | `supabase/migrations/20260528000000_loyalty_points.sql` |
| Redemption (`redeem` kind, tiers, `open_pokeball`) | `supabase/migrations/20260704000000_pokeball_redemption.sql` |
| Collection column | `supabase/migrations/20260630000000_add_caught_pokemon_to_profiles.sql` |
| Avatar column | `supabase/migrations/20260610000000_add_avatar_to_profiles.sql` |
| Admin customer loyalty | `supabase/migrations/20260704110000_admin_customer_loyalty.sql` |
| Admin customer Pokédex | `supabase/migrations/20260704120000_admin_customer_pokedex.sql` |
| Admin leaderboard | `supabase/migrations/20260704130000_admin_pokedex_leaderboard.sql` |
| Balance/history/spend service | `src/app/core/loyalty/loyalty.service.ts` *(uncommitted changes on disk)* |
| Pokémon reference data service | `src/app/core/pokemon/pokemon.service.ts` |
| Reference-data generator | `scripts/fetch-pokemon-data.mjs` → `src/assets/data/pokemon.json` |
| Header coins chip | `src/app/user/header/header.ts` / `header.html` |
| Account panels | `src/app/user/account/account.ts` (views `puntos`, `pokedex`) |
| Pokédex component | `src/app/user/account/pokedex/pokedex.ts` |
| Pokéball dialog | `src/app/user/account/pokedex/pokeball-dialog/pokeball-dialog.ts` |
| Avatar picker | `src/app/user/account/avatar-picker/` (`avatar-picker.service.ts`, `avatar-picker-dialog.ts`) |
| Types | `src/app/core/catalog/catalog.types.ts` (`LoyaltyTransactionRow`, `PokeballTier`, `PokeballOpenResult`) |

## How it works

### The ledger: `loyalty_transactions`

`20260528000000_loyalty_points.sql` creates:

```
loyalty_transactions (
  id uuid PK, user_id uuid NOT NULL → auth.users ON DELETE CASCADE,
  order_id uuid → orders ON DELETE SET NULL,
  amount integer NOT NULL,           -- + earned, − reversed/redeemed
  kind text CHECK IN ('earn','reversal','adjust','redeem'),  -- 'redeem' added 20260704000000
  description text, created_at timestamptz
)
```

The **balance is always `SUM(amount)`** — derived, never cached server-side, and may legitimately go negative (a reversal after the points were already spent). RLS: `loyalty_self_read` (customers read own rows), `loyalty_admin_all`. There is **no customer INSERT/UPDATE path** — only the SECURITY DEFINER trigger and the `open_pokeball` RPC write rows.

Settings on the `app_settings` singleton (`id = true`): `loyalty_enabled boolean NOT NULL DEFAULT false` and `loyalty_colones_per_point numeric(12,2) NOT NULL DEFAULT 1000` (colones of net merchandise per point). Both editable from `/admin/config` (`src/app/admin/config/config.ts`).

### Earning: a trigger on `orders.status`, not part of `place_order`

The trigger **`orders_loyalty_points`** (AFTER UPDATE OF `status` ON `orders` → `award_or_reverse_loyalty_points()`) covers both paths; `place_order` itself never touches the ledger:

- **Award** — first transition into `'paid'`: requires `loyalty_enabled`, `orders.user_id` not null (guests skipped), and no prior `'earn'` row for the order. Points = `floor(greatest(subtotal − discount_amount, 0) / loyalty_colones_per_point)` (shipping excluded); rows get description `'Compra #<order_number>'`.
- **Reversal** — first transition into `'cancelled'`: claws back exactly the summed `'earn'` amount as a negative `'reversal'` row (`'Cancelación #<order_number>'`). Runs **regardless of `loyalty_enabled`** and regardless of current balance; once only.

`'adjust'` is reserved for manual fixes (no code writes it today).

### `LoyaltyService` (on-disk state)

`src/app/core/loyalty/loyalty.service.ts` exposes a **shared session-scoped balance signal** so the header chip, `/account`, and the Pokéball modal stay in sync without re-fetching:

- `balance: Signal<number | null>` — `null` = signed out / not yet loaded. A constructor `effect` clears it on sign-out.
- `ensureLoaded()` — load-once; `refresh()` — forced re-fetch with in-flight de-duplication (`inflight` promise).
- `getMyBalance()` — selects `amount` from `loyalty_transactions` (RLS-scoped) and sums client-side.
- `getMyHistory({limit=20, offset, from, to})` — paged newest-first with exact `count`, optional inclusive ISO timestamp bounds; powers the /account history + "Cargar más".
- `openPokeball(tierKey)` — calls RPC `open_pokeball({p_tier})`; transport errors → `{ok:false, error:'RPC_ERROR'}`; on success updates the shared signal from the RPC's `new_balance`.

### Spending: `open_pokeball` RPC

`20260704000000_pokeball_redemption.sql`. Tier economy lives in **`app_settings.pokeball_tiers`** (jsonb, public-read singleton so UI and server can't drift). Defaults:

| key | label | cost | award |
|---|---|---|---|
| `poke` | Poké Ball | 1 | 1 |
| `super` | Super Ball | 2 | 3 |
| `ultra` | Ultra Ball | 3 | 5 |
| `master` | Master Ball | 4 | 10 |

`open_pokeball(p_tier text)` (SECURITY DEFINER, granted to `authenticated`) atomically: validates auth (`NOT_AUTHENTICATED`) and tier (`UNKNOWN_TIER`) → **locks the caller's `profiles` row `FOR UPDATE`** (serializes concurrent opens per user — no double-spend) (`NO_PROFILE`) → checks `SUM(amount) >= cost` (`INSUFFICIENT_POINTS`) → picks `award` random dex numbers from `generate_series(1, 1025)` not already in `caught_pokemon_numbers` (`POKEDEX_COMPLETE` if none remain; a near-complete dex may award fewer than `award` at full cost) → inserts a negative `'redeem'` ledger row (description `'Pokébola: <label>'`) → appends to `profiles.caught_pokemon_numbers`. Returns `{ok:true, awarded:[…], new_balance}`.

The same migration **locks down direct profile writes**: it revokes table-level UPDATE/INSERT on `profiles` from `authenticated` and re-grants only the columns `(full_name, phone, default_shipping_address, avatar_pokemon_number)` (+ `id` on INSERT) — so a customer can no longer PATCH `caught_pokemon_numbers` via REST. **Any future client-editable profile column must be added to those grant lists** or the storefront's profile save will 403.

### The collection and the avatar on `profiles`

- `caught_pokemon_numbers integer[] NOT NULL DEFAULT '{}'` (`20260630000000`) — plain array of national-dex numbers; rides along with the profile fetch (`ProfilesService` selects `*`), zero extra queries. The migration's comment says writes go through `profiles_self_update`, but that was **superseded** by the 20260704000000 column-grant lockdown: only `open_pokeball` writes it now.
- `avatar_pokemon_number integer CHECK (between 1 and 1025, or null)` (`20260610000000`) — the customer's chosen avatar species, picked in the avatar dialog (`AvatarPickerService.openAndSave()` from `/account`); still client-writable (it's in the grant list).

### Pokémon reference data (client-side, not a table)

- **`scripts/fetch-pokemon-data.mjs`** (run manually: `node scripts/fetch-pokemon-data.mjs`, no npm alias) makes 9 requests to PokeAPI v2 (`https://pokeapi.co/api/v2/generation/1..9`) and writes **`src/assets/data/pokemon.json`** (~1,025 entries of `{number, name, displayName, region}`; slugs like `mr-mime` get human names via a `SPECIAL_NAMES` map).
- **`PokemonService`** (`src/app/core/pokemon/pokemon.service.ts`) lazy-loads and caches that JSON (`list()`), and builds image URLs:
  - `spriteUrl(name)` — Pokémon HOME sprites from the **remote** CDN `https://img.pokemondb.net/sprites/home/normal/2x/avif/<slug>.avif` (reference art may be hotlinked, unlike product imagery).
  - `portraitUrl(n, mood)` — **TEMP remote** PMDCollab SpriteCollab portraits (`https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/portrait/<0-padded-4-digit-id>/[0000/0001/]<Emotion>.png`); the code comment says revert to `assets/images/avatars/${n}.png` for self-hosted art.
  - `POKEDEX_REGIONS` (kanto…paldea) drives the Pokédex jump-nav; `avatarMoodForTotal(total)` maps the cart total to a portrait emotion (`Normal` <₡5,000, `Happy` <₡20,000, `Joyous` <₡50,000, shiny `Joyous` above) with fallback chains (`portraitMoodChain`) and playful Spanish hover copy (`avatarMoodMessage`: "¡Pura vida! ¿Armamos el carrito?", "¡Qué chiva lo que llevás!", "Uffff!!, carrito de miedo 🔥", "¡Este carrito brilla como yo, mae! ✨"). `DEFAULT_AVATAR_NUMBER = 6` (Charizard).

### Storefront surfaces

- **Header coins chip** (`src/app/user/header/`): the account dropdown shows a "Poke-Coins" row — `points()` computed from `loyalty.balance() ?? 0`, loaded fire-and-forget via `ensureLoaded()`. Two sibling links: the balance → `/account/puntos`, a "Canjear" link → `/account/pokedex`.
- **`/account` panels** (`src/app/user/account/account.ts`): one component with an `AccountView` union `'datos' | 'direccion' | 'pedidos' | 'puntos' | 'pokedex'`; deep-link routes `/account/puntos` and `/account/pokedex` set `initialView` via route data (see `src/app/app.routes.ts`, all behind `customerGuard`). The **Puntos** panel shows the balance plus a paged `getMyHistory()` list (`POINTS_PAGE_SIZE`), labelling rows by `description` or kind fallback: `'earn'` → "Puntos ganados", `'reversal'` → "Puntos revertidos", `'adjust'` → "Ajuste", `'redeem'` → "Poke-Monedas canjeadas". See [account.md](../screens/storefront/account.md).
- **Pokédex view** (`src/app/user/account/pokedex/pokedex.ts`): the full national dex grouped by region, owned Pokémon in colour, others greyed; ~1,025 tiles rendered at once (native lazy `<img>` + `content-visibility: auto`). Ownership reads the already-loaded profile. Emits `coinsSpent` after the Pokéball modal opened ≥1 ball so the account page refreshes the Puntos history. Inputs `caughtNumbers` (external ownership → admin view-someone-else mode, capture CTA hidden) and `tileSize` (75px admin vs 100px storefront). See [account-pokedex.md](../screens/storefront/account-pokedex.md).
- **Pokéball dialog** (`pokeball-dialog.ts`): three steps (`choose` → `open` → `reveal`), tiers from `AppSettingsService` (`app_settings.pokeball_tiers`), spend via `LoyaltyService.openPokeball()`. Spanish error copy: `INSUFFICIENT_POINTS` → "No tienes suficientes Poke-Monedas.", `POKEDEX_COMPLETE` → "¡Felicidades, ya completaste tu Pokédex!"; unaffordable-tier hint: "Ganarás Poke-Monedas con tus compras". Closes with `true` when ≥1 ball was opened.

### Admin surfaces

- **`admin_customer(p_id uuid)`** (jsonb, is_admin-guarded) — extended twice: `20260704110000` adds `loyalty_balance` (SUM, coalesced to 0) and `loyalty_transactions` (100 most recent rows, exact `LoyaltyTransactionRow` shape so the storefront type is reused); `20260704120000` adds `caught_pokemon_numbers` (`to_jsonb(p.caught_pokemon_numbers)`). Powers the loyalty + Pokédex tabs on `/admin/customers/:id` — the Pokédex tab reuses the storefront `Pokedex` component in `caughtNumbers` mode. See [customer-detail.md](../screens/admin/customer-detail.md).
- **`admin_pokedex_leaderboard(p_limit int default 10)`** (`20260704130000`) — top customers by `cardinality(caught_pokemon_numbers)`, empty dexes excluded, ties broken by earliest `profiles.created_at`; returns `(id, full_name, email, caught_count)`. Feeds the dashboard "Top Pokédex" panel ([dashboard.md](../screens/admin/dashboard.md)).
- **`admin_loyalty_transactions_report(p_search, p_date_start, p_date_end, p_limit=50, p_offset=0, p_sort='created'|'amount')`** (`20260528000000`) — every ledger row with customer + order context, window `total_count` for pagination, date filtering in `America/Costa_Rica` local dates. Consumed via `ReportsService` on `/admin/reports`.

## Contracts & conventions

- **Balance = `SUM(loyalty_transactions.amount)`**, computed wherever needed (client reduce, RPC `sum()`); it is never stored, and negative balances are by design.
- **Ledger writes:** trigger only (`earn`/`reversal`), `open_pokeball` only (`redeem`); `adjust` reserved for manual SQL. Customers have zero write grants on the table.
- **`user_id` is NOT NULL** on the ledger — no guest loyalty, and (unlike orders) admin lookups have no email fallback.
- **Tier economy single source of truth:** `app_settings.pokeball_tiers` — UI displays it, RPC enforces it; only colors/styling are client-side.
- **Dex range 1..1025** everywhere: `generate_series(1, 1025)` in the RPC, the `avatar_pokemon_number` CHECK, and pokemon.json's content must stay in agreement.
- Naming: the DB/docs say points/Poke-Monedas; the header chip label is "Poke-Coins". Ledger descriptions are Spanish (`Compra #N`, `Cancelación #N`, `Pokébola: <label>`).
- Shared-signal pattern: `LoyaltyService.balance` mirrors `ProfilesService` — consumers call `ensureLoaded()` and read the signal; after a spend the RPC's `new_balance` is pushed into it (no re-fetch).

## Gotchas / invariants

- **Earning is a trigger side effect of the pending→paid UPDATE** — it does not happen in `place_order`, and marking paid via any path (admin screen direct UPDATE, SQL) awards points. Re-entering `paid` never double-awards; cancelling reverses at most once and ignores `loyalty_enabled`.
- **`loyalty_enabled` defaults to `false`** — a fresh environment silently awards nothing until flipped in `/admin/config`.
- If a new Pokémon generation raises the dex cap past **1025**, three places must change together: `open_pokeball`'s `generate_series`, the `avatar_pokemon_number` CHECK constraint, and a re-run of `fetch-pokemon-data.mjs`.
- The **column-grant lockdown** in `20260704000000` means adding any new customer-editable `profiles` column requires updating the explicit `GRANT UPDATE (…)` / `GRANT INSERT (…)` lists, or client saves fail RLS-style with permission errors. The comment in `20260630000000` claiming `profiles_self_update` covers collection writes is stale.
- `open_pokeball` awards **fewer Pokémon than advertised at full cost** when the dex is nearly complete (documented as acceptable in the migration).
- Portrait art is currently **remote** (PMDCollab GitHub raw + pokemondb CDN) and marked TEMP in `PokemonService.portraitUrl` — availability depends on third parties; the self-hosted fallback path (`assets/images/avatars/{n}.png`) is commented in code but not shipped.
- `getMyBalance()` fetches **all** ledger rows and sums client-side — fine at current volumes, but it's O(rows-per-user); the RPCs sum server-side.
- `src/app/core/loyalty/loyalty.service.ts` (and `orders.service.ts`, `account.*`, `header.html`, `app.routes.ts`) had **uncommitted working-tree changes** when this doc was verified; this doc describes the on-disk state.

## Related docs

- [commerce-flow.md](./commerce-flow.md) — how orders reach `paid`/`cancelled`
- [data-model.md](./data-model.md) — profiles, app_settings, RLS reference
- [backend-rpcs-and-functions.md](./backend-rpcs-and-functions.md) — RPC catalogue
- Screens: [account](../screens/storefront/account.md), [account-pokedex](../screens/storefront/account-pokedex.md), [shell-header-footer](../screens/storefront/shell-header-footer.md), admin [customer-detail](../screens/admin/customer-detail.md), [dashboard](../screens/admin/dashboard.md), [reports](../screens/admin/reports.md), [config](../screens/admin/config.md)
