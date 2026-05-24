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
  `dhslfridsjdmhwzrgebv` linked; `SupabaseService` in `src/app/core/supabase/`. → `database` skill.
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

Brand red (`#CE1126`) is restricted to: the brand-bar gradient (`.brand-bar`), sale prices
(`.price--sale`), and the AGOTADA / sold-out badge (`.product-card--sold-out::after`).
Material's `error` slot uses a **different** red, Danger (`#B91C1C`), so form errors and
snackbars never bleed brand red. If brand red shows up anywhere else, the wiring leaked —
fix before shipping. Rationale + implementation → `theme` skill.

## Hard rule: never deploy to the live OpenCart root

`scripts/deploy.mjs` refuses any upload to a path matching `/poke-singles.com/public_html`
(the live store) and prod creds are left blank in `.env.local` by convention. Both layers
must be defeated deliberately to ship to the live site (cutover day). → `deploy` skill.

## Local commands

```bash
npm start          # ng serve on http://localhost:4242
npm run build      # production build → dist/poke-singles/browser/
npm run build:dev  # dev-configuration build
npm test           # vitest
```

Deploy, DB, image, and migration commands live in their respective skills.

## Directory map (high level)

```
src/app/
├── app.ts / app.routes.ts / app.config.ts   Root, top-level routes, providers
├── user/      Customer-facing branch (UserShell): header, nav, footer, home,
│              card-list, search-results, detail, cart-drawer, cart-page, account   → storefront
├── admin/     Admin branch (AdminShell, adminGuard): dashboard, products, categories,
│              card-types, sets, coupons, raffles, config                            → admin
├── auth/      Shared login-dialog (magic link / password / Google)                  → storefront + database
├── core/      Services: auth, catalog, cart, images, preview, settings, storage,
│              supabase, tcgdex                                                       → database (data) / per-feature
├── shared/    card-typeahead, set-typeahead, image-picker, card-preview, product-card, filters
├── library/   /library designer reference (no shell)                                → theme
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
categories, card-types, coupons(+new/:id/edit), raffles(+:id), sets, config.
`/library` → designer reference (no shell). `/` → UserShell: home, products,
products/:slug, buscar, rifas, cart, account(`customerGuard`). **Specific paths must come
before the empty-path UserShell** or the router mis-matches `/admin` and `/library`.
Full route table + component notes → `admin` and `storefront` skills.

## Out of scope right now (each gets its own plan when picked up)

- Prod Supabase project + cutover wiring (`environment.prod.ts`, `<prod-ref>` placeholders) → `deploy`/`migration`
- Checkout: `orders` + `place_order` buyer form + SINPE Móvil instructions (RPC + redemption already exist) → `database`
- Customer order history + invoice download
- 301 redirect map from old OpenCart URLs → `migration`
- SSR / static prerendering (`ng add @angular/ssr`)

---

## Skill index — where to look

| Working on… | Skill |
|---|---|
| Supabase schema, RLS/`is_admin`, migrations, RPCs, edge functions, coupon/raffle data logic, TCGdex cache, customer-auth DB, type regen | `database` |
| Customer UI: home rails, product card + grids, `/buscar` search UI, hover preview, cart drawer/page, `/account`, `/rifas` view, login dialog | `storefront` |
| `/admin` shell, product CRUD + add-product TCGdex flow, image picker, categories/card-types/sets, coupons admin, raffles admin + draw, config | `admin` |
| Vault Light theme — SCSS files, tokens, Material overrides, the red rule, `/library` | `theme` |
| SiteGround SFTP deploy, env tiers, `.htaccess`, self-hosted card images, deploy guard | `deploy` |
| OpenCart 3.0 → Supabase data import, category map, cutover prep, URL/301 strategy | `migration` |
