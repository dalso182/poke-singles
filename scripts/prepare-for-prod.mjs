// Prepare the database for the prod cutover: wipe transactional data, then
// re-import the active+in-stock OpenCart catalog from the MySQL dump at
// .tmp/opencart-export.sql.
//
// Intended to be run once on go-live day (and as many times as needed during
// development to iterate). Default mode is destructive — everything in the
// wiped tables below is gone.
//
// Wiped (in dependency order):
//   - orders, order_items, coupon_redemptions  (test order data)
//   - carts, cart_items                        (in-progress shopping)
//   - products, product_card_types, raffles    (raffles cascades on products.id)
//   - card_details                             (re-populated by importer)
//
// Preserved:
//   - auth.users + profiles                    (admin login lives here)
//   - categories, card_types, sets             (taxonomies)
//   - coupons, shipping_methods, static_pages  (admin-curated content)
//   - app_settings                             (exchange rate, notification recipients)
//
// Usage:
//   node scripts/prepare-for-prod.mjs                     — wipe + import (DEFAULT)
//   node scripts/prepare-for-prod.mjs --dry-run           — report only, no DB writes / no TCGdex card fetches
//   node scripts/prepare-for-prod.mjs --no-wipe           — skip the wipe; import-only (incremental testing)
//   node scripts/prepare-for-prod.mjs --limit=50          — process first 50 active+in-stock rows
//   node scripts/prepare-for-prod.mjs --input=.tmp/x.sql  — alternate dump path
//
// Auth: reads SUPABASE_DEV_URL + SUPABASE_DEV_SERVICE_ROLE_KEY from .env.local
// (same vars as seed-products.mjs). The service role key bypasses RLS — DEV ONLY.
//
// Inputs:
//   .tmp/opencart-export.sql           — phpMyAdmin dump (oc_product, oc_product_description,
//                                        oc_product_to_category, oc_category, oc_category_description)
//   scripts/_data/oc-category-map.json — OC category id → set code / card-type / skip
//
// Outputs:
//   .tmp/opencart-unmatched.csv        — rows that couldn't be imported (with reason)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import TCGdex from '@tcgdex/sdk';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(REPO_ROOT, '.env.local') });

// ---- CLI -----------------------------------------------------------------

const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes('--dry-run');
const WIPE = !ARGS.includes('--no-wipe');
function argVal(prefix, fallback) {
  const a = ARGS.find((x) => x.startsWith(prefix));
  return a ? a.slice(prefix.length) : fallback;
}
const INPUT_PATH = path.resolve(REPO_ROOT, argVal('--input=', '.tmp/opencart-export.sql'));
const MAP_PATH = path.resolve(REPO_ROOT, 'scripts/_data/oc-category-map.json');
const UNMATCHED_PATH = path.resolve(REPO_ROOT, '.tmp/opencart-unmatched.csv');
const LIMIT = Number(argVal('--limit=', String(Number.MAX_SAFE_INTEGER)));

function abort(msg) {
  console.error(`[prep] ${msg}`);
  process.exit(1);
}

// ---- Env -----------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_DEV_URL;
const SUPABASE_KEY = process.env.SUPABASE_DEV_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  abort('Missing SUPABASE_DEV_URL or SUPABASE_DEV_SERVICE_ROLE_KEY in .env.local.');
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
const tcgdex = new TCGdex('en');

// ---- Helpers --------------------------------------------------------------

function unescapeSql(s) {
  return s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/&amp;/g, '&');
}

// Strip back-references the TCGdex SDK adds to card objects when you fetch a
// whole set: every `card.tcgdex` points at the SDK client (and `card.set.tcgdex`
// too), which makes the object JSON-incompatible. We only want the data fields
// — the detail page reads attacks / abilities / etc from this payload.
function sanitizeCard(card) {
  return JSON.parse(JSON.stringify(card, (key, value) => (key === 'tcgdex' ? undefined : value)));
}

// Mirrors src/app/admin/add-product/add-product.ts:computeSlug() and the seed script.
function computeSlug({ name, cardNumber, setCode, variant, condition, language }) {
  const langSuffix = language && language !== 'EN' ? language : '';
  const parts = [name, cardNumber, setCode, variant, condition, langSuffix].filter(Boolean);
  return parts
    .join('-')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Mirrors src/app/core/images/card-image-url.ts.
const TCGDEX_ASSET_RE = /^https?:\/\/assets\.tcgdex\.net\/[^/]+\/(.+)$/i;
function tcgdexImageToHostedPath(imageBase) {
  if (!imageBase) return '';
  const m = TCGDEX_ASSET_RE.exec(imageBase.trim());
  return m ? `/card-images/${m[1]}.webp` : '';
}

async function inBatches(items, size, fn) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

// ---- Dump parsing ---------------------------------------------------------

function loadDump(sqlPath) {
  if (!fs.existsSync(sqlPath)) abort(`Dump file not found: ${sqlPath}`);
  const sql = fs.readFileSync(sqlPath, 'utf8');

  // oc_category — (id, 'image', parent_id, ...)
  const catStart = sql.indexOf('INSERT INTO `oc_category` (');
  const catEnd = sql.indexOf('-- --------------------------------------------------------', catStart);
  const catBlock = sql.slice(catStart, catEnd);
  const categories = new Map();
  for (const m of catBlock.matchAll(/\((-?\d+),\s*'([^']*)',\s*(\d+),/g)) {
    categories.set(+m[1], { id: +m[1], parent_id: +m[3] });
  }

  // oc_category_description — (cat_id, lang_id, 'name', ...) for English (lang=1)
  const dStart = sql.indexOf('INSERT INTO `oc_category_description`');
  const dEnd = sql.indexOf('-- --------------------------------------------------------', dStart);
  const dBlock = sql.slice(dStart, dEnd);
  for (const m of dBlock.matchAll(/\((-?\d+),\s*(\d+),\s*'([^']*)'/g)) {
    if (+m[2] !== 1) continue;
    const cat = categories.get(+m[1]);
    if (cat && !cat.name) cat.name = unescapeSql(m[3]);
  }

  // oc_product columns (full):
  //   1 product_id, 2 model, 3 sku, 4 upc, 5 ean, 6 jan, 7 isbn, 8 mpn, 9 location,
  //   10 quantity, 11 stock_status_id, 12 image, 13 manufacturer_id, 14 shipping,
  //   15 price, 16 points, 17 tax_class_id, 18 date_available, 19 weight,
  //   20 weight_class_id, 21 length, 22 width, 23 height, 24 length_class_id,
  //   25 subtract, 26 minimum, 27 sort_order, 28 status, 29 viewed, 30 date_added, 31 date_modified
  // We capture id (1), quantity (10), image (12), price (15), status (28), and date_added (30).
  const pStart = sql.indexOf('INSERT INTO `oc_product` (');
  const pEnd = sql.indexOf('-- --------------------------------------------------------', pStart);
  const pBlock = sql.slice(pStart, pEnd);
  const products = new Map();
  const prodRe = new RegExp(
    [
      String.raw`\((\d+),`,                                              // 1  id
      String.raw`\s*'[^']*',\s*'[^']*',\s*'[^']*',\s*'[^']*',`,          // 2-5
      String.raw`\s*'[^']*',\s*'[^']*',\s*'[^']*',\s*'[^']*',`,          // 6-9
      String.raw`\s*(-?\d+),`,                                           // 10 quantity
      String.raw`\s*\d+,`,                                               // 11 stock_status_id
      String.raw`\s*'([^']*)',`,                                         // 12 image
      String.raw`\s*\d+,\s*\d+,`,                                        // 13-14
      String.raw`\s*([\d.]+),`,                                          // 15 price
      String.raw`\s*\d+,\s*\d+,`,                                        // 16-17
      String.raw`\s*'[^']*',`,                                           // 18 date_available
      String.raw`\s*[\d.]+,\s*\d+,`,                                     // 19-20
      String.raw`\s*[\d.]+,\s*[\d.]+,\s*[\d.]+,`,                        // 21-23
      String.raw`\s*\d+,\s*\d+,\s*\d+,\s*\d+,`,                          // 24-27
      String.raw`\s*(\d+),`,                                             // 28 status
      String.raw`\s*\d+,`,                                               // 29 viewed
      String.raw`\s*'([^']*)',`,                                         // 30 date_added
    ].join(''),
    'g',
  );
  let m;
  while ((m = prodRe.exec(pBlock))) {
    // date_added is OC's local time (no zone). Treat as UTC for storage — we
    // only want a stable ordering hint, not millisecond accuracy.
    const da = m[6];
    const dateAdded = da && da !== '0000-00-00 00:00:00' ? new Date(da.replace(' ', 'T') + 'Z').toISOString() : null;
    products.set(+m[1], {
      id: +m[1],
      quantity: +m[2],
      image: m[3],
      price: parseFloat(m[4]),
      status: +m[5],
      date_added: dateAdded,
    });
  }

  // oc_product_description — (product_id, lang_id, 'name', ...)
  const pdStart = sql.indexOf('INSERT INTO `oc_product_description`');
  const pdEnd = sql.indexOf('-- --------------------------------------------------------', pdStart);
  const pdBlock = sql.slice(pdStart, pdEnd);
  for (const m of pdBlock.matchAll(/\((\d+),\s*(\d+),\s*'((?:[^'\\]|\\.)*)'/g)) {
    if (+m[2] !== 1) continue;
    const p = products.get(+m[1]);
    if (p && !p.name) p.name = unescapeSql(m[3]);
  }

  // oc_product_to_category — (product_id, category_id)
  const cStart = sql.indexOf('INSERT INTO `oc_product_to_category`');
  // No "next section" marker reliably appears; scan to end of file.
  const cBlock = sql.slice(cStart);
  const p2c = new Map();
  for (const m of cBlock.matchAll(/\((\d+),\s*(\d+)\)/g)) {
    const pid = +m[1], cid = +m[2];
    if (!p2c.has(pid)) p2c.set(pid, new Set());
    p2c.get(pid).add(cid);
  }

  return { categories, products, p2c };
}

// ---- Title parsing --------------------------------------------------------

// Greedy first group so we keep "Bother-Bot" intact for "Team Rocket's Bother-Bot - 172/182 - Uncommon".
// Card-number group accepts plain numbers ("042"), promos ("SWSH090"), trainer-gallery
// ("TG01"), and shiny-vault style ("SV115"). The optional `/<total>` part also allows
// alphanumeric ("SV115/SV122", "RC6/RC32") since some sets use prefixed totals.
const TITLE_RE = /^(.+) - ([A-Za-z]*\d+\w*)(?:\/[A-Za-z0-9]+)? - (.+)$/;

function parseTitle(rawName) {
  const name = (rawName ?? '').trim();
  const m = TITLE_RE.exec(name);
  if (!m) return null;
  return { pokemonName: m[1].trim(), cardNumber: m[2], descriptors: m[3].trim() };
}

// ---- Mapping load ---------------------------------------------------------

function loadMap() {
  const raw = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
  return {
    sets: new Map(Object.entries(raw.sets).map(([k, v]) => [+k, v])),
    cardTypes: new Map(Object.entries(raw.cardTypes).map(([k, v]) => [+k, v])),
    skip: new Set(raw.skip),
  };
}

// Walk a product's categories: pick the deepest (leaf-most) category that has
// a sets mapping; collect every cardTypes match; flag if all the categories
// are in the skip set.
function resolveCategories(productCats, categories, map) {
  let setCode = null;
  let setCat = null;
  const cardTypes = new Set();
  let allSkipped = true;

  for (const cid of productCats) {
    if (!map.skip.has(cid)) allSkipped = false;
    if (map.sets.has(cid)) {
      // Prefer deepest (the one whose parent is also in the product's cats)
      const cat = categories.get(cid);
      if (!setCode || (setCat && cat && productCats.has(setCat.parent_id))) {
        // We're already on a set; replace only if our current set is a parent of the new one.
        if (setCode && setCat && cat && cat.parent_id !== setCat.id && setCat.parent_id !== cat.id) {
          // unrelated set tags coexist (rare); keep the first one
        } else {
          setCode = map.sets.get(cid);
          setCat = cat;
        }
      }
      if (!setCode) {
        setCode = map.sets.get(cid);
        setCat = cat;
      }
    }
    if (map.cardTypes.has(cid)) {
      cardTypes.add(map.cardTypes.get(cid));
    }
  }

  return { setCode, cardTypes: [...cardTypes], allSkipped };
}

// Pick the variant value used by computeSlug. Reverse takes precedence over
// holo so a "Reverse-Holo" product gets a unique slug even if it's also tagged
// Holográficas.
function variantFor(cardTypes) {
  if (cardTypes.includes('Reverse-Holo')) return 'reverse';
  if (cardTypes.includes('Holográficas')) return 'holo';
  return 'normal';
}

// ---- DB helpers -----------------------------------------------------------

async function loadSetsByCode() {
  const { data, error } = await supabase.from('sets').select('id, code, name');
  if (error) abort(`Failed to load sets: ${error.message}`);
  return new Map((data ?? []).map((s) => [s.code, s]));
}

async function loadCardTypesByName() {
  const { data, error } = await supabase.from('card_types').select('id, name');
  if (error) abort(`Failed to load card_types: ${error.message}`);
  return new Map((data ?? []).map((t) => [t.name, t]));
}

async function getSinglesCategoryId() {
  const { data, error } = await supabase
    .from('categories')
    .select('id')
    .eq('slug', 'singles')
    .maybeSingle();
  if (error) abort(`Failed to look up singles category: ${error.message}`);
  if (!data) abort('No `singles` category in DB. Create one via /admin/categories first.');
  return data.id;
}

// Hydrate a TCGdex set on cache miss and insert it. Mirrors
// SetsService.findOrCreateFromTcgdex() in the Angular app.
async function findOrCreateSet(code, setsByCode) {
  if (setsByCode.has(code)) return setsByCode.get(code);
  const full = await tcgdex.set.get(code).catch(() => null);
  if (!full) return null;
  const payload = {
    code: full.id,
    name: full.name,
    series: full.serie?.name ?? null,
    release_date: full.releaseDate ?? null,
    symbol_image_url: full.symbol ? `${full.symbol}.webp` : null,
    printed_total: full.cardCount?.official ?? null,
  };
  const { data, error } = await supabase
    .from('sets')
    .upsert(payload, { onConflict: 'code' })
    .select('id, code, name')
    .single();
  if (error) {
    console.warn(`[prep] could not insert set ${code}: ${error.message}`);
    return null;
  }
  setsByCode.set(code, data);
  return data;
}

// Cache full set payloads (cards keyed by localId) — one TCGdex request per set.
const setCardsCache = new Map();
async function getSetCards(code) {
  if (setCardsCache.has(code)) return setCardsCache.get(code);
  const full = await tcgdex.set.get(code).catch(() => null);
  if (!full || !Array.isArray(full.cards)) {
    setCardsCache.set(code, null);
    return null;
  }
  // Index by localId (case-insensitive) so "TG01" / "tg01" both match.
  const byLocalId = new Map();
  for (const c of full.cards) {
    const key = String(c.localId ?? '').toLowerCase();
    if (key) byLocalId.set(key, c);
  }
  setCardsCache.set(code, byLocalId);
  return byLocalId;
}

// Normalize a card-number string for TCGdex lookup. OC writes "042" / "42" /
// "SV105" / "TG01"; TCGdex's localId is usually the "natural" form ("42",
// "SV105", "TG01"). Try the raw value first, then the leading-zero-stripped form.
async function matchTcgdexCard(setCode, rawNumber) {
  const cards = await getSetCards(setCode);
  if (!cards) return null;
  const tries = new Set([rawNumber, rawNumber.replace(/^0+/, '')]);
  let resume = null;
  for (const t of tries) {
    const key = String(t).toLowerCase();
    if (cards.has(key)) {
      resume = cards.get(key);
      break;
    }
  }
  if (!resume) return null;
  // `set.get(...).cards[i]` is just a CardResume (id/name/image/localId). We
  // need the full Card to get attacks, illustrator, regulationMark, types,
  // category, stage, legal, etc — same approach the seed script uses.
  return (await tcgdex.fetch('cards', resume.id).catch(() => null)) ?? resume;
}

// ---- Main pipeline --------------------------------------------------------

// Bulk-delete every row in a table. PostgREST refuses an unfiltered DELETE so
// we use a never-matching predicate that still matches every row.
async function wipeTable(table, predicateColumn, sentinel) {
  const { error, count } = await supabase
    .from(table)
    .delete({ count: 'exact' })
    .neq(predicateColumn, sentinel);
  if (error) abort(`wipe ${table} failed: ${error.message}`);
  console.log(`[prep]   ${table.padEnd(22)} ${count ?? 0} rows`);
}

async function cleanSlate() {
  console.log('[prep] wiping transactional tables (dependency order)…');
  // 1. orders — order_items + coupon_redemptions both cascade.
  await wipeTable('orders', 'id', '00000000-0000-0000-0000-000000000000');
  // 2. carts — cart_items cascades from products too, but explicit is cheap.
  await wipeTable('cart_items', 'product_id', '00000000-0000-0000-0000-000000000000');
  await wipeTable('carts', 'user_id', '00000000-0000-0000-0000-000000000000');
  // 3. products — product_card_types cascades.
  await wipeTable('products', 'id', '00000000-0000-0000-0000-000000000000');
  // 4. card_details — safe now that no products reference it.
  // (raffles already cascaded away via ON DELETE CASCADE on raffles.product_id
  // when products were wiped above — no explicit step needed.)
  await wipeTable('card_details', 'card_ref', '__never__');
  console.log('[prep] wipe complete.');
}

async function main() {
  console.log(`[prep] target:  ${SUPABASE_URL}`);
  console.log(`[prep] mode:    ${DRY_RUN ? 'DRY-RUN' : 'WRITE'}${WIPE ? ' + WIPE' : ' (no-wipe)'}`);
  console.log(`[prep] input:   ${INPUT_PATH}`);
  console.log(`[prep] limit:   ${LIMIT}`);

  const map = loadMap();
  console.log(`[prep] map: ${map.sets.size} sets, ${map.cardTypes.size} card-types, ${map.skip.size} skip`);

  const dump = loadDump(INPUT_PATH);
  console.log(`[prep] dump: ${dump.products.size} products, ${dump.categories.size} categories, ${dump.p2c.size} product->cat groups`);

  // Active + in-stock filter — matches the OC storefront's visibility rule
  // (status = 1 AND quantity > 0). Rows without a name are dropped (no
  // product_description row in language 1 → probably broken in OC too).
  const inStock = [...dump.products.values()].filter(
    (p) => p.status === 1 && p.quantity > 0 && p.name,
  );
  console.log(`[prep] active+in-stock: ${inStock.length}`);

  if (WIPE) {
    if (DRY_RUN) {
      console.log('[prep] (dry-run) skipping wipe step');
    } else {
      await cleanSlate();
    }
  }

  const singlesId = await getSinglesCategoryId();
  const setsByCode = await loadSetsByCode();
  const cardTypesByName = await loadCardTypesByName();
  console.log(`[prep] DB: ${setsByCode.size} sets, ${cardTypesByName.size} card_types`);

  // Sanity check: every cardTypes value in the map must exist in card_types
  const missingCT = [...new Set(map.cardTypes.values())].filter((n) => !cardTypesByName.has(n));
  if (missingCT.length) {
    abort(`Map references card_types not in DB: ${missingCT.join(', ')}`);
  }
  const missingSets = [...new Set(map.sets.values())].filter((c) => !setsByCode.has(c));
  if (missingSets.length) {
    console.warn(`[prep] WARN: ${missingSets.length} mapped set codes not yet in DB; will hydrate from TCGdex on demand: ${missingSets.join(', ')}`);
  }

  const stats = {
    inserted: 0,
    skippedNotASingle: 0,
    skippedExisting: 0,
    skippedDuplicate: 0,
    skippedNoTitleMatch: 0,
    skippedNoSet: 0,
    skippedTcgdexMiss: 0,
    failed: 0,
  };
  const unmatched = []; // [{ id, name, reason, details }]
  // Synchronous slug-claim set: each worker claims a slug before attempting
  // the insert so two parallel workers (or two OC rows pointing at the same
  // TCGdex card) can't both race past the existence check. JS Set ops are
  // atomic within the event loop so this is race-free without a lock.
  const claimedSlugs = new Set();

  // 8 in parallel is enough — TCGdex set.get is cached, Supabase inserts are
  // small. Bump if dry-run gets boring.
  let processed = 0;
  await inBatches(inStock.slice(0, LIMIT), 8, async (p) => {
    processed++;
    if (processed % 250 === 0) console.log(`[prep]   ${processed}/${Math.min(inStock.length, LIMIT)} processed…`);

    const cats = dump.p2c.get(p.id) ?? new Set();
    const resolved = resolveCategories(cats, dump.categories, map);

    if (resolved.allSkipped || cats.size === 0) {
      stats.skippedNotASingle++;
      unmatched.push({ id: p.id, name: p.name, reason: 'not-a-single', details: `categories: ${[...cats].join(',')}` });
      return;
    }
    if (!resolved.setCode) {
      stats.skippedNoSet++;
      unmatched.push({ id: p.id, name: p.name, reason: 'no-set-category', details: `categories: ${[...cats].join(',')}` });
      return;
    }

    const parsed = parseTitle(p.name);
    if (!parsed) {
      stats.skippedNoTitleMatch++;
      unmatched.push({ id: p.id, name: p.name, reason: 'title-unparseable', details: `set=${resolved.setCode}` });
      return;
    }

    // Resolve / create the set row
    const setRow = await findOrCreateSet(resolved.setCode, setsByCode);
    if (!setRow) {
      stats.skippedTcgdexMiss++;
      unmatched.push({ id: p.id, name: p.name, reason: 'set-not-in-tcgdex', details: `set=${resolved.setCode}` });
      return;
    }

    // Match the TCGdex card
    const card = await matchTcgdexCard(resolved.setCode, parsed.cardNumber);
    if (!card) {
      stats.skippedTcgdexMiss++;
      unmatched.push({
        id: p.id,
        name: p.name,
        reason: 'no-card-in-set',
        details: `set=${resolved.setCode} number=${parsed.cardNumber}`,
      });
      return;
    }

    const variant = variantFor(resolved.cardTypes);
    const slug = computeSlug({
      name: card.name,
      cardNumber: card.localId ?? parsed.cardNumber,
      setCode: resolved.setCode,
      variant,
      condition: 'NM',
      language: 'EN',
    });

    if (DRY_RUN) {
      // Same in-process claim so dry-run dedupe stats match the real run.
      if (claimedSlugs.has(slug)) {
        stats.skippedDuplicate++;
        return;
      }
      claimedSlugs.add(slug);
      stats.inserted++;
      return;
    }

    // Claim the slug synchronously — beats both within-run parallel races and
    // two OC rows resolving to the same TCGdex card.
    if (claimedSlugs.has(slug)) {
      stats.skippedDuplicate++;
      return;
    }
    claimedSlugs.add(slug);

    // Skip-on-existing-slug (don't clobber prior seeds / manual entries)
    const { count, error: countErr } = await supabase
      .from('products')
      .select('id', { head: true, count: 'exact' })
      .eq('slug', slug);
    if (countErr) {
      stats.failed++;
      console.warn(`[prep] count failed for ${slug}: ${countErr.message}`);
      return;
    }
    if ((count ?? 0) > 0) {
      stats.skippedExisting++;
      return;
    }

    // Cache the full TCGdex payload so detail pages can read attacks etc.
    const { error: cacheErr } = await supabase
      .from('card_details')
      .upsert(
        { card_ref: card.id, data: sanitizeCard(card), fetched_at: new Date().toISOString() },
        { onConflict: 'card_ref' },
      );
    if (cacheErr) {
      stats.failed++;
      console.warn(`[prep] card_details upsert failed for ${card.id}: ${cacheErr.message}`);
      return;
    }

    const productRow = {
      slug,
      name: card.name,
      pokemon_name: card.category === 'Pokemon' ? card.name : null,
      rarity: card.rarity ?? null,
      card_number: card.localId ?? parsed.cardNumber,
      image_url: tcgdexImageToHostedPath(card.image) || null,
      set_id: setRow.id,
      category_id: singlesId,
      condition: 'NM',
      language: 'EN',
      variant,
      // Round to nearest ₡100 (most OC prices already are).
      price: Math.max(0, Math.round(p.price / 100) * 100),
      quantity: p.quantity,
      card_ref: card.id,
      illustrator: card.illustrator ?? null,
      regulation_mark: card.regulationMark ?? null,
      category: card.category ?? null,
      stage: card.stage ?? null,
      type1: card.types?.[0] ?? null,
      type2: card.types?.[1] ?? null,
      legal_standard: card.legal?.standard ?? null,
      legal_expanded: card.legal?.expanded ?? null,
      // Preserve OC's original listing date so /products sort-by-recent and
      // the home "Recent" rail reflect the real shop history, not the import
      // run timestamp. The pin trigger is BEFORE UPDATE only, so this sticks.
      ...(p.date_added ? { first_listed_at: p.date_added } : {}),
    };

    const { data: inserted, error: insErr } = await supabase
      .from('products')
      .insert(productRow)
      .select('id')
      .single();
    if (insErr) {
      stats.failed++;
      console.warn(`[prep] insert failed for ${slug}: ${insErr.message}`);
      return;
    }

    // Attach card types
    if (resolved.cardTypes.length) {
      const rows = resolved.cardTypes
        .map((name) => cardTypesByName.get(name))
        .filter(Boolean)
        .map((ct) => ({ product_id: inserted.id, card_type_id: ct.id }));
      if (rows.length) {
        const { error: ctErr } = await supabase.from('product_card_types').insert(rows);
        if (ctErr) console.warn(`[prep] product_card_types insert failed for ${slug}: ${ctErr.message}`);
      }
    }

    stats.inserted++;
  });

  // Write unmatched CSV
  fs.mkdirSync(path.dirname(UNMATCHED_PATH), { recursive: true });
  const csvLines = ['oc_product_id,name,reason,details'];
  for (const u of unmatched) {
    csvLines.push(
      [u.id, JSON.stringify(u.name), u.reason, JSON.stringify(u.details)].join(','),
    );
  }
  fs.writeFileSync(UNMATCHED_PATH, csvLines.join('\n'));
  console.log(`[prep] unmatched.csv: ${UNMATCHED_PATH} (${unmatched.length} rows)`);

  console.log('');
  console.log(`[prep] inserted:             ${stats.inserted}`);
  console.log(`[prep] skipped (existing):   ${stats.skippedExisting}`);
  console.log(`[prep] skipped (duplicate):  ${stats.skippedDuplicate}`);
  console.log(`[prep] skipped (not single): ${stats.skippedNotASingle}`);
  console.log(`[prep] skipped (no set):     ${stats.skippedNoSet}`);
  console.log(`[prep] skipped (title):      ${stats.skippedNoTitleMatch}`);
  console.log(`[prep] skipped (tcgdex):     ${stats.skippedTcgdexMiss}`);
  console.log(`[prep] failed:               ${stats.failed}`);
}

main().catch((err) => {
  console.error('[prep] FATAL:', err);
  process.exit(1);
});
