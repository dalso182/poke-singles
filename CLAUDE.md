# Poke-Singles — Claude project notes

Migration of **poke-singles.com**, a Pokémon singles e-commerce store in Costa Rica
(~5,000 SKUs), from **OpenCart 3.0** to a new **Angular 21 + Supabase** stack on
SiteGround. The OpenCart site stays live until the new one ships.

This file is the always-on context. **Deeper, domain-specific detail lives in skills**
under `.claude/skills/` — see the index at the bottom. Reach for the matching skill
before working in that area rather than guessing.

## Stack

- **Angular 21** — standalone components, strict TS, SCSS, signals; vitest runner.
- **Angular Material 21** (Material 3), themed **Vault Light**. → `theme` skill.
- **Supabase** — Postgres 17, RLS, REST/Realtime, Auth, Edge Functions. Dev project
  `fdscdinfpmvswinpasdg` (dev-poke-singles) linked for daily work; the original project
  `dhslfridsjdmhwzrgebv` is now **PROD** (promoted 2026-07) — writes to it only via the
  deliberate `:prod` scripts. `SupabaseService` in `src/app/core/supabase/`. → `database` skill.
- **`@tcgdex/sdk`** (`^2.9.0`) — TCG card-data, wired via `TcgdexService`. → `database` skill.
- **SiteGround** hosting (Apache + PHP, **no Node** on Shared/Cloud → SPA-only). → `deploy` skill.

## Conventions (apply to nearly every change)

- **Standalone components only.** No NgModules.
- **Signals** for component state (`signal`, `computed`, `effect`).
- **Material imported per-component** via the `imports:` array — no shared barrel module.
- **Never touch `window` / `document`** directly without `isPlatformBrowser()` — keeps the
  door open for adding SSR later without a refactor.
- App is a **client-rendered SPA**; SSR is not configured (SiteGround has no Node). SSG is
  feasible later — deferred until product-page SEO is a real lever.

## Hard rule: brand red

Brand red (`#CE1126`) is restricted to **two** uses: the brand-bar gradient (`.brand-bar`)
and the AGOTADA / sold-out badge (`.product-card--sold-out::after`). Sale prices
(`.price--sale`) are **amber** (`--accent-amber`), not red. Material's `error` slot uses a
**different** red, Danger (`#B91C1C`), so form errors and snackbars never bleed brand red.
If brand red shows up anywhere else, the wiring leaked — fix before shipping. (Known
stragglers to reconcile are listed in `docs/architecture/theming.md`.) Rationale +
implementation → `theme` skill.

## Hard rule: never deploy to the live OpenCart root

`scripts/deploy.mjs` refuses any upload to a path matching `/poke-singles.com/public_html`
(the live store) and prod creds are left blank in `.env.local` by convention. Both layers
must be defeated deliberately to ship to the live site (cutover day). → `deploy` skill.

## Local commands

```bash
npm start          # ng serve on http://localhost:4242
npm run build      # production build → dist/poke-singles/browser/
npm run build:dev  # dev-configuration build
npm test           # vitest (suite is green — keep it that way)
npm run preflight  # go/no-go gate before deploy:prod — test + e2e + build:prod
npm run e2e        # Playwright checkout smoke vs dev Supabase (self-seeding + cleanup)
```

Deploy, DB, image, and migration commands live in their respective skills. Test-harness
details (fakes in `src/app/testing/`, e2e fixtures/env keys, gotchas):
`docs/architecture/testing.md`.

## Directory map (high level)

> **Per-screen / per-subsystem docs:** before working on a specific screen or subsystem,
> load its doc from `docs/` — one file per screen under `docs/screens/<area>/`, plus
> cross-cutting subsystem docs under `docs/architecture/`. Index with routes and
> load-when guidance: `docs/README.md`.

```
src/app/
├── app.ts / app.routes.ts / app.config.ts   Root, top-level routes, providers
├── user/      Customer-facing branch (UserShell): header, nav, footer, card-list,
│              search-results, detail, rifas, cart-drawer, cart-page, checkout,
│              order-confirmation, account (+pokedex), static-page, dialogs
│              (announcement + card-conditions)                                       → storefront
├── admin/     Admin branch (AdminShell, adminGuard): dashboard, products (+add/edit),
│              categories, filters (embeds card-types), sets, sellers, coupons,
│              shipping-methods, orders, customers, raffles, reports, price-review,
│              pages, announcements, config                                           → admin
├── auth/      Shared login-dialog (magic link / password / Google)                  → storefront + database
├── core/      Services: announcements, auth, cart, catalog, customers, dashboard,
│              images, loyalty, orders, pokemon, presence, preview, reports,
│              search-log, settings, storage, supabase, tcgdex                        → database (data) / per-feature
├── shared/    card-typeahead, set-typeahead, image-picker, card-preview, product-card,
│              raffle-card, filters-bar, table/ + forms/ (admin primitives), marquee …
├── library/   /library designer reference (no shell)                                → theme
├── maintenance/  /mantenimiento standalone screen (maintenanceGuard fallback)
└── home/      Landing page
src/styles/    Vault Light theme (_theme-colors / _brand-tokens / _material-overrides …) → theme
scripts/       deploy.mjs, seed-products.mjs, prepare-for-prod.mjs, fetch/upload-images   → deploy / migration
server/        PHP image-picker endpoints (list/upload/create-folder + auth gate)     → admin
supabase/      migrations + functions                                                → database
brand-guidelines.html   Design system spec (open in browser)                         → theme
```

Each skill describes its own subtree in detail.

## Routes (compact)

`/admin/*` → AdminShell (lazy, `adminGuard`): dashboard, products(+new/:id/edit),
categories, filters (card-types live here — no card-types route), sets, sellers(+:id),
coupons(+new/:id/edit), shipping-methods, orders(+:id), customers(+:id), raffles(+:id),
reports, price-review, pages(+new/:id/edit), announcements(+new/:id/edit), config.
`/library` → designer reference (no shell). `/mantenimiento` → standalone maintenance
screen. `/` → UserShell (`maintenanceGuard`): home, products, ofertas, products/:slug,
buscar, rifas, cart, checkout(+confirmation/:id), info/:slug,
account(`customerGuard`, + direccion/pedidos/puntos/pokedex deep links);
categoria/:slug redirects to /products?categoria=. **Specific paths must come before the
empty-path UserShell** or the router mis-matches `/admin`, `/library`, `/mantenimiento`.
Full route table → `docs/architecture/routing-and-guards.md`.

## Out of scope right now (each gets its own plan when picked up)

- Domain cutover to `poke-singles.com` (prod project + `:prod` scripts are wired; remaining:
  prod test-data cleanup, prod auth config, go-live deploy — plan: `the-time-is-coming-distributed-pascal.md`)
- Invoice download for customer orders (history itself is shipped at `/account/pedidos`)
- 301 redirect map from old OpenCart URLs → `migration`
- SSR / static prerendering (`ng add @angular/ssr`)

---

## Skill index — where to look

| Working on… | Skill |
|---|---|
| Supabase schema, RLS/`is_admin`, migrations, RPCs, edge functions, coupon/raffle data logic, TCGdex cache, customer-auth DB, type regen | `database` |
| Customer UI: home rails, product card + grids, `/buscar` search UI, hover preview, cart drawer/page, `/account`, `/rifas` view, login dialog | `storefront` |
| `/admin` shell, product CRUD + add-product TCGdex flow, image picker, categories/card-types/sets, coupons admin, raffles admin + draw, reports (orders/activity/searches/coupons), config | `admin` |
| Vault Light theme — SCSS files, tokens, Material overrides, the red rule, `/library` | `theme` |
| SiteGround SFTP deploy, env tiers, `.htaccess`, self-hosted card images, deploy guard | `deploy` |
| OpenCart 3.0 → Supabase data import, category map, cutover prep, URL/301 strategy | `migration` |
