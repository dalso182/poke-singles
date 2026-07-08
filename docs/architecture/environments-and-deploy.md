# Environments & deploy

> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose

Explains how the app is built, configured, and shipped: the two-tier environment model, the SFTP deploy pipeline and its live-site guard, the SiteGround hosting constraints that shape everything (no Node → SPA + Apache `.htaccess`), the self-hosted card-image pipeline, the offline seed/import scripts, and where the PHP image-picker endpoints get deployed.

## Scope

- **In scope:** `scripts/deploy.mjs`, `scripts/upload-images.mjs`, `scripts/fetch-card-images.mjs`, `scripts/fetch-pokemon-data.mjs`, `scripts/seed-products.mjs`, `scripts/prepare-for-prod.mjs` (documentation only — never executed by agents), `package.json` scripts, `src/environments/*`, `.env.local` conventions (documented from code + `.env.local.example`; the real file is never read), `proxy.conf.mjs`, `server/*.php` deployment.
- **Out of scope:** what the PHP endpoints do internally (→ admin image-picker screen docs), Supabase schema content (→ [data-model.md](./data-model.md)), OpenCart import matching logic details (→ migration workflow docs).

## Key files

| Concern | File |
|---|---|
| App deploy (SFTP) | `scripts/deploy.mjs` |
| Card-image download | `scripts/fetch-card-images.mjs` |
| Card-image upload + PHP endpoints | `scripts/upload-images.mjs` |
| Pokémon reference data | `scripts/fetch-pokemon-data.mjs` |
| Dev seeder | `scripts/seed-products.mjs` |
| Prod wipe-and-import | `scripts/prepare-for-prod.mjs` ⚠️ owner-run only |
| npm scripts | `package.json` |
| Dev/local environment | `src/environments/environment.ts` |
| Prod environment | `src/environments/environment.prod.ts` |
| Env template | `.env.local.example` (→ gitignored `.env.local`) |
| Local image proxy | `proxy.conf.mjs` |
| Image URL helpers | `src/app/core/images/card-image-url.ts` |
| PHP endpoints | `server/list-images.php`, `server/upload-image.php`, `server/create-folder.php`, `server/_supabase-auth.php`, `server/auth-config.php` |
| Edge Function config | `supabase/config.toml` (`verify_jwt` per function) |

## How it works

### SiteGround constraints

SiteGround Shared/Cloud runs **Apache + PHP with no Node.js**, so the app ships as a client-rendered SPA: a static `dist/poke-singles/browser/` upload plus a generated `.htaccess` for deep-link fallback. SSR is not configured; SSG is deferred. The only server-side code on the host is the handful of `server/*.php` endpoints for the admin image picker. SFTP on port **18765** with the hosting account's SSH user is the only supported transport.

### Two-tier environment model

`src/environments/environment.ts` is the **dev** tier — used by `npm start` (localhost) and `ng build --configuration=dev` (the `new.poke-singles.com` staging target). `angular.json`'s production configuration swaps it for `environment.prod.ts` via `fileReplacements`. Both files export:

```ts
{
  production: boolean,
  envName: 'dev' | 'prod',
  supabase: { url, anonKey },          // dev project dhslfridsjdmhwzrgebv
  tcgdex:   { endpoint },              // 'https://api.tcgdex.net/v2'; '' = SDK default
  images:   { listUrl: '/card-images/list-images.php' },  // '' disables the picker
}
```

As of this writing **`environment.prod.ts` still points at the dev Supabase project** (`https://dhslfridsjdmhwzrgebv.supabase.co`, anon key `sb_publishable_jsLP6YsmsjjVvEZ2JuCkwQ_DP_rWRHA`) with a `TODO: fill in Supabase URL + anon key when the prod project is created`. The prod Supabase placeholders (`<prod-ref>`) live in `package.json`'s `db:types:prod` / `functions:prod` scripts, not in the environment files. `images.listUrl` is deliberately root-relative so it's same-origin in production and rides the localhost proxy in dev.

### npm scripts (package.json)

| Script | Command / notes |
|---|---|
| `start` | `ng serve --port 4242` (Diego runs this himself — never kill/duplicate it) |
| `build` | `ng build` (production default) |
| `build:dev` / `build:prod` | explicit configurations |
| `watch` | `ng build --watch --configuration development` |
| `test` | `ng test` (vitest) |
| `deploy` | `node scripts/deploy.mjs` (defaults to `--env=prod`) |
| `deploy:dev` / `deploy:prod` | `node scripts/deploy.mjs --env=dev` / `--env=prod` |
| `db:types` | `npx --yes supabase gen types typescript --linked > src/app/core/supabase/database.types.ts` |
| `db:types:dev` | same but `--project-id dhslfridsjdmhwzrgebv` |
| `db:types:prod` | same but `--project-id <prod-ref>` (placeholder, not yet usable) |
| `db:push:dev` | `npx --yes supabase db push --linked` |
| `db:push:prod` | **currently identical** to `db:push:dev` (`--linked`) — placeholder until a prod project exists |
| `functions:dev` | `npx --yes supabase functions deploy --project-ref dhslfridsjdmhwzrgebv` |
| `functions:prod` | `… --project-ref <prod-ref>` (placeholder) |
| `seed:dev` / `seed:dev:clean` | `node scripts/seed-products.mjs [--clean]` |
| `images:fetch` | `node scripts/fetch-card-images.mjs` |
| `images:upload` | `node scripts/upload-images.mjs` |
| `images:upload:endpoints` | `node scripts/upload-images.mjs --endpoints-only` |

(`scripts/fetch-pokemon-data.mjs` and `scripts/prepare-for-prod.mjs` have **no npm aliases** — run directly with `node`, the latter by the owner only.)

### `scripts/deploy.mjs` — the app deploy

Flags: `--env=prod|dev` (default **prod**), `--only=code|assets|all` (default `all`), `--skip-build`, `--dry-run`.

Flow:

1. Loads `.env.local` explicitly via `dotenv` (plain `.env` is not read).
2. Runs `npx ng build --configuration=<production|dev>` unless `--skip-build`.
3. Resolves creds by env: **prod uses unprefixed keys, dev uses `DEV_`-prefixed keys**, so one `.env.local` holds both targets: `{DEV_}DEPLOY_HOST`, `{DEV_}DEPLOY_PORT` (default 18765), `{DEV_}DEPLOY_USER`, `{DEV_}DEPLOY_REMOTE_DIR`, and either `{DEV_}DEPLOY_PRIVATE_KEY_PATH` (+ optional `{DEV_}DEPLOY_PRIVATE_KEY_PASSPHRASE`) or `{DEV_}DEPLOY_PASSWORD`. Missing required keys abort with `Missing <NAME> in .env.local`.
4. **The live-site guard:** `assertRemoteAllowed()` rejects any remote dir matching `BLOCKED_REMOTE_PATHS = [/(^|\/)poke-singles\.com\/public_html\/?$/i]` — i.e. the legacy OpenCart root — with an explanatory error. To deploy there on cutover day, the blocklist itself must be edited. By convention (per CLAUDE.md) the prod creds in `.env.local` are also left blank, so both layers must be defeated deliberately.
5. `--only` modes: `all` uploads the whole `dist/poke-singles/browser/`; `code` skips the `assets/` subtree; `assets` uploads only `assets/` → `<remote>/assets` and **does not touch `.htaccess`**. `code` and `all` write the SPA-fallback `.htaccess` into the local build root before upload (`RewriteEngine On; RewriteCond %{REQUEST_FILENAME} !-f; !-d; RewriteRule ^ index.html [L]`, with a "generated by scripts/deploy.mjs — do not edit on the server" header).
6. Uploads with `ssh2-sftp-client`'s `uploadDir` (`useFastput: true`, `.DS_Store` filtered). No mirror-delete — stale hashed chunks accumulate on the server but are harmless.
7. `--dry-run` prints env/mode/target and the file count without connecting.

### Self-hosted card images

Product images are **self-hosted** to survive the `new.` → main-domain cutover: products store *relative* paths like `/card-images/<serie>/<set>/<localId>.webp`, resolved same-origin in production.

- **`scripts/fetch-card-images.mjs`** (`npm run images:fetch`) downloads TCGdex card scans into a local `./card-images/<serie>/<set>/<localId>.<ext>` tree. Flags: `--out=./card-images`, `--sets=a,b` (the "new set dropped" path), `--series=a,b`, `--quality=high|low` (default high), `--ext=webp|png|jpg` (default webp), `--lang=en`, `--concurrency=8`, `--logos` (set logos + symbols), `--dry-run`. Resumable (existing non-empty files skipped; `.part` + rename prevents truncated files); cards with no contributed scan are recorded in `card-images/missing-images.json`. Never touches Supabase.
- **`scripts/upload-images.mjs`** (`npm run images:upload`) ships that tree to SiteGround. Deliberately separate from `deploy.mjs`: it only ever writes under a `card-images` folder and **refuses any target not ending in `/card-images`**. Target = `IMAGES_REMOTE_DIR` if set, else `<{DEV_}DEPLOY_REMOTE_DIR>/card-images`; creds are the same `.env.local` keys as deploy (default `--env=dev`). Default transport is a single **tar.gz uploaded then extracted over SSH** (`--sftp` falls back to per-file uploadDir when remote tar is unavailable). Flags: `--dry-run`, `--sets=ME05` (upload just those subtrees, resolved via `card-images/_manifest.json` or folder scan), `--endpoints-only` (push ONLY `server/*.php`), `--no-php` (skip the PHP push; present in code though not in the header comment), `--env=prod`.
- **PHP endpoints ride along:** every `server/*.php` is globbed and fastPut into the **card-images root** on the server (e.g. `/new.poke-singles.com/public_html/card-images/list-images.php`). `list-images.php` is the read-only browser for the admin picker; `upload-image.php` / `create-folder.php` are admin-gated writes (`_supabase-auth.php` validates the `X-Supabase-Token` header against `GET /auth/v1/user` requiring `app_metadata.role === 'admin'`; `auth-config.php` holds the public Supabase URL + publishable key and must be edited when a prod project exists).
- **URL helpers** (`src/app/core/images/card-image-url.ts`): `tcgdexImageToHostedPath()` maps a TCGdex asset URL (`https://assets.tcgdex.net/en/swsh/swsh3/136`) to the hosted relative path (`/card-images/swsh/swsh3/136.webp`, prefix constant `CARD_IMAGES_PREFIX = '/card-images'`); `resolveHostedSrc()` absolutizes relative values against an origin for previews.
- **Localhost:** `proxy.conf.mjs` forwards `/card-images` from `ng serve` to `https://new.poke-singles.com`, attaching HTTP Basic credentials from `.env.local` (`IMAGES_HTTP_USER`, `IMAGES_HTTP_PASSWORD` — the staging site is site-password-protected). Missing creds just yield 401s on images locally, with a console warning.

### `.env.local` conventions

Gitignored; template at `.env.local.example`. Keys (verified from the scripts — the real file is never read by agents):

- Prod deploy: `DEPLOY_HOST`, `DEPLOY_PORT`, `DEPLOY_USER`, `DEPLOY_REMOTE_DIR`, `DEPLOY_PASSWORD` or `DEPLOY_PRIVATE_KEY_PATH`/`DEPLOY_PRIVATE_KEY_PASSPHRASE`.
- Dev deploy: same names with `DEV_` prefix.
- Images: `IMAGES_REMOTE_DIR` (optional override; must end in `/card-images`), `IMAGES_HTTP_USER`, `IMAGES_HTTP_PASSWORD` (localhost proxy).
- Offline scripts: `SUPABASE_DEV_URL`, `SUPABASE_DEV_SERVICE_ROLE_KEY` (service role **bypasses RLS — dev only, never in a browser bundle**), `OC_IMAGE_BASE` (optional; default `https://poke-singles.com/image/`, source of OpenCart accessory/sealed images for the importer).

### Seed & import scripts (offline, service-role)

- **`scripts/seed-products.mjs`** (`npm run seed:dev`, `seed:dev:clean`) — seeds the dev `products` table with real cards from TCGdex. Flags: `--clean` (DELETE FROM `products` + `card_details` first), `--sets=sv09,sv08` (override the auto-detected latest 4 physical sets), `--limit=500` (default cap), `--dry-run`. Auth via `SUPABASE_DEV_URL` + `SUPABASE_DEV_SERVICE_ROLE_KEY`.
- **`scripts/prepare-for-prod.mjs`** — ⚠️ **the wipe-and-import cutover driver. Destructive by default and run manually by the owner only; agents/automation must at most use `--dry-run`.** It wipes (in dependency order) `orders`, `order_items`, `coupon_redemptions`, `carts`, `cart_items`, `products`, `product_card_types`, `raffles`, `card_details`, preserving `auth.users`/`profiles`, taxonomies (`categories`, `card_types`, `sets`), `coupons`, `shipping_methods`, `static_pages`, and `app_settings` — then re-imports the active+in-stock OpenCart catalog from the MySQL dump at `.tmp/opencart-export.sql`, TCGdex-matching singles and routing accessories/sealed via `scripts/_data/oc-category-map.json` (their OC images are downloaded into `card-images/<accesorios|sellado>/` for shipping with `images:upload`). Flags: `--dry-run` (report only, no DB writes, no TCGdex fetches), `--no-wipe` (import-only), `--no-singles` (accessories/sealed only), `--limit=50`, `--input=.tmp/x.sql`. Unmatched rows land in `.tmp/opencart-unmatched.csv`. Same env vars as the seeder.

### Supabase workflow notes

Migrations are applied with `npm run db:push:dev` (linked CLI — not the MCP `apply_migration`, which drifts history). Type regen: `npm run db:types`. Edge Functions deploy with `npm run functions:dev`; per-function `verify_jwt` flags live in `supabase/config.toml` (`send-order-email`, `send-signup-email`, `send-raffle-result`, `price-check` are all `verify_jwt = false` because triggers/anon checkout invoke them).

## Contracts & conventions

- **Env selection is one flag**: `--env=prod|dev` chooses both the credential prefix (`DEV_` or none) and the Angular build configuration (`dev`/`production`). Prod is the *default* for `npm run deploy` and `deploy.mjs` without flags; images upload defaults to *dev*.
- **The live OpenCart root is doubly protected**: the `BLOCKED_REMOTE_PATHS` regex in `deploy.mjs` plus the leave-prod-creds-blank convention. Never weaken either outside an explicit cutover plan.
- **Image paths are relative by contract** (`/card-images/...`) — code that writes `products.image_url` from TCGdex data must go through `tcgdexImageToHostedPath()`, and the upload script may only write inside a `/card-images` directory.
- **`.htaccess` is generated** — never hand-edit it on the server; `code`/`all` deploys overwrite it, `assets` deploys leave it alone.
- Service-role keys live only in `.env.local` for offline Node scripts; browser bundles carry only the publishable anon key.
- `server/*.php` deploy automatically with `images:upload` (globbed), so new endpoints ship without script changes; `images:upload:endpoints` is the fast path for PHP-only changes.

## Gotchas / invariants

- **`environment.prod.ts` currently ships dev Supabase credentials** (explicit TODO in the file). A production build today would talk to the dev database. Cutover requires: create the prod project, fill `environment.prod.ts`, replace `<prod-ref>` in `package.json`, update `server/auth-config.php`, and point the Edge Function env vars at prod.
- **`db:push:prod` is a lie right now** — it is byte-identical to `db:push:dev` (both `--linked`); it pushes wherever the CLI link points.
- The deploy guard regex only blocks paths **ending** in `poke-singles.com/public_html` (optional trailing slash). A subdirectory like `.../poke-singles.com/public_html/new/` would pass the guard — the blocklist protects the root specifically.
- `npm run deploy` (no suffix) targets **prod**. Use `deploy:dev` habitually; the missing-creds failure is the usual safety net when prod keys are blank.
- `deploy.mjs` uses `uploadDir` without mirror-delete: removed files (old hashed bundles) persist remotely. Not harmful, but the remote is not an exact mirror.
- `upload-images.mjs`'s default tar transport requires `tar` locally and on the server; on failure re-run with `--sftp` (slower). `--no-php` exists in code but isn't listed in the script's usage header.
- `prepare-for-prod.mjs` default mode is **destructive** (wipe + import). Per project policy it is run manually by the owner; anything automated may only use `--dry-run`. It reads OC card *condition* from `oc_product.model` (NM/LP/MP/HP/DMG semantics).
- `proxy.conf.mjs` only affects `ng serve`; a deployed dev build never proxies. If local images 401, set `IMAGES_HTTP_USER`/`IMAGES_HTTP_PASSWORD` and restart `npm start` (do not kill the owner's running server on port 4242).
- `.env.local.example` shows `DEPLOY_REMOTE_DIR=/home/customer/www/poke-singles.com/public_html` — copying it verbatim creates a target the guard will (correctly) refuse; that's intentional friction, not a bug.

## Related docs

- [data-model.md](./data-model.md) — what `db:push` / `db:types` operate on
- [backend-rpcs-and-functions.md](./backend-rpcs-and-functions.md) — Edge Functions deployed by `functions:dev`
- [auth-and-roles.md](./auth-and-roles.md) — the `app_metadata.role === 'admin'` check the PHP gate reuses
- [theming.md](./theming.md) — build-time styles that ride the same bundle
- Screens: admin [add-product](../screens/admin/add-product.md) / [product-edit](../screens/admin/product-edit.md) (image picker consumers), [config](../screens/admin/config.md)
