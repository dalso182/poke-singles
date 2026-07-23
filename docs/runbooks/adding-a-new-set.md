# Runbook — Adding a new TCG set

What to do when a new Pokémon TCG set releases and you want it sellable on the site.
Verified against source on **2026-07-22** (worked example: `me05` "Pitch Black",
released 2026-07-17; scanless-set fallbacks re-verified against `cel25`/`cel25cc`).

## TL;DR

A normal new set needs **zero code changes**. The only mandatory manual step is
fetching + uploading its card images. Everything else (set row, typeaheads, storefront
filter) self-heals as products are added.

| Area | Manual or automatic? |
|---|---|
| Cards searchable in add-product card typeahead | Automatic — live TCGdex API |
| `sets` table row | Automatic on first product add (`findOrCreateFromTcgdex`) |
| Set in add-product Set field + storefront Set filter | Automatic once the row / in-stock products exist |
| Self-hosted card images under `/card-images/…` | **Manual** — `images:fetch` + `images:upload` with `--sets=` |
| Per-set code mapping | None, unless the set has no TCGdex scans (see edge cases) |

## Steps

### 1. Confirm TCGdex has the set + scans

Find the set id (lowercase, e.g. `me05`, `sv08`) and check its cards carry `image` fields:

```
curl https://api.tcgdex.net/v2/en/sets/<setId>
```

Every card should have `"image": "https://assets.tcgdex.net/en/<serie>/<set>/<localId>"`.
Spot-check one asset resolves (note `localId` is used verbatim — recent sets zero-pad it,
e.g. `.../me/me05/001/high.webp`). If cards have **no** `image` field, see edge cases below.

### 2. Fetch the images locally

```
node scripts/fetch-card-images.mjs --sets=<setId>
```

Downloads into `./card-images/<serie>/<set>/<localId>.webp`. Resumable — re-run to pick up
stragglers. Cards without scans are logged to `card-images/missing-images.json`.
Optional: add `--dry-run` first to see the count/size, `--logos` for the set logo + symbol.

### 3. Upload to SiteGround

```
node scripts/upload-images.mjs --sets=<setId>            # dev domain (default)
node scripts/upload-images.mjs --sets=<setId> --env=prod # prod, after cutover
```

**Run from PowerShell, not Git Bash** — the tarball transport uses Windows tar; Git Bash's
GNU tar chokes on `C:\` archive paths. The script only ever writes under
`<remote>/card-images`, so this is safe alongside normal deploys.

Until this step is done, products from the set show "Imagen no encontrada en el servidor
todavía" in admin previews and broken images on the storefront — the DB `image_url` is
written at card-pick time regardless.

### 4. Set row — usually nothing to do

Three ways the `sets` row appears; any one is enough:

- **Just add the first product** — `SetsService.findOrCreateFromTcgdex()`
  (`src/app/core/catalog/sets.service.ts`) hydrates and inserts the set the moment a card
  from it is picked in add-product. This is the normal path.
- `/admin/config` → **"Importar histórico de sets de TCGdex"** — bulk-syncs every missing
  set (skips the `Pokémon TCG Pocket` serie, never overwrites admin edits).
- `/admin/sets` → "Agregar set manual" — last resort / offline fallback.

The `code` column is immutable by convention (slugs and TCGdex lookups key on it) — don't
rename it after products exist.

The row is **runtime data written per-environment, not a migration** — so dev and prod are
populated independently and can drift (e.g. `cel25cc` reached prod via the import but was
never on dev). To close a gap, run the bulk sync (or add a product) on whichever environment
is behind — don't reach for a migration. Migrations touch `sets` only for cross-env cleanups
that must be identical everywhere (e.g. `20260502010000_remove_tcg_pocket_sets.sql`).

### 5. Add products

`/admin/products/new` as usual. The card typeahead queries TCGdex live, so the new set's
cards are searchable with no setup. Picking a card caches its payload in `card_details`
and sets `image_url` to the hosted relative path.

### 6. Storefront — automatic

The Set filter on `/buscar` and `/products` hides zero-count sets; the new set appears as
soon as it has ≥1 active, in-stock, priced product (`search_set_counts` /
`set_product_counts` RPCs). Nothing to configure.

## Edge cases

- **Set with no TCGdex scans** — the SWSH-era gallery subsets (Trainer / Galarian
  Gallery, Shiny Vault), base **Celebrations**' lone Mew (`cel25` #25), and the whole
  **Celebrations Classic Collection** (`cel25cc`). Two fallbacks in
  `scripts/fetch-card-images.mjs`, chosen by how pokemontcg.io numbers the cards:
  - **numbers match the TCGdex localId 1:1** → add a `<tcgdexSetId>: '<pokemontcgIoSetId>'`
    entry to `PTCGIO_FALLBACK_SETS`. Fires per scanless card, so a mostly-scanned set with a
    single gap (like `cel25`, only Mew #25 missing) costs one fetch.
  - **numbers diverge** (original card numbers, duplicate-number letter suffixes, different
    name spellings) → add a `PTCGIO_CARD_MAP` entry mapping each localId to its pokemontcg.io
    image stem **by name**, and **verify every mapped URL returns 200** before trusting it
    (`cel25cc` is the worked example: `CC001…CC025` → stems like `4_A`, `15_A…15_D`).

  Then rerun steps 2–3; the script transcodes pokemontcg.io PNGs to webp at the same hosted
  path. Full mechanism + runbook: `deploy` skill → "Self-hosting card images."
- **Gallery subsets in the typeahead**: merging a base set with its gallery subset is
  name-suffix based (`card-typeahead.ts`) and fully generic — no per-set entry needed.
- **Scanless cards in the typeahead**: the add-product card search takes its option
  thumbnail from TCGdex; when a card has no TCGdex scan, `card-typeahead.ts` falls back to
  the self-hosted `/card-images/…` copy (serie resolved via a memoized `fetch('sets', …)`).
  So the picker shows art for these sets only once step 3 has uploaded their images to the
  environment you're testing on.
- **Sparse set row** (nulls in series/release_date): TCGdex hydration failed transiently
  at insert time. `printed_total` self-heals on the next card pick; fix the rest in
  `/admin/sets`.
- **Pokémon TCG Pocket** sets are deliberately excluded from bulk sync (`EXCLUDED_SERIES`
  in `sets.service.ts`) — they'd still auto-create via a card pick, so don't add their
  cards as products.

## Related docs

- [screens/admin/sets](../screens/admin/sets.md) — the `/admin/sets` screen + `SetsService`
- [screens/admin/add-product](../screens/admin/add-product.md) — typeaheads, subset merge, image path wiring
- [screens/admin/config](../screens/admin/config.md) — the bulk import button
- [architecture/environments-and-deploy](../architecture/environments-and-deploy.md) — card-image hosting + scripts
