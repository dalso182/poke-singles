# Poke-Singles

Online store for Pokémon trading-card singles in Costa Rica. ~5,000 SKUs.

This repo is the **rebuild** of [poke-singles.com](https://poke-singles.com), migrating
from the existing OpenCart 3.0 storefront to a modern **Angular 21 + Supabase** stack
hosted on SiteGround. The OpenCart site stays live until the new one ships.

> 📐 Design source of truth: open [`brand-guidelines.html`](./brand-guidelines.html) in
> a browser — palette, typography, components, voice. The implementation in `src/styles/`
> mirrors that spec.

## Status

- ✅ Angular 21 + Material 21 scaffold, Vault Light brand theme
- ✅ Designer reference at `/library`
- ✅ SiteGround SFTP deploy + two-tier env model + deploy guard against the live OpenCart root
- ✅ Supabase dev project linked + SDK + `SupabaseService` + RLS-with-`is_admin()` pattern
- ✅ Catalog schema: products, categories, sets, card_types (many-to-many),
  TCGdex metadata cache (`tcgdex_cards`), `app_settings`, audit triggers
- ✅ Admin panel: dashboard, CRUD for products / categories / card-types / sets / coupons / config,
  Google OAuth, image picker over a server-side PHP listing, TCGdex-driven add-product flow
- ✅ Admin reports (`/admin/reports`): per-customer orders, customer activity log
  (login / order / signup, with IP), storefront search log, and coupon usage — all date-filterable
- ✅ Customer storefront: home (hero + recent + featured rails), `/products`,
  `/products/:slug` detail with TCGdex Card data (attacks, abilities, weaknesses, illustrator),
  `/buscar` search (substring + 4 sort modes), hover-preview overlay, condition pills, type icons
- ✅ Customer auth: magic link + password + Google, `profiles` table, `/account` page (`customerGuard`)
- ✅ Cart: anonymous localStorage + DB-backed for signed-in (with merge-on-sign-in),
  drawer + `/cart` page (list / grid views), stock validation at add time
- ✅ Coupons: PERCENTAGE + FIXED_ON_THRESHOLD, admin CRUD with soft-delete-with-undo,
  customer apply / remove with auto-revalidate on cart mutations
  (redemption deferred to the checkout plan)
- ✅ TCGdex endpoint configurable per environment + `npm run seed:dev` populates the dev catalog
- ✅ OpenCart → Supabase data import (`scripts/prepare-for-prod.mjs` — wipes
  transactional data and re-imports the active+in-stock OC catalog with TCGdex
  enrichment + OC's original list dates preserved)
- ⬜ Prod Supabase project + cutover
- ⬜ Checkout: `orders` + `coupon_redemptions` + `place_order` RPC + buyer info form + SINPE Móvil instructions
- ⬜ Customer order history
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
| `/` | Home | Hero + Recién llegadas + Destacadas rails |
| `/products` | CardList | Product grid (DB-backed, hover preview, condition + type badges) |
| `/products/:slug` | Detail | TCGdex Card data + price + add-to-cart |
| `/buscar` | SearchResults | URL-bound search (`q`) + sort (`relevance` / `price-asc` / `price-desc` / `recent`) |
| `/rifas` | Rifas | Raffles — Activas / Completadas tabs, buy entries, winner display |
| `/cart` | CartPage | Line items, quantity edit, list / grid views, coupon input, summary |
| `/account` | Account | Read-only email + editable name/phone + sign out (`customerGuard`) |
| `/admin` | AdminShell | Requires admin role; uses Google OAuth |
| `/admin/` | Dashboard | Admin home (default after `/admin`) |
| `/admin/products` | ProductsList | Paginated table with search + filters |
| `/admin/products/new` | AddProduct | TCGdex typeahead + set filter, image picker |
| `/admin/products/:id/edit` | ProductEdit | Quick-update card + full form |
| `/admin/categories` | Categories | Inline-edit CRUD |
| `/admin/card-types` | CardTypes | Inline-edit CRUD for the multi-tag taxonomy |
| `/admin/sets` | Sets | Expandable rows, find-or-create from TCGdex, detail dialog |
| `/admin/coupons` | Coupons | List with active/inactive/expired/deleted filters, soft-delete-with-undo |
| `/admin/coupons/new`, `/admin/coupons/:id/edit` | CouponEdit | Type-reactive form (PERCENTAGE / FIXED_ON_THRESHOLD), date picker |
| `/admin/raffles` | Raffles | Activas / Completadas toggle, "Agregar rifa" |
| `/admin/raffles/:id` | RaffleDetail | Participants + payment status, draw winner (blocked until paid), copy names for the wheel |
| `/admin/reports` | Reports | 4 tabs: customer orders, activity log, searches, coupon usage — date-filterable |
| `/admin/config` | AdminConfig | Exchange rate, maintenance mode |
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

## Self-hosting card images

The store can serve its own card art instead of hotlinking the TCGdex CDN
(`assets.tcgdex.net`). Two scripts download every image once and host them on
SiteGround under `/card-images/`:

- `npm run images:fetch` → `scripts/fetch-card-images.mjs` — download into a gitignored
  `./card-images/` (outside `dist/`, so a normal `deploy:*` can never sweep it up).
- `npm run images:upload` → `scripts/upload-images.mjs` — tar + SSH-extract to
  `<remote>/card-images`, reusing the same `.env.local` creds as deploy.

**Folder layout:** `card-images/<serie>/<set>/<localId>.webp`
(e.g. `card-images/swsh/swsh3/136.webp`). Reference images by **relative** path
(`/card-images/...`) so they keep resolving when `new.poke-singles.com` is later
promoted to the main domain.

### Run it

```bash
# 1. See exact set/card counts + size estimate (downloads nothing).
node scripts/fetch-card-images.mjs --dry-run

# 2. Download all English sets (~1.5–2.5 GB). Resumable — re-run to fill gaps / retry.
npm run images:fetch

# 3. Upload: dry-run to confirm the target, then ship.
node scripts/upload-images.mjs --dry-run
npm run images:upload
```

When a new set is released later, fetch and upload just that set:

```bash
node scripts/fetch-card-images.mjs --sets=ME05
node scripts/upload-images.mjs --sets=ME05
```

### Flags

**`fetch-card-images.mjs`**

| Flag | Effect |
|---|---|
| `--dry-run` | List + size estimate, write nothing |
| `--sets=a,b` | Only these TCGdex set IDs (the "new set" path) |
| `--series=a,b` | Only sets in these serie IDs |
| `--quality=high\|low` | Card quality (default `high`) |
| `--ext=webp\|png\|jpg` | Image format (default `webp`) |
| `--logos` | Also download each set's logo + symbol |
| `--concurrency=8` / `--out=./card-images` | Parallelism / output root |

**`upload-images.mjs`**

| Flag | Effect |
|---|---|
| `--dry-run` | Show target + file count, connect to nothing |
| `--endpoints-only` | Push only `server/*.php` (picker endpoints) — no image tree, no tar. Fast (`npm run images:upload:endpoints`) |
| `--sets=a,b` | Upload only those set subtrees |
| `--env=dev\|prod` | Which `.env.local` creds + remote dir (default `dev`) |
| `--sftp` | Per-file SFTP instead of tar + extract (slower fallback) |

### Notes

- **Resumable & safe:** files that already exist (non-empty) are skipped; downloads write
  to `*.part` then rename, so an interrupted run never leaves a truncated "complete" file.
- **No DB writes.** Set `products.image_url` to the relative `/card-images/...` path
  yourself — the scripts never touch Supabase.
- Cards with no community scan are recorded in `card-images/missing-images.json` (not
  treated as failures); a set→serie name map is written to `card-images/_manifest.json`.
- **Target dir** defaults to `<DEV_DEPLOY_REMOTE_DIR>/card-images` (or
  `<DEPLOY_REMOTE_DIR>/card-images` with `--env=prod`); override with `IMAGES_REMOTE_DIR`
  in `.env.local`. The uploader refuses any path not ending in `/card-images`, so it can
  never write into the app root.
- Requires `tar` on PATH (built into Windows 10/11, macOS, Linux) for the default
  transport, and SSH access to SiteGround (already used by deploy).

## Cutover prep — OpenCart import

`scripts/prepare-for-prod.mjs` is the **single command** that prepares the
database for go-live: it wipes transactional data, then re-imports the
active+in-stock OpenCart catalog into the new schema with TCGdex enrichment
(attacks, abilities, illustrator, types, etc.) and OC's original listing
dates preserved.

Designed to be run repeatedly during development for iteration, and once on
cutover day. Targets the dev project via `SUPABASE_DEV_*` env vars (same
ones `seed-products.mjs` uses); the service-role key bypasses RLS so the
script is **dev-only** in its current form.

### Run it

```bash
# 1. Pull the OC dump from SiteGround phpMyAdmin → ./tmp/opencart-export.sql
#    (you want oc_product, oc_product_description, oc_product_to_category,
#     oc_category, oc_category_description — no filter; the script does its own)

# 2. Dry-run first — reports matches + unmatched, no DB writes
node scripts/prepare-for-prod.mjs --dry-run

# 3. Real run — wipes transactional tables, imports ~5k products
node scripts/prepare-for-prod.mjs
```

### What gets wiped vs. preserved

| Wiped (transactional / replaced) | Preserved (admin-curated) |
|---|---|
| `orders`, `order_items`, `coupon_redemptions` | `auth.users`, `profiles` |
| `carts`, `cart_items` | `categories`, `card_types`, `sets` |
| `products`, `product_card_types` | `coupons`, `shipping_methods`, `static_pages` |
| `tcgdex_cards` (re-populated by the importer) | `app_settings` |
| `raffles` (cascades from products) | |

Wipe order is dependency-safe (`orders` first → cascades `order_items` and
`coupon_redemptions`; `products` cascades `product_card_types`, `cart_items`,
and `raffles`).

### Pipeline per OC product

1. **Filter** to `status = 1 AND quantity > 0` (matches OC's storefront visibility).
2. **Parse title** for pokemon name + card number (`Pikachu V - 043/185 - Ultra Rare`).
3. **Resolve set + card-types from categories** via `scripts/_data/oc-category-map.json`
   (OC category ID → TCGdex set code + `card_types` names). Pick the leaf-most
   set tag when a product is in both a parent group and a specific set.
4. **Match TCGdex card** by `localId` in the resolved set, then fetch the full
   Card payload for attacks / illustrator / regulation mark / types / legal status.
5. **Build product row** — TCGdex enrichment + OC's price (rounded to ₡100),
   quantity, `first_listed_at` from `oc_product.date_added`, `variant`
   derived from any Reverse-Holo / Holográficas card-type.
6. **In-process slug claim** — synchronous `Set<slug>` claim prevents the
   8-parallel batches from racing on duplicate inserts when OC has two
   listings for the same TCGdex card.
7. **Insert + attach card-types** — `tcgdex_cards` upsert (cache),
   `products` insert, `product_card_types` junction inserts.
8. **Unmatched** → `.tmp/opencart-unmatched.csv` with reason
   (`not-a-single` / `no-set-category` / `title-unparseable` /
   `no-card-in-set`). Triage by hand via `/admin/products/new` or by
   extending the category map.

Expected match rate on the current OC dump: **~95 %** of active+in-stock rows.
Leftovers are mostly sealed products, accessories, Topps, energies without
a card number, and a long tail of typo'd titles.

### Flags

| Flag | Effect |
|---|---|
| _(default)_ | Wipe transactional tables → import (full prod-prep cycle) |
| `--dry-run` | Report only; no wipe, no DB writes, no TCGdex card fetches |
| `--no-wipe` | Skip the wipe; import-only (incremental adds, skip-on-existing-slug) |
| `--limit=N` | Cap at N active+in-stock rows (useful with `--no-wipe` for testing) |
| `--input=...` | Alternate dump path (default `.tmp/opencart-export.sql`) |

### Files

| Path | Role |
|---|---|
| `scripts/prepare-for-prod.mjs` | The importer + wipe driver |
| `scripts/_data/oc-category-map.json` | OC category ID → TCGdex set code / `card_types` name / skip list (built from the dump; keyed by ID so OC label edits don't break it) |
| `.tmp/opencart-export.sql` | Your phpMyAdmin dump (gitignored) |
| `.tmp/opencart-unmatched.csv` | Written each run; rows that couldn't be matched, with reason |

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

**Schema:**

- **Catalog:** `categories`, `sets`, `products`, `card_types` + `product_card_types`
  junction, `tcgdex_cards` (JSONB cache of the TCGdex Card payload), `app_settings`.
- **Customer:** `profiles` (1:1 with `auth.users`, auto-created via the
  `handle_new_user` trigger), `cart_items` (PK `(user_id, product_id)`),
  `carts` (1 row per user; currently holds `coupon_id`).
- **Coupons:** `coupons` (`PERCENTAGE` / `FIXED_ON_THRESHOLD`, soft-delete via
  `deleted_at`). Customers access via three RPCs (`security definer`,
  search_path-locked): `validate_coupon`, `calculate_coupon_discount`,
  `get_my_applied_coupon`. `coupon_redemptions` is intentionally deferred to
  the orders/checkout plan.
- **Search:** `products_search` view (joins products + sets + aggregated card
  types into a `search_text` column; `description` excluded) plus the
  `search_products(q, sort, limit_n, offset_n)` RPC behind `/buscar`.
- **Raffles:** `raffles` (1:1 with a Rifas-category product — draw date + winner
  result). Public `/rifas` via the `rifas_listing` view; admin draw via
  `draw_raffle` (blocked until entries are paid, weighted by entries) +
  `admin_raffles_summary` RPC; winner emails via the `send-raffle-result` edge
  function.
- Triggers: `updated_at`, `first_listed_at`, restock tracking, `pokemon_name`
  normalization. RLS: admin-only mutations gated by `is_admin()` (reads
  `auth.jwt → app_metadata.role`); customer-self policies on `profiles` /
  `cart_items` / `carts`.

`scripts/seed-products.mjs` populates the dev catalog from TCGdex (~1500 cards
across the latest SwSh + SV sets) — see `npm run seed:dev{,:clean}`.

**Still pending:**

- Prod Supabase project — when ready, fill in `environment.prod.ts` with prod creds
  and replace the `<prod-ref>` placeholders in `package.json` (4 of them: `db:types:prod`,
  `db:push:prod`, `functions:prod` — note `db:types` already uses the linked project)
- Orders + checkout (`orders`, `coupon_redemptions`, `place_order` RPC,
  buyer-info form, SINPE Móvil instructions) — cart and coupon validation are
  live, redemption needs the commitment event

## Repo layout

```
src/                          Angular app (see CLAUDE.md → Project layout)
scripts/deploy.mjs            SiteGround SFTP deploy
scripts/seed-products.mjs     Seed the dev catalog from TCGdex
scripts/prepare-for-prod.mjs  Wipe transactional data + import OC catalog (cutover prep)
scripts/_data/                Static lookup tables (OC category → TCGdex set/card-type map)
scripts/fetch-card-images.mjs Download TCGdex card images → ./card-images/
scripts/upload-images.mjs     Upload ./card-images/ to SiteGround
supabase/                     Scaffolded; migrations + functions empty
brand-guidelines.html         Design system spec — open in browser
.env.local.example            Template for SFTP creds (copy to .env.local)
CLAUDE.md                     Deeper notes for working in this repo with Claude Code
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
