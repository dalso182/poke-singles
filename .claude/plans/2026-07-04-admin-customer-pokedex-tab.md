# Admin customer detail: Pokédex tab (reuse storefront Pokedex component)

## Context

`/admin/customers/:id` now has Pedidos + Poke-Monedas tabs. Diego wants a third tab showing
the customer's Pokédex progress — the same experience as the storefront `/account` Pokédex
(region jump bar with scroll-spy, owned/missing filters, per-region progress counts), but with
smaller 75px sprites since the admin doesn't need the 100px storefront size. Explicit ask:
**reuse the exact storefront component**, parameterized via inputs, rather than building an
admin clone.

The storefront `Pokedex` (`src/app/user/account/pokedex/pokedex.ts`) is almost reusable as-is:
- Pokémon reference data comes from client-side `PokemonService.list()` — user-agnostic. ✓
- Region bar, filters, scroll-spy, FAB all find their scroll root via
  `closest('mat-sidenav-content')` — **the admin shell also wraps content in
  `mat-sidenav-content`** (`admin-shell.html:175`), so this works unchanged. ✓
- Two things are self-user-bound and need input overrides:
  1. `caught` reads `profiles.profile()?.caught_pokemon_numbers` (the signed-in user).
  2. The header shows "Mi Pokédex" + a "Capturar más Pokémon" button that opens the
     Pokéball dialog — which spends the *signed-in admin's* coins. Must be hidden in
     admin context.
- Tile size (100px) is hardcoded in SCSS (`.pdx__thumb`, `.pdx__img`, grid `minmax(108px)`).

Data: `profiles.caught_pokemon_numbers` is `integer[] not null default '{}'`. The admin
already fetches the customer through `admin_customer()` — just add the column to its jsonb.

## Approach

Parameterize `Pokedex` with three inputs: `caughtNumbers` (external ownership override →
also switches the component into read-only "viewing someone else" mode), `title`, and
`tileSize` (drives a `--pdx-tile` CSS custom property; SCSS derives thumb/img/grid sizes from
it, defaulting to today's 100px). Extend `admin_customer` with `caught_pokemon_numbers`, and
add a lazily-rendered third mat-tab that mounts `<app-pokedex>` with the overrides.

## Steps

1. **Migration — add caught list to `admin_customer`** —
   `supabase/migrations/20260704120000_admin_customer_pokedex.sql`
   - Pull the live function def first (`pg_get_functiondef`) in case the dev DB moved
     (it now includes the loyalty keys from `20260704110000`).
   - Add one key to the jsonb: `'caught_pokemon_numbers', to_jsonb(p.caught_pokemon_numbers)`
     (column is NOT NULL DEFAULT '{}' — no coalesce needed). jsonb return → CREATE OR
     REPLACE; keep the grant line. Apply with `npm run db:push:dev`.

2. **Types + service** — `catalog.types.ts`: `CustomerDetail` gains
   `caught_pokemon_numbers: number[];`. `customers.service.ts` `getCustomer()`: pass through
   with `caught_pokemon_numbers: c.caught_pokemon_numbers ?? []` (jsonb int array arrives as
   number[] — no per-element coercion needed).

3. **Parameterize `Pokedex`** — `src/app/user/account/pokedex/pokedex.ts` + `.html` + `.scss`
   - New inputs (template-bound, not router-bound — the `withComponentInputBinding`
     undefined-default footgun doesn't apply, but keep `??` fallbacks anyway for safety):
     - `caughtNumbers = input<number[] | null>(null)` — when non-null, `caught` computed
       uses `new Set(this.caughtNumbers())` instead of the profile signal.
     - `external = computed(() => this.caughtNumbers() !== null)` — drives read-only mode.
     - `title = input('Mi Pokédex')` — header text (admin passes 'Pokédex').
     - `tileSize = input(100)` — sprite square in px.
   - Host binding: `host: { '[style.--pdx-tile.px]': 'tileSize()' }`.
   - Template: `{{ title() }}` in the header; wrap the "Capturar más Pokémon" button in
     `@if (!external())`. Sub-line "Completa tu colección por región." also only for
     self mode (admin sees no CTA copy — or keep it; simplest: hide behind the same @if
     with a neutral admin fallback omitted entirely). Keep the `width/height` attrs on the
     `<img>` in sync: `[width]="tileSize()" [height]="tileSize()"`.
   - SCSS: introduce the custom property with today's look as default —
     ```scss
     .pdx { --pdx-tile: 100px; }        // fallback when host doesn't set it
     .pdx__thumb, .pdx__img { width: var(--pdx-tile); height: var(--pdx-tile); }
     .pdx__grid { grid-template-columns: repeat(auto-fill, minmax(calc(var(--pdx-tile) + 8px), 1fr)); }
     .pdx__card { contain-intrinsic-size: auto calc(var(--pdx-tile) + 50px); }
     ```
     Keep the 600px media-query override but express it relative too
     (`minmax(calc(var(--pdx-tile) - 8px), 1fr)`).
     NOTE: host sets `--pdx-tile` on `<app-pokedex>`; `.pdx` is a child, so its own
     `--pdx-tile: 100px` declaration would *shadow* the host value — declare the fallback
     as `.pdx { --pdx-tile: 100px; }` only via `:host` default instead:
     set the default in TS (`tileSize = input(100)`) and always bind on host; then SCSS
     just uses `var(--pdx-tile, 100px)` everywhere with **no** `.pdx` declaration.
   - Storefront call site (`account.html` → `<app-pokedex (coinsSpent)="...">`) needs no
     change — defaults preserve current behavior exactly.

4. **Admin tab** — `customer-detail.html` + `.ts` + `.scss`
   - Import `Pokedex` into `CustomerDetail`'s `imports`.
   - Third `<mat-tab [label]="'Pokédex (' + c.caught_pokemon_numbers.length + ')'">`.
     Wrap the content in `<ng-template matTabContent>` so the ~1025 tiles only render when
     the tab is first selected (Material's lazy tab content).
   - Inside: `<app-pokedex [caughtNumbers]="c.caught_pokemon_numbers" title="Pokédex" [tileSize]="75" />`
     wrapped in a padded div (e.g. `customer-detail__pokedex`, padding 8px 20px 20px) so it
     doesn't sit flush against the card edges like the tables do.
   - SCSS: the padding class. The sticky region bar (`top: 0`) sticks within the admin
     scroll container — acceptable; no change.

## Files to modify / create

- `supabase/migrations/20260704120000_admin_customer_pokedex.sql` — **new**; add `caught_pokemon_numbers` to `admin_customer`
- `src/app/core/catalog/catalog.types.ts` — `CustomerDetail.caught_pokemon_numbers`
- `src/app/core/customers/customers.service.ts` — default `?? []`
- `src/app/user/account/pokedex/pokedex.ts` — `caughtNumbers` / `title` / `tileSize` inputs, host style binding, external mode
- `src/app/user/account/pokedex/pokedex.html` — title binding, capture button behind `@if (!external())`, img size binding
- `src/app/user/account/pokedex/pokedex.scss` — sizes via `var(--pdx-tile, 100px)`
- `src/app/admin/customers/customer-detail.ts` — import `Pokedex`
- `src/app/admin/customers/customer-detail.html` — third tab with lazy `matTabContent`
- `src/app/admin/customers/customer-detail.scss` — pokedex tab padding

## Reused utilities

- `Pokedex` component (whole thing) at `src/app/user/account/pokedex/` — the deliverable IS its reuse
- `PokemonService.list()` / `spriteUrl()` / `POKEDEX_REGIONS` — user-agnostic, untouched
- `admin_customer` RPC — extended again (same pattern as the loyalty migration)
- Material lazy tab content (`ng-template matTabContent`) — keeps the heavy grid out of the default tab render

## Verification

1. `npm run db:push:dev`; smoke-check the column flows:
   `select public.admin_customer(...)` won't run via MCP (is_admin guard) — instead verify
   `select caught_pokemon_numbers from profiles where cardinality(caught_pokemon_numbers) > 0 limit 1;`
   and rely on the UI check below for the RPC end-to-end.
2. Dev server already on http://localhost:4242 (leave it alone). `/admin/customers` → the
   customer used for Pokéball testing → Pokédex tab: 75px sprites, region bar jumps + scroll-spy
   highlights, Todos/Capturados/Faltantes filters work, progress counts match the user's own
   `/account` Pokédex, **no "Capturar más Pokémon" button**, back-to-top FAB appears on scroll.
3. Storefront regression: `/account` → Mi Pokédex still shows 100px tiles, capture button
   present, Pokéball flow still refreshes coins (coinsSpent output untouched).
4. `npm run build` + `npm test` (4 pre-existing NG0201 RouterLink spec failures expected).

## Out of scope

- Admin editing of a customer's caught list (granting/removing Pokémon)
- Moving/renaming the Pokedex component out of `user/account/` (import across branches is fine)
- Pokéball redemption from the admin context
- Virtualizing the dex grid (content-visibility already handles cost)
