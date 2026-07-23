---
name: deploy
description: >-
  Deployment, environments, and hosting for Poke-Singles on SiteGround. Use this whenever you
  deal with shipping the app or its assets: `npm run deploy:dev`/`deploy:prod`, the
  `scripts/deploy.mjs` SFTP uploader and its flags, the auto-generated SPA-fallback `.htaccess`,
  the two-tier (local/dev/prod) environment model and `environment*.ts` files, the deploy
  safety guard that protects the parked OpenCart backup folder, self-hosting card images
  (`images:fetch`/`images:upload`), and the no-Node SiteGround constraint (SPA-only, SSG later).
  Trigger this for anything about where builds go, how `.env.local` creds work, or why a deploy
  is refused. Read this before running or modifying any deploy/hosting command.
---

# Deploy, environments & hosting (SiteGround)

SiteGround Shared/Cloud runs Apache + PHP with **no Node**, so the app ships as a
**client-rendered SPA**. (SSG via `ng add @angular/ssr` + `getPrerenderParams()` is feasible
later — deferred until product-page SEO matters; only Dedicated Servers support true SSR.)

## Deploy commands

```bash
npm run deploy:dev    # ng build --configuration=dev  + SFTP upload to dev.poke-singles.com
npm run deploy:prod   # ng build --configuration=production + SFTP upload to poke-singles.com
```

`scripts/deploy.mjs` reads `.env.local` (gitignored — copy from `.env.local.example`) for the
SiteGround SFTP creds and uploads `dist/poke-singles/browser/`. Prod uses the unprefixed env
vars (`DEPLOY_HOST`, `DEPLOY_USER`, …); dev uses the `DEV_`-prefixed counterparts. Auth is SSH
key (preferred) or password.

**Flags:**
- `--only=code|assets|all` (default `all`) — `code` skips the `assets/` subtree (useful once the
  ~5k product images stabilize so iterations don't re-upload them).
- `--skip-build` — re-upload an existing `dist/`.
- `--dry-run` — list files without uploading (run this first).

## `.htaccess` (auto-written)

The script writes the `.htaccess` at the upload root automatically — no manual file
management. Since the cutover it carries three rule blocks (see `HTACCESS_BODY` in
`scripts/deploy.mjs`): a www→apex 301 (host-conditioned, inert on dev.), a legacy-OpenCart
301 (`index.php` → `/`, query dropped — a fuller per-route 301 map is a tracked follow-up),
and the SPA fallback so deep links (`/products/<slug>`) reload to `index.html`.

## Deploy safety guard (do not weaken casually)

Post-cutover (2026-07-22) the live root at `poke-singles.com/public_html` **is** this app, so
`deploy:prod` targets it on purpose with real creds in `.env.local`. The
`BLOCKED_REMOTE_PATHS` regex array in `scripts/deploy.mjs` now protects
`public_html_opencart` — the renamed OpenCart site, kept as the rollback/backup until
decommission (rollback = swap the two folder renames back over SSH). Never deploy into it.

## Two-tier environment model (post 2026-07 prod promotion)

| Tier | Frontend | Supabase | Selected by |
|---|---|---|---|
| Local | `npm start` (localhost:4242) | `fdscdinfpmvswinpasdg` (dev-poke-singles, free org) | `environment.ts` |
| Dev | `dev.poke-singles.com` (Basic-auth) | `fdscdinfpmvswinpasdg` (dev) | `ng build --configuration=dev` (no file replacement) |
| Prod | `poke-singles.com` (**live since 2026-07-22**, maintenance mode during the restock window) | `dhslfridsjdmhwzrgebv` (the original project, **promoted to prod**; Pro org) | `ng build --configuration=production` (`fileReplacements` → `environment.prod.ts`) |

Both environment files carry real values now. **`dhslfridsjdmhwzrgebv` = PROD** — never treat it
as dev. The CLI stays linked to the dev project (`db:push:dev`); prod migration pushes go through
`npm run db:push:prod` (a wrapper requiring `SUPABASE_PROD_DB_URL` in `.env.local`, deliberate by
design). `new.poke-singles.com` (the old staging site) is being retired; `proxy.conf.mjs` targets
`dev.poke-singles.com` for localhost images (switched 2026-07-14 — the stale `new.` PHP gate
rejected dev tokens). The free-tier dev project auto-pauses after ~1 week
idle — resume it from the dashboard if the dev site/e2e suddenly can't reach Supabase.

## Promotion flow (dev → prod, post-launch)

Gate every promotion with **`npm run preflight`** (unit tests + Playwright e2e vs dev +
prod build). Then by change type:

1. **Frontend-only**: preflight → `deploy:dev` → spot-check dev.poke-singles.com →
   `deploy:prod`.
2. **DB change**: migration → `db:push:dev` → `db:types:dev` → code → preflight →
   verify on dev → **`db:push:prod` BEFORE `deploy:prod`** (additive changes are safe for
   the old bundle in between; breaking renames land migration+code together — see the
   rename-sequencing rule).
3. **Edge functions**: `functions:dev` → exercise the flow on dev → `functions:prod`.
4. **Dashboard config** (auth URLs, secrets, templates, Vault): no git trail — change on
   dev, verify, mirror on prod. The out-of-migrations config checklist lives in
   `docs/architecture/environments-and-deploy.md`.

## Self-hosting card images

The store can serve its own card art instead of hotlinking the TCGdex CDN. Layout on the host:
`card-images/<serie>/<set>/<localId>.webp` (e.g. `card-images/swsh/swsh3/136.webp`). **Reference
images by relative path** (`/card-images/...`) so the same catalog rows resolve on every domain
(dev., the prod root, localhost via proxy). The tree lives on the `dev.` and prod docroots
(the full ~2 GB tree was server-side copied dev→prod at cutover — `cp -a` over SSH, not
re-uploaded from local; incremental set additions since then go up per-set with
`images:upload --env=prod --sets=<id>` — see the scanless-set runbook below).
`upload-images.mjs` stamps `auth-config.php`
per `--env` from the matching environment file so each site's PHP gate validates against its
own Supabase project.

```bash
node scripts/fetch-card-images.mjs --dry-run   # set/card counts + size estimate, downloads nothing
npm run images:fetch                            # download English sets → ./card-images/ (gitignored, ~1.5–2.5 GB, resumable)
npm run images:upload                           # tar + SSH-extract to <remote>/card-images (reuses .env.local creds)
npm run images:upload:endpoints                 # push server/*.php only (no image tree)
```

`./card-images/` lives outside `dist/`, so a normal `deploy:*` can never sweep it up. The PHP
picker endpoints that live alongside the images → `admin` skill.

### Scanless sets — the pokemontcg.io fallback

Some cards have **no scan on TCGdex** (`card.image` is null). `images:fetch` can still get them
from `images.pokemontcg.io` (PNG → webp via `sharp`, same `<serie>/<set>/<localId>.webp` path).
Two mechanisms in `fetch-card-images.mjs`, chosen by how the two sources' numbering relates:

- **`PTCGIO_FALLBACK_SETS`** (`tcgdexSetId → pokemontcgSetId`) — pokemontcg.io numbers the cards
  the *same* as the TCGdex localId, so the URL is a formula: `<ptcgioSet>/<localId>_hires.png`.
  Covers the five SWSH gallery subsets (`swsh9.5tg`, `swsh11.5tg`, `swsh12.5tg`, `swsh12.5gg`,
  `swsh4.5sv`) — fully scanless — and base **Celebrations** (`cel25`), which is scanned on TCGdex
  *except* localId 25 (Mew). The fallback fires per-card, so a mostly-scanned set with one gap
  costs exactly one fetch.
- **`PTCGIO_CARD_MAP`** (`tcgdexSetId → { ptcgioSet, cards: { localId → "<stem>" } }`) —
  pokemontcg.io numbers them *differently*, so there's no formula; the URL is
  `<ptcgioSet>/<stem>_hires.png`. Covers **Celebrations Classic Collection** (TCGdex `cel25cc` →
  pokemontcg.io `cel25c`): localIds are clean `CC001…CC025`, but pokemontcg.io reuses each card's
  *original* number, disambiguates duplicates with a letter suffix (four "15"s → `15_A…15_D`), and
  spells some names differently (`Mewtwo EX`/`Mewtwo-EX`, the `δ`/`☆` glyphs) — so the stems are
  pinned **by name**, card by card.

Anything still without a scan lands in `card-images/missing-images.json`.

**Adding a new scanless set (runbook).** When a card shows a broken image:
1. Confirm TCGdex genuinely has no scan — `image` is absent on the *individual* card resource
   (`api.tcgdex.net/v2/en/cards/<id>`), not just the brief set listing (which omits `image`).
2. Find it on pokemontcg.io (`api.pokemontcg.io/v2/cards?q=set.id:<id>`). Numbers match the
   TCGdex localIds 1:1 → add a `PTCGIO_FALLBACK_SETS` entry. Numbers diverge → add a
   `PTCGIO_CARD_MAP` entry, matching cards **by name** (normalize — names differ in punctuation/
   glyphs), and **verify every mapped URL returns 200** before trusting the map (a wrong match =
   a wrong card image on a possibly-valuable single).
3. `node scripts/fetch-card-images.mjs --sets=<tcgdexSetId>` → files land under
   `card-images/<serie>/<set>/`.
4. Push to prod — **from PowerShell** (Git Bash's GNU tar chokes on the `C:\` archive path;
   Windows `tar` handles it): `node scripts/upload-images.mjs --env=prod --sets=<id>`. `--sets`
   touches only those subtrees and skips the PHP endpoints. **Gotcha:** the uploader resolves
   `--sets` via `card-images/_manifest.json`, which each targeted `images:fetch` *overwrites* to
   only that run's sets — so `fetch` the exact set list you're about to `upload` in one go, or the
   uploader silently skips sets missing from the manifest.
5. Verify: `curl -sI https://poke-singles.com/card-images/<serie>/<set>/<localId>.webp` → 200.

No DB change is needed — `prepare-for-prod.mjs` already writes the `/card-images/...` path into
`products.image_url` at import time (even for scanless cards, via `hostedImagePathFor`); the
fallback just fills in the file the path already points at.
