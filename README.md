# Poke-Singles

Online store for Pokémon trading-card singles in Costa Rica. ~5,000 SKUs.

This repo is the **rebuild** of [poke-singles.com](https://poke-singles.com), migrating
from the existing OpenCart 3.0 storefront to a modern **Angular 21 + Supabase** stack
hosted on SiteGround. The OpenCart site stays live until the new one ships.

> 📐 Design source of truth: open [`brand-guidelines.html`](./brand-guidelines.html) in
> a browser — palette, typography, components, voice. The implementation in `src/styles/`
> mirrors that spec.

## Status

- ✅ Angular 21 + Material 21 scaffold
- ✅ Vault Light brand theme applied (Tico Blue / Amber Glow / warm cream / Manrope)
- ✅ User shell (header + sidenav + footer), home, product list, product detail
- ✅ Admin panel: shell, profile menu (Google OAuth), dashboard, CRUD for products/categories/sets
- ✅ Designer reference at `/library`
- ✅ SiteGround SFTP deploy script (`npm run deploy:dev` / `:prod`)
- ✅ Two-tier env model (local / dev tier / prod) wired in `angular.json`
- ✅ Supabase dev project linked (`dhslfridsjdmhwzrgebv`); SDK + `SupabaseService` wired
- ✅ Deploy guard refuses uploads to the live OpenCart root
- ✅ Schema design + migrations (products, categories, sets, conditions, prices, stock, audit trails)
- ✅ Admin auth (Google OAuth) + RLS policies (admin role check)
- ✅ TCGdex endpoint configurable per environment (dev / prod)
- ⬜ Prod Supabase project
- ⬜ Customer auth + cart, checkout, payments (SINPE Móvil + bank transfer)
- ⬜ OpenCart → Supabase data import
- ⬜ 301 redirect map for old OpenCart URLs

## Stack

| | |
|---|---|
| Frontend | Angular 21, standalone components, signals, vitest |
| UI kit | Angular Material 21 (Material 3) themed Vault Light |
| Backend | Supabase (linked, schema TBD) — Postgres 17, RLS, REST/Realtime, Auth, Edge Functions |
| Card data | `@tcgdex/sdk` installed — usage TBD (likely for hydrating card metadata) |
| Hosting | SiteGround Shared (Apache + PHP, **no Node** — SPA-only) |
| Deploy | SFTP via `scripts/deploy.mjs` |

## Quick start

Requires Node 20+ and npm.

```bash
git clone <repo>
cd new-poke-singles
npm install
npm start                 # http://localhost:4242
```

Open [`/library`](http://localhost:4242/library) in the browser to see the full Material
component reference rendered with the brand theme.

## Common commands

```bash
npm start                 # ng serve on port 4242
npm run build             # production build → dist/poke-singles/browser/
npm run build:dev         # dev configuration build
npm run build:prod        # explicit production configuration
npm run watch             # rebuild on change
npm test                  # vitest

npm run deploy:dev        # build:dev  + SFTP upload to dev subdomain
npm run deploy:prod       # build:prod + SFTP upload to poke-singles.com
```

Deploy details: `scripts/deploy.mjs` reads `.env.local` (gitignored — copy from
`.env.local.example`). Flags: `--dry-run`, `--skip-build`, `--only=code|assets|all`.

## Routes

| Path | Component | Notes |
|---|---|---|
| `/` | Home | Landing page (inside UserShell) |
| `/products` | CardList | Product grid |
| `/products/:slug` | Detail | Product detail; `:slug` bound via `input()` |
| `/admin` | AdminShell | Requires admin role; uses Google OAuth |
| `/admin/` | Dashboard | Admin home (default after `/admin`) |
| `/admin/products` | ProductsList | Paginated table with search + filters |
| `/admin/products/new` | AddProduct | TCGdex typeahead autofill + manual mode |
| `/admin/products/:id/edit` | ProductEdit | Full form (metadata + commerce) |
| `/admin/categories` | Categories | CRUD with inline edit, soft-delete with undo |
| `/admin/sets` | Sets | Expandable rows, find-or-create from TCGdex |
| `/admin/orders` | Placeholder | TBD |
| `/admin/customers` | Placeholder | TBD |
| `/library` | Library | Designer reference (no app chrome) |

## Deploying

1. **One-time setup**

   ```bash
   cp .env.local.example .env.local
   ```

   Fill in SiteGround SSH host, port, user, remote dir, and either an SSH private-key
   path + passphrase (preferred) or a password. Both prod and dev targets use the same
   SiteGround account; dev keys are `DEV_`-prefixed in `.env.local`.

2. **Dry-run first**

   ```bash
   npm run deploy:dev -- --dry-run
   ```

   Confirms the connection details and shows the file count without uploading.

3. **Ship**

   ```bash
   npm run deploy:dev      # → new.poke-singles.com (or your dev subdomain)
   npm run deploy:prod     # → poke-singles.com
   ```

   The script auto-writes a SPA-fallback `.htaccess` at the upload root so deep links
   (`/products/<slug>`) reload to `index.html` and the Angular router takes over.

> 🛡 **Deploy guard.** `scripts/deploy.mjs` refuses to upload to any path matching
> `/poke-singles.com/public_html` (the live OpenCart root). Subdomains like
> `new.poke-singles.com` are allowed. To deploy to the live site at cutover, edit
> `BLOCKED_REMOTE_PATHS` in the script deliberately.

## Brand theme

The Vault Light system is implemented across these files:

| File | Role |
|---|---|
| `src/styles.scss` | Theme entry — `mat.theme()` + `mat.theme-overrides()` |
| `src/styles/_theme-colors.scss` | Material 3 tonal palettes (generated) |
| `src/styles/_brand-tokens.scss` | `:root` CSS vars (brand red, surfaces, fonts) |
| `src/styles/_material-overrides.scss` | Button/card shape + button typography |
| `src/styles/_brand-utilities.scss` | `.brand-bar`, `.brand-eyebrow`, `.product-card--featured`, etc. |

**Hard rule on red.** Brand red (`#CE1126`) is allowed only on:

1. The brand-bar gradient (`.brand-bar`)
2. Sale prices (`.price--sale`)
3. The AGOTADA badge (`.product-card--sold-out::after`)

Material's error slot uses Danger (`#B91C1C`) — a different red — so form-field errors
and snackbars never use brand red. See `CLAUDE.md` → *Brand theme* for the rationale.

## Environments

| Tier | URL | Supabase | Build |
|---|---|---|---|
| Local | `http://localhost:4242` | `dhslfridsjdmhwzrgebv` (dev) | `npm start` |
| Dev | `new.poke-singles.com` | `dhslfridsjdmhwzrgebv` (dev) | `ng build --configuration=dev` |
| Prod | `poke-singles.com` (cutover deferred) | prod project (TBD) | `ng build --configuration=production` |

Env files: `src/environments/environment.ts` (local + dev tier — both hit the same
Supabase project for now) is wired. `src/environments/environment.prod.ts` is an empty
stub until the prod project exists; the production build swaps it in via
`fileReplacements` in `angular.json`. The deploy guard in `scripts/deploy.mjs` blocks
any upload to the live OpenCart root regardless of env state.

## Supabase

**Dev project linked** (`dhslfridsjdmhwzrgebv`). The pipeline is operational:

```bash
npm run db:types:dev      # regenerate src/app/core/supabase/database.types.ts
npm run db:push:dev       # apply migrations from supabase/migrations/
npm run functions:dev     # deploy edge functions from supabase/functions/
```

Inject `SupabaseService` from `src/app/core/supabase/` to make queries:

```ts
import { inject } from '@angular/core';
import { SupabaseService } from './core/supabase/supabase.service';

const supabase = inject(SupabaseService).client;
const { data, error } = await supabase.from('<table>').select('*');
```

Re-run `npm run db:types:dev` after every migration so generated types stay in sync.

**Schema:** Catalog tables (categories, sets, products) with triggers for audit
(updated_at, first_listed_at), restock notifications, and Pokemon name normalization.
Admin role detected via `is_admin()` helper (checks `auth.jwt claims → 'app_metadata'.'role'`).

**Still pending:**

- Prod Supabase project — when ready, fill in `environment.prod.ts` with prod creds
  and replace the `<prod-ref>` placeholders in `package.json` (4 of them: `db:types:prod`,
  `db:push:prod`, `functions:prod` — note `db:types` already uses the linked project)
- Customer auth (email/password + magic link signup) and customer-side RLS policies
  (for orders, cart, wishlist when those tables exist)

## Repo layout

```
src/                      Angular app (see CLAUDE.md → Project layout)
scripts/deploy.mjs        SiteGround SFTP deploy
supabase/                 Scaffolded; migrations + functions empty
brand-guidelines.html     Design system spec — open in browser
.env.local.example        Template for SFTP creds (copy to .env.local)
CLAUDE.md                 Deeper notes for working in this repo with Claude Code
```

## Conventions

- **Standalone components only.** No NgModules.
- **Signals** for component state (`signal`, `computed`, `effect`).
- **Material modules imported per-component** via the `imports:` array — no shared
  Material module barrel.
- **Don't access `window` / `document` directly** without `isPlatformBrowser()` —
  keeps the door open for adding SSR later without a refactor.

## License

Private — internal use only.
