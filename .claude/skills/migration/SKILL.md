---
name: migration
description: >-
  The OpenCart 3.0 → Supabase data migration and cutover prep for Poke-Singles. Use this
  whenever you work on importing the legacy catalog: `scripts/prepare-for-prod.mjs` (the
  wipe-and-import driver), the OpenCart category map (`scripts/_data/oc-category-map.json`),
  the title-parsing / TCGdex-matching pipeline, the dev seeder (`scripts/seed-products.mjs`),
  unmatched-row triage, and the old→new URL / 301 redirect strategy. Trigger this for questions
  about how OpenCart products become Supabase rows, why a product didn't import, match rates, or
  cutover sequencing. For the destination schema and RLS, pair with the `database` skill.
---

# OpenCart → Supabase migration

The legacy store is **OpenCart 3.0**; the rebuild imports its active, in-stock catalog into
Supabase with TCGdex enrichment. The OpenCart site stays live until cutover.

## Dev seeding (not migration)

`scripts/seed-products.mjs` populates the **dev** catalog from TCGdex directly (~1500 cards
across recent SwSh + SV sets) — `npm run seed:dev` / `seed:dev:clean`. Use this for local/dev
data; use the importer below for real OpenCart data.

## Cutover import — `scripts/prepare-for-prod.mjs`

Wipes transactional tables, then re-imports the active+in-stock OpenCart catalog with TCGdex
enrichment, preserving OC's original list dates. Pipeline:

1. **Filter** to `status = 1 AND quantity > 0` (matches OC storefront visibility).
2. **Parse title** for pokemon name + card number (`Pikachu V - 043/185 - Ultra Rare`).
3. **Resolve set + card-types from categories** via `scripts/_data/oc-category-map.json`
   (OC category ID → TCGdex set code + `card_types` names). Pick the leaf-most set tag when a
   product is in both a parent group and a specific set.
4. **Match TCGdex card** by `localId` in the resolved set, then fetch the full Card payload
   (attacks, illustrator, regulation mark, types, legal status).
5. **Build product row** — TCGdex enrichment + OC price (rounded to ₡100), quantity,
   `first_listed_at` from `oc_product.date_added`, `variant` derived from any Reverse-Holo /
   Holográficas card-type.
6. **In-process slug claim** — a synchronous `Set<slug>` prevents the 8 parallel batches from
   racing on duplicate inserts when OC has two listings for the same TCGdex card.
7. **Insert + attach card-types** — `tcgdex_cards` upsert (cache), `products` insert,
   `product_card_types` junction inserts.
8. **Unmatched** → `.tmp/opencart-unmatched.csv` with a reason (`not-a-single` /
   `no-set-category` / `title-unparseable` / `no-card-in-set` / `sealed-no-subtype`). Triage by
   hand via `/admin/products/new` or by extending the category map.

### Non-singles branch (accessories + sealed)

Checked **before** the singles path (step 2 onward) so a product also tagged in a set category
(e.g. an ETB's sleeves) isn't mis-imported as a single. Driven by the `nonSingles` block in
`oc-category-map.json` (OC category ID → `{ category, subtype? }`):

- **Route** to the `accesorios` / `sellado` category; ignore any set tag.
- **Sub-type** = one `card_types` row scoped to that category (via `category_id`), attached
  through the same `product_card_types` junction the singles use. Accessory sub-type comes from
  the OC sub-category; **sealed sub-type is parsed from the title** (`sealedSubtypeFromTitle` —
  ETB / Booster Box / UPC / Collection / Deck / Booster, longest-match first, bare "Box"→Collection).
- **Image**: the OC product image is downloaded from `OC_IMAGE_BASE` (default
  `https://poke-singles.com/image/`) into `card-images/<accesorios|sellado>/<ocProductId>.<ext>`
  and stored as a **relative** `/card-images/...` path (survives the domain cutover). Best-effort:
  a failed/missing download just leaves `image_url` null. Ship the files with `npm run images:upload`.
- **No TCGdex / card columns**: `set_id`, `card_number`, `condition`, `rarity`, etc. stay null.
- **Dedup**: same slug-claim + skip-on-existing as singles, so duplicate OC listings collapse and
  re-runs are idempotent.

Expected match rate on the current OC dump: **~95%** of active+in-stock rows as singles, plus
~77 accessories/sealed via the non-singles branch. Remaining leftovers are Topps, energies
without a card number, and typo'd titles.

## Flags

| Flag | Effect |
|---|---|
| _(default)_ | Wipe transactional tables → import (full prod-prep cycle) |
| `--dry-run` | Report only; no wipe, no DB writes, no TCGdex fetches |
| `--no-wipe` | Skip the wipe; import-only (incremental adds, skip-on-existing-slug) |
| `--no-singles` | Import only accessories/sealed (skip the singles path); pair with `--no-wipe` to (re)import just that slice |
| `--limit=N` | Cap at N active+in-stock rows (pairs well with `--no-wipe` for testing) |
| `--input=...` | Alternate dump path (default `.tmp/opencart-export.sql`) |

## Files

| Path | Role |
|---|---|
| `scripts/prepare-for-prod.mjs` | Importer + wipe driver |
| `scripts/_data/oc-category-map.json` | OC category ID → TCGdex set code / `card_types` name / `nonSingles` (accesorios·sellado route + sub-type) / skip list (keyed by ID so OC label edits don't break it) |
| `.tmp/opencart-export.sql` | phpMyAdmin dump (gitignored) |
| `.tmp/opencart-unmatched.csv` | Written each run; unmatched rows + reason |
| `card-images/<accesorios\|sellado>/` | Downloaded OC product images for non-singles (relative paths; shipped via `images:upload`) |

## URL / 301 strategy

The current OpenCart site uses SEO-style URL aliases (its individual card pages aren't a major
traffic source today, but the static info/category pages rank). When product pages firm up,
**preserve the same slugs** in `/products/:slug` where possible; for any pattern that must
change, add 301 redirects via `.htaccess` on SiteGround. A full old→new 301 map is deferred
(out of scope until cutover).

Destination schema, RLS, and the catalog tables this writes into → `database` skill.
