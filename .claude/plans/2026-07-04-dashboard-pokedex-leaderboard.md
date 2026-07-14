# Admin dashboard: Top-10 Pokédex leaderboard panel

## Context

The admin customer detail just gained a Pokédex tab. Diego now wants the dashboard
(`/admin`) to surface engagement with the collection feature: a panel listing the top 10
customers by Pokémon captured. The dashboard already has a row of list panels ("Pedidos
recientes", "Últimos registros", "Actividad reciente") that this should visually mirror —
per the lean-admin-surface preference, this is a contextual panel on an existing screen,
not a new route.

Data: `profiles.caught_pokemon_numbers integer[]` — the count is
`cardinality(caught_pokemon_numbers)`. No existing RPC exposes a ranked list; the admin
list RPC (`admin_customers`) doesn't carry the column and its sort is fixed. A small
dedicated admin RPC is the clean source.

## Approach

Add an `admin_pokedex_leaderboard(p_limit)` security-definer RPC (same `is_admin()` guard
pattern as `admin_customers`), a `CustomersService.pokedexLeaderboard()` method, and a
fourth list panel on the dashboard reusing the existing `panel` + `recent-user__row`
markup/styles. Rows link to the customer detail and deep-link straight to its Pokédex tab
via a `?tab=pokedex` query param bound with `withComponentInputBinding`.

## Steps

1. **Migration — new RPC** — `supabase/migrations/20260704130000_admin_pokedex_leaderboard.sql`
   ```sql
   create or replace function public.admin_pokedex_leaderboard(p_limit int default 10)
   returns table (id uuid, full_name text, email text, caught_count int)
   language plpgsql stable security definer
   set search_path = public, pg_temp
   ```
   - `is_admin()` guard, then:
     `select p.id, p.full_name, u.email::text, cardinality(p.caught_pokemon_numbers)`
     from `profiles p join auth.users u on u.id = p.id`
     `where cardinality(p.caught_pokemon_numbers) > 0`
     `order by cardinality(p.caught_pokemon_numbers) desc, p.created_at asc`
     `limit p_limit;`
     (Qualify every column — RETURNS TABLE names shadow otherwise. Ties break by
     seniority.)
   - `grant execute ... to authenticated;`. Apply with `npm run db:push:dev`. This is a
     NEW function (no drift concern), so no live-def pull needed.

2. **Type + service** — `catalog.types.ts`: new
   `PokedexLeaderboardRow { id: string; full_name: string | null; email: string; caught_count: number; }`
   near the other admin-customer types. `customers.service.ts`: `pokedexLeaderboard(limit = 10)`
   calling the RPC, coercing `caught_count: Number(...) || 0`, returning `[]`-safe array
   (same error idiom as `listCustomers` — log + throw; the dashboard call site catches).

3. **Customer detail: tab deep-link** — `customer-detail.ts` + `.html`
   - `readonly tab = input<string | undefined>();` — bound from the `?tab=` query param by
     `withComponentInputBinding` (already on: the `id` route param binds the same way).
     ⚠️ Known footgun: the input arrives `undefined` on routes without the key — always
     read with a fallback, never navigate with it raw.
   - `protected readonly selectedTab = computed(() => this.tab() === 'pokedex' ? 2 : this.tab() === 'monedas' ? 1 : 0);`
   - `<mat-tab-group [selectedIndex]="selectedTab()" ...>` — one-way; user clicks still
     work (Material manages its own state after init).

4. **Dashboard panel** — `admin-dashboard.ts` + `.html` (+ tiny `.scss` if needed)
   - TS: `protected readonly topPokedex = signal<PokedexLeaderboardRow[] | null>(null);`
     loaded in `ngOnInit` with `.catch(() => this.topPokedex.set([]))`, matching the other
     panel loads.
   - HTML: fourth `<section class="panel panel--customers">` after "Actividad reciente":
     - Eyebrow: `Top Pokédex`; link `Ver clientes` → `/admin/customers`.
     - States: `null` → "Cargando…", `[]` → "Aún no hay Pokémon capturados."
     - Rows reuse `recent-user__row`: a rank number (`1`–`10`, mono, dim), then
       name/email block, then the count on the right
       (`{{ c.caught_count }}` + a small `catching_pokemon` mat-icon).
     - Row link: `[routerLink]="['/admin/customers', c.id]" [queryParams]="{ tab: 'pokedex' }"`.
   - SCSS: only a small `.recent-user__rank` (mono, `--text-tertiary`, fixed width) and a
     count style if the existing classes don't cover it — everything else reuses panel CSS.

## Files to modify / create

- `supabase/migrations/20260704130000_admin_pokedex_leaderboard.sql` — **new** RPC
- `src/app/core/catalog/catalog.types.ts` — `PokedexLeaderboardRow`
- `src/app/core/customers/customers.service.ts` — `pokedexLeaderboard()`
- `src/app/admin/customers/customer-detail.ts` — `tab` query-param input → `selectedTab`
- `src/app/admin/customers/customer-detail.html` — `[selectedIndex]` on the tab group
- `src/app/admin/admin-dashboard/admin-dashboard.ts` — signal + load + import type
- `src/app/admin/admin-dashboard/admin-dashboard.html` — fourth panel
- `src/app/admin/admin-dashboard/admin-dashboard.scss` — rank/count styles only

## Reused utilities

- `is_admin()` + security-definer RPC pattern (`admin_customers` at `20260525002300`)
- Dashboard `panel` / `recent-user__row` markup + SCSS — the new panel is a sibling copy
- `withComponentInputBinding` query-param input (pattern documented in project memory —
  guard with `??`/computed fallback)
- `CustomersService` — natural home for the new fetch

## Verification

1. `npm run db:push:dev` clean. MCP can't call the RPC (is_admin guard) — verify the
   underlying query directly:
   `select p.full_name, cardinality(p.caught_pokemon_numbers) from profiles p where cardinality(p.caught_pokemon_numbers) > 0 order by 2 desc limit 10;`
2. Dev server already running on :4242 (leave it). `/admin` → new "Top Pokédex" panel shows
   ranked customers (dev data: at least "Diego AlvarezUS" with 34); clicking a row lands on
   the customer detail **with the Pokédex tab already selected**.
3. Plain `/admin/customers/:id` (no query param) still opens on the Pedidos tab —
   the undefined-input fallback works.
4. `npm run build` + `npm test` (4 pre-existing NG0201 failures expected).

## Out of scope

- Showing dex percentage / total (1025) in the panel — count only
- A full leaderboard screen or pagination beyond top 10
- Caching/materializing the count (profiles is small; cardinality per row is cheap)
- Any storefront-visible leaderboard
