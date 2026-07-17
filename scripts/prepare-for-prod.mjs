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
//   node scripts/prepare-for-prod.mjs --no-singles        — import only accessories/sealed (skip the singles path)
//   node scripts/prepare-for-prod.mjs --limit=50          — process first 50 active+in-stock rows
//   node scripts/prepare-for-prod.mjs --input=.tmp/x.sql  — alternate dump path
//
// Auth: reads SUPABASE_DEV_URL + SUPABASE_DEV_SERVICE_ROLE_KEY from .env.local
// (same vars as seed-products.mjs). The service role key bypasses RLS — DEV ONLY.
//
// Singles are TCGdex-matched and enriched. Accessories + sealed products take a
// separate path: routed by OC category to the `accesorios` / `sellado` category,
// tagged with one sub-type (card_types row scoped to that category — accessory
// sub-type from the OC sub-category, sealed sub-type derived from the title), and
// their OC product image is downloaded into card-images/<accesorios|sellado>/ so
// it survives the domain cutover (ship it with `npm run images:upload`).
//
// Inputs:
//   .tmp/opencart-export.sql           — phpMyAdmin dump (oc_product, oc_product_description,
//                                        oc_product_to_category, oc_category, oc_category_description)
//   scripts/_data/oc-category-map.json — OC category id → set code / card-type / nonSingles / skip
//
// Outputs:
//   .tmp/opencart-unmatched.csv        — rows that couldn't be imported (with reason)
//   card-images/<accesorios|sellado>/  — downloaded OC product images (relative paths)

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
// Import only accessories/sealed (skip the TCGdex singles path). Pairs with
// --no-wipe to (re)import just the non-singles slice without touching singles.
const NO_SINGLES = ARGS.includes('--no-singles');
function argVal(prefix, fallback) {
  const a = ARGS.find((x) => x.startsWith(prefix));
  return a ? a.slice(prefix.length) : fallback;
}
const INPUT_PATH = path.resolve(REPO_ROOT, argVal('--input=', '.tmp/opencart-export.sql'));
const MAP_PATH = path.resolve(REPO_ROOT, 'scripts/_data/oc-category-map.json');
const UNMATCHED_PATH = path.resolve(REPO_ROOT, '.tmp/opencart-unmatched.csv');
const LIMIT = Number(argVal('--limit=', String(Number.MAX_SAFE_INTEGER)));

// Where accessory/sealed OC images come from and land. Base is overridable for
// the cutover (e.g. once the OC site moves) via OC_IMAGE_BASE in .env.local.
const OC_IMAGE_BASE =
  (process.env.OC_IMAGE_BASE || 'https://poke-singles.com/image/').replace(/\/+$/, '') + '/';
const CARD_IMAGES_ROOT = path.resolve(REPO_ROOT, 'card-images');

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
// The app version also appends a consignment seller-code part; OpenCart imports
// have no seller, so that part is intentionally absent here.
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

// Hosted path for a matched card. Falls back to building it from ids when the
// card has no TCGdex scan (the SWSH gallery subsets) — the serie id isn't on
// the card payload, so it comes from a memoized set lookup. The file itself is
// fetched from pokemontcg.io by scripts/fetch-card-images.mjs.
const serieIdCache = new Map();
async function hostedImagePathFor(card, setCode) {
  const fromUrl = tcgdexImageToHostedPath(card.image);
  if (fromUrl) return fromUrl;
  if (!card.localId) return '';
  if (!serieIdCache.has(setCode)) {
    const full = await tcgdex.set.get(setCode).catch(() => null);
    serieIdCache.set(setCode, full?.serie?.id ?? null);
  }
  const serieId = serieIdCache.get(setCode);
  return serieId ? `/card-images/${serieId}/${setCode}/${card.localId}.webp` : '';
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
  // We capture id (1), model (2) — OC stored card condition here — quantity (10),
  // image (12), price (15), status (28), date_added (30), and date_modified (31).
  const pStart = sql.indexOf('INSERT INTO `oc_product` (');
  const pEnd = sql.indexOf('-- --------------------------------------------------------', pStart);
  const pBlock = sql.slice(pStart, pEnd);
  const products = new Map();
  const prodRe = new RegExp(
    [
      String.raw`\((\d+),`,                                              // 1  id
      String.raw`\s*'([^']*)',`,                                         // 2  model (condition)
      String.raw`\s*'[^']*',\s*'[^']*',\s*'[^']*',`,                     // 3-5  sku/upc/ean
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
      String.raw`\s*'([^']*)'`,                                          // 31 date_modified
    ].join(''),
    'g',
  );
  // OC dates are local time, no zone. Treat as UTC — we only need a stable
  // ordering hint, not millisecond accuracy. `'0000-00-00 00:00:00'` is OC's
  // "no value" sentinel and must become null.
  const ocDateToIso = (raw) =>
    raw && raw !== '0000-00-00 00:00:00' ? new Date(raw.replace(' ', 'T') + 'Z').toISOString() : null;
  let m;
  while ((m = prodRe.exec(pBlock))) {
    products.set(+m[1], {
      id: +m[1],
      model: m[2],
      quantity: +m[3],
      image: m[4],
      price: parseFloat(m[5]),
      status: +m[6],
      date_added: ocDateToIso(m[7]),
      date_modified: ocDateToIso(m[8]),
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

// OC stored condition in oc_product.model. Canonical storefront tokens are
// NM / LP / MP / HP / DMG (see CONDITION_OPTIONS in catalog.types.ts). Anything
// outside that set in the dump — `Graded`, `NA`, `TEST`, `Variada`,
// `Opened`/`Unopened` (those land on non-singles anyway), blank, whitespace —
// falls back to NM, which matches the prior hardcoded default and keeps
// storefront condition filters intact.
const CONDITION_MAP = { NM: 'NM', LP: 'LP', MP: 'MP', HP: 'HP', DM: 'DMG', DMG: 'DMG' };
function normalizeCondition(raw) {
  const key = (raw ?? '').trim().toUpperCase();
  return CONDITION_MAP[key] ?? 'NM';
}

// ---- Mapping load ---------------------------------------------------------

function loadMap() {
  const raw = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
  // `nonSingles` keys are OC category ids; drop the `_comment` doc key.
  const nonSingles = new Map(
    Object.entries(raw.nonSingles ?? {})
      .filter(([k]) => /^\d+$/.test(k))
      .map(([k, v]) => [+k, v]),
  );
  return {
    sets: new Map(Object.entries(raw.sets).map(([k, v]) => [+k, v])),
    cardTypes: new Map(Object.entries(raw.cardTypes).map(([k, v]) => [+k, v])),
    nonSingles,
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

// ---- Non-singles (accessories / sealed) -----------------------------------

// When a product carries several accessory tags, prefer a specific sub-type over
// the catch-all "Otros"; a product in only the bare Accesorios parent → "Otros".
const ACC_SUBTYPE_PRIORITY = [
  'Protectores', 'Sleeves', 'Deckboxes', 'Playmats',
  'Dados', 'Pines', 'Figuras', 'Monedas', 'Otros',
];
function pickAccessorySubtype(subtypes) {
  if (subtypes.length === 0) return 'Otros';
  for (const pref of ACC_SUBTYPE_PRIORITY) if (subtypes.includes(pref)) return pref;
  return subtypes[0];
}

// OC keeps all sealed products under one flat category, so the sub-type is read
// from the title. Order matters — match the most specific phrase first. A bare
// "Box" that's neither an ETB nor a Booster Box is treated as a Collection
// (e.g. "<Pokémon> ex Box").
const SEALED_SUBTYPE_RULES = [
  [/elite trainer box|\betb\b/i, 'ETB'],
  [/booster box/i, 'Booster Box'],
  [/ultra premium collection|\bupc\b/i, 'UPC'],
  [/\bcollection\b/i, 'Collection'],
  [/\bdeck\b/i, 'Deck'],
  [/booster|blister|\bpack\b/i, 'Booster'],
  [/\bbox\b/i, 'Collection'],
];
function sealedSubtypeFromTitle(name) {
  for (const [re, label] of SEALED_SUBTYPE_RULES) if (re.test(name)) return label;
  return null;
}

// Resolve a product's OC categories to a non-singles target, or null if it's not
// an accessory / sealed product. Any accessory tag wins over a sealed tag (a
// product shouldn't carry both, but be deterministic if it does).
function resolveNonSingle(productCats, map, name) {
  const hits = [...productCats].map((c) => map.nonSingles.get(c)).filter(Boolean);
  if (hits.length === 0) return null;
  if (hits.some((h) => h.category === 'accesorios')) {
    const subtypes = hits.filter((h) => h.category === 'accesorios' && h.subtype).map((h) => h.subtype);
    return { category: 'accesorios', subtype: pickAccessorySubtype(subtypes) };
  }
  return { category: 'sellado', subtype: sealedSubtypeFromTitle(name) };
}

async function fileHasBytes(p) {
  try {
    const s = await fs.promises.stat(p);
    return s.isFile() && s.size > 0;
  } catch {
    return false;
  }
}

// Download an OC product image into card-images/<categorySlug>/<ocId><ext> and
// return its relative /card-images/... path (relative so it survives the domain
// cutover). Idempotent (skips files already on disk) and best-effort (returns
// null on failure so the product still imports, just without an image). Dry-run
// computes the path but downloads nothing.
async function fetchOcProductImage(storedPath, ocId, categorySlug) {
  if (!storedPath) return { path: null, status: 'no-image' };
  const ext = (path.extname(storedPath) || '.jpg').toLowerCase();
  const rel = `/card-images/${categorySlug}/${ocId}${ext}`;
  if (DRY_RUN) return { path: rel, status: 'dry-run' };
  const target = path.join(CARD_IMAGES_ROOT, categorySlug, `${ocId}${ext}`);
  if (await fileHasBytes(target)) return { path: rel, status: 'cached' };
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  const url = OC_IMAGE_BASE + storedPath.split('/').map(encodeURIComponent).join('/');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 404) return { path: null, status: 'missing' };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) throw new Error('empty body');
      const tmp = `${target}.part`;
      await fs.promises.writeFile(tmp, buf);
      await fs.promises.rename(tmp, target);
      return { path: rel, status: 'downloaded' };
    } catch (err) {
      if (attempt === 2) return { path: null, status: 'failed', error: err?.message ?? String(err) };
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  return { path: null, status: 'failed' };
}

// ---- DB helpers -----------------------------------------------------------

async function loadSetsByCode() {
  const { data, error } = await supabase.from('sets').select('id, code, name');
  if (error) abort(`Failed to load sets: ${error.message}`);
  return new Map((data ?? []).map((s) => [s.code, s]));
}

// Load card_types split into the global Rareza tags (category_id null, keyed by
// name — used by the singles path) and the category-scoped sub-types (keyed by
// `${category_id}::${name}` — used by the accessories/sealed path).
async function loadCardTypes() {
  const { data, error } = await supabase.from('card_types').select('id, name, category_id');
  if (error) abort(`Failed to load card_types: ${error.message}`);
  const global = new Map();
  const scoped = new Map();
  for (const t of data ?? []) {
    if (t.category_id) scoped.set(`${t.category_id}::${t.name}`, t);
    else global.set(t.name, t);
  }
  return { global, scoped };
}

async function getCategoryIdBySlug(slug) {
  const { data, error } = await supabase
    .from('categories')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (error) abort(`Failed to look up category ${slug}: ${error.message}`);
  if (!data) abort(`No \`${slug}\` category in DB. Create it via /admin/categories first.`);
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
  console.log(`[prep] mode:    ${DRY_RUN ? 'DRY-RUN' : 'WRITE'}${WIPE ? ' + WIPE' : ' (no-wipe)'}${NO_SINGLES ? ' [non-singles only]' : ''}`);
  console.log(`[prep] input:   ${INPUT_PATH}`);
  console.log(`[prep] limit:   ${LIMIT}`);

  const map = loadMap();
  console.log(
    `[prep] map: ${map.sets.size} sets, ${map.cardTypes.size} card-types, ` +
      `${map.nonSingles.size} non-singles, ${map.skip.size} skip`,
  );

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

  const categoryIdBySlug = {
    singles: await getCategoryIdBySlug('singles'),
    accesorios: await getCategoryIdBySlug('accesorios'),
    sellado: await getCategoryIdBySlug('sellado'),
  };
  const singlesId = categoryIdBySlug.singles;
  const setsByCode = await loadSetsByCode();
  const { global: globalCardTypes, scoped: scopedCardTypes } = await loadCardTypes();
  console.log(
    `[prep] DB: ${setsByCode.size} sets, ${globalCardTypes.size} global card_types, ` +
      `${scopedCardTypes.size} scoped sub-types`,
  );

  // Resolve a scoped sub-type id by category slug + name (null when absent).
  const subtypeId = (categorySlug, name) =>
    name ? scopedCardTypes.get(`${categoryIdBySlug[categorySlug]}::${name}`)?.id ?? null : null;

  // Sanity check: every global cardTypes value in the map must exist in card_types
  const missingCT = [...new Set(map.cardTypes.values())].filter((n) => !globalCardTypes.has(n));
  if (missingCT.length) {
    abort(`Map references card_types not in DB: ${missingCT.join(', ')}`);
  }
  // Every accessory sub-type in the map + every sealed label the title-parser can
  // emit must exist as a scoped card_type, or the junction insert would no-op.
  const SEALED_LABELS = ['ETB', 'Booster', 'Booster Box', 'Deck', 'Collection', 'UPC'];
  const accSubtypeNames = [...new Set(
    [...map.nonSingles.values()].filter((v) => v.category === 'accesorios').map((v) => v.subtype).filter(Boolean),
  )];
  const missingSub = [
    ...accSubtypeNames.filter((n) => !subtypeId('accesorios', n)),
    ...SEALED_LABELS.filter((n) => !subtypeId('sellado', n)),
  ];
  if (missingSub.length) {
    abort(`Map/title-parser references sub-types not in DB: ${missingSub.join(', ')}`);
  }
  const missingSets = [...new Set(map.sets.values())].filter((c) => !setsByCode.has(c));
  if (missingSets.length) {
    console.warn(`[prep] WARN: ${missingSets.length} mapped set codes not yet in DB; will hydrate from TCGdex on demand: ${missingSets.join(', ')}`);
  }

  const stats = {
    inserted: 0,
    insertedAccessory: 0,
    insertedSealed: 0,
    sealedNoSubtype: 0,
    imageMisses: 0,
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

    // Accessories / sealed take a separate path — no TCGdex match. Checked first
    // so a product also tagged in a set category (e.g. an ETB's sleeves) doesn't
    // get mis-imported as a single.
    const nonSingle = resolveNonSingle(cats, map, p.name);
    if (nonSingle) {
      const slug = computeSlug({ name: p.name });
      if (!slug) {
        stats.failed++;
        unmatched.push({ id: p.id, name: p.name, reason: 'empty-slug', details: nonSingle.category });
        return;
      }
      // Identical OC listings collapse to one product (same claim-and-skip the
      // singles path uses), which keeps re-runs idempotent.
      if (claimedSlugs.has(slug)) {
        stats.skippedDuplicate++;
        return;
      }
      claimedSlugs.add(slug);

      if (DRY_RUN) {
        if (nonSingle.category === 'accesorios') stats.insertedAccessory++;
        else stats.insertedSealed++;
        if (nonSingle.category === 'sellado' && !nonSingle.subtype) {
          stats.sealedNoSubtype++;
          unmatched.push({ id: p.id, name: p.name, reason: 'sealed-no-subtype', details: 'needs manual sub-type' });
        }
        return;
      }

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

      const img = await fetchOcProductImage(p.image, p.id, nonSingle.category);
      if (img.status === 'failed' || img.status === 'missing') {
        stats.imageMisses++;
        console.warn(`[prep] image ${img.status} for OC#${p.id}: ${p.image}${img.error ? ` (${img.error})` : ''}`);
      }

      const { data: inserted, error: insErr } = await supabase
        .from('products')
        .insert({
          slug,
          name: p.name,
          category_id: categoryIdBySlug[nonSingle.category],
          set_id: null,
          language: 'EN',
          price: Math.max(0, Math.round(p.price / 100) * 100),
          quantity: p.quantity,
          image_url: img.path,
          ...(p.date_added ? { first_listed_at: p.date_added } : {}),
          // Preserve OC's last-touched date so admin sort-by-restocked reflects
          // real shop history. The track-restock trigger respects a non-null
          // value on INSERT (migration 20260526000000); null falls back to now().
          last_restocked_at: p.date_modified ?? p.date_added ?? null,
        })
        .select('id')
        .single();
      if (insErr) {
        stats.failed++;
        console.warn(`[prep] insert failed for ${slug}: ${insErr.message}`);
        return;
      }

      const stId = subtypeId(nonSingle.category, nonSingle.subtype);
      if (stId) {
        const { error: ctErr } = await supabase
          .from('product_card_types')
          .insert({ product_id: inserted.id, card_type_id: stId });
        if (ctErr) console.warn(`[prep] sub-type insert failed for ${slug}: ${ctErr.message}`);
      } else if (nonSingle.category === 'sellado') {
        stats.sealedNoSubtype++;
        unmatched.push({ id: p.id, name: p.name, reason: 'sealed-no-subtype', details: 'imported without sub-type' });
      }

      if (nonSingle.category === 'accesorios') stats.insertedAccessory++;
      else stats.insertedSealed++;
      return;
    }

    if (NO_SINGLES) return; // --no-singles: import only accessories/sealed

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
      image_url: (await hostedImagePathFor(card, resolved.setCode)) || null,
      set_id: setRow.id,
      category_id: singlesId,
      // OC stored per-card condition in `model` — normalize to the canonical
      // NM/LP/MP/HP/DMG set (anything unrecognised → NM, matching the prior
      // hardcoded default).
      condition: normalizeCondition(p.model),
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
      // Preserve OC's original listing date (date_added) and last-touched date
      // (date_modified) so /products sort-by-recent and admin sort-by-restocked
      // reflect real shop history rather than the import run timestamp. The
      // first_listed pin trigger is BEFORE UPDATE only, so the value sticks on
      // INSERT; the track-restock trigger respects a non-null last_restocked_at
      // on INSERT (migration 20260526000000) and falls back to now() when null.
      ...(p.date_added ? { first_listed_at: p.date_added } : {}),
      last_restocked_at: p.date_modified ?? p.date_added ?? null,
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
        .map((name) => globalCardTypes.get(name))
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
  console.log(`[prep] inserted (singles):   ${stats.inserted}`);
  console.log(`[prep] inserted (accesorios):${stats.insertedAccessory}`);
  console.log(`[prep] inserted (sellado):   ${stats.insertedSealed}`);
  console.log(`[prep]   sealed w/o sub-type: ${stats.sealedNoSubtype}`);
  console.log(`[prep]   image misses:        ${stats.imageMisses}`);
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
