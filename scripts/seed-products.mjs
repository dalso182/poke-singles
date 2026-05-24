// Seed the dev `products` table with real cards from TCGdex.
//
// Usage:
//   npm run seed:dev               — auto-detect latest 4 physical TCG sets, insert ~500 products
//   npm run seed:dev:clean         — wipe products + tcgdex_cards first, then seed
//
// Direct flags (without npm aliases):
//   node scripts/seed-products.mjs
//   ... --clean              — DELETE FROM products + tcgdex_cards before seeding
//   ... --sets=sv09,sv08     — override auto-detection (comma-separated TCGdex set codes)
//   ... --limit=500          — hard cap on inserts (default 500)
//   ... --dry-run            — log what would happen, no DB writes
//
// Auth: reads SUPABASE_DEV_URL + SUPABASE_DEV_SERVICE_ROLE_KEY from .env.local.
// The service role key bypasses RLS — DEV ONLY.

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import TCGdex, { Query } from '@tcgdex/sdk';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(REPO_ROOT, '.env.local') });

// ---- CLI parsing ---------------------------------------------------------

const ARGS = process.argv.slice(2);
const FLAG_SET = new Set(ARGS);
const CLEAN = FLAG_SET.has('--clean');
const DRY_RUN = FLAG_SET.has('--dry-run');

function argValue(prefix) {
  const a = ARGS.find((x) => x.startsWith(prefix));
  return a ? a.slice(prefix.length) : null;
}
const SETS_OVERRIDE = argValue('--sets=');
const LIMIT = Number(argValue('--limit=') ?? '500');

// ---- Env -----------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_DEV_URL;
const SUPABASE_KEY = process.env.SUPABASE_DEV_SERVICE_ROLE_KEY;

function abort(msg) {
  console.error(`[seed] ${msg}`);
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
  abort(
    'Missing SUPABASE_DEV_URL or SUPABASE_DEV_SERVICE_ROLE_KEY in .env.local. ' +
      'Copy from Supabase dashboard → Project Settings → API.'
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});
const tcgdex = new TCGdex('en');

// ---- Constants -----------------------------------------------------------

const EXCLUDED_SERIES = new Set(['Pokémon TCG Pocket']);

const PRICE_BUCKETS = {
  Common: 500,
  Uncommon: 1500,
  Rare: 3500,
  'Rare Holo': 5000,
  'Double rare': 12000,
  'Ultra Rare': 18000,
  'Illustration Rare': 25000,
  'Special Illustration Rare': 75000,
  'Hyper Rare': 50000,
  'Secret Rare': 35000,
};

// ---- Helpers -------------------------------------------------------------

function priceForRarity(rarity) {
  const base = PRICE_BUCKETS[rarity] ?? 2000;
  const jitter = 0.7 + Math.random() * 0.6; // ±30%
  return Math.round((base * jitter) / 100) * 100;
}

function randomQuantity() {
  return 1 + Math.floor(Math.random() * 4); // 1..4
}

// Mirrors src/app/admin/add-product/add-product.ts:computeSlug().
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

async function inBatches(items, size, fn) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

// ---- Pre-flight ----------------------------------------------------------

async function getSinglesCategoryId() {
  const { data, error } = await supabase
    .from('categories')
    .select('id')
    .eq('slug', 'singles')
    .maybeSingle();
  if (error) abort(`Failed to look up singles category: ${error.message}`);
  if (!data) {
    abort(
      'No `singles` category in DB. Create one via /admin/categories before seeding.'
    );
  }
  return data.id;
}

async function cleanSlate() {
  console.log('[seed] cleaning products + tcgdex_cards…');
  // Use a never-matching predicate so PostgREST allows the bulk delete.
  const r1 = await supabase
    .from('products')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (r1.error) abort(`Failed to clean products: ${r1.error.message}`);
  const r2 = await supabase
    .from('tcgdex_cards')
    .delete()
    .neq('tcgdex_id', '__never__');
  if (r2.error) abort(`Failed to clean tcgdex_cards: ${r2.error.message}`);
  console.log('[seed] cleaned.');
}

// ---- Set selection -------------------------------------------------------

async function pickSets() {
  if (SETS_OVERRIDE) {
    const codes = SETS_OVERRIDE.split(',').map((s) => s.trim()).filter(Boolean);
    console.log(`[seed] using set override: ${codes.join(', ')}`);
    const hydrated = [];
    for (const code of codes) {
      const set = await tcgdex.set.get(code).catch(() => null);
      if (!set) {
        console.warn(`[seed] WARNING: set ${code} not found on TCGdex, skipping`);
        continue;
      }
      hydrated.push(set);
    }
    return hydrated;
  }

  console.log('[seed] auto-detecting latest 4 physical sets…');
  const all = await tcgdex.set.list();
  // Hydrating ~250 sets in parallel hammers TCGdex; cap at 30 concurrent.
  const hydrated = [];
  await inBatches(all, 30, async (s) => {
    const full = await tcgdex.set.get(s.id).catch(() => null);
    if (full) hydrated.push(full);
  });
  const physical = hydrated
    .filter((s) => s.serie?.name && !EXCLUDED_SERIES.has(s.serie.name))
    .filter((s) => s.releaseDate)
    .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate))
    .slice(0, 4);
  console.log(
    `[seed] picked: ${physical.map((s) => `${s.id} (${s.releaseDate})`).join(', ')}`
  );
  return physical;
}

// ---- Set + card processing ----------------------------------------------

async function upsertSet(tcgdexSet) {
  const payload = {
    code: tcgdexSet.id,
    name: tcgdexSet.name,
    series: tcgdexSet.serie?.name ?? null,
    release_date: tcgdexSet.releaseDate ?? null,
    symbol_image_url: tcgdexSet.symbol ? `${tcgdexSet.symbol}.webp` : null,
    printed_total: tcgdexSet.cardCount?.official ?? null,
  };
  if (DRY_RUN) {
    console.log(`[seed] (dry-run) upsert set ${payload.code}`);
    return { id: '__dry-run__', code: payload.code };
  }
  const { data, error } = await supabase
    .from('sets')
    .upsert(payload, { onConflict: 'code' })
    .select('id, code')
    .single();
  if (error) abort(`Failed to upsert set ${payload.code}: ${error.message}`);
  return data;
}

async function processCard(card, setRow, singlesId, stats) {
  if (stats.inserted >= LIMIT) {
    stats.skippedLimit++;
    return;
  }

  if (!card.image) {
    stats.skippedNoImage++;
    return;
  }

  const slug = computeSlug({
    name: card.name,
    cardNumber: card.localId ?? '',
    setCode: setRow.code,
    variant: 'normal',
    condition: 'NM',
    language: 'EN',
  });

  if (!slug) {
    stats.skippedNoSlug++;
    return;
  }

  if (DRY_RUN) {
    stats.inserted++;
    return;
  }

  // Existence check — slug is unique on products, but we want to skip without
  // the noisy 23505 error in the logs on re-runs.
  const { count, error: countErr } = await supabase
    .from('products')
    .select('id', { head: true, count: 'exact' })
    .eq('slug', slug);
  if (countErr) {
    stats.failed++;
    console.warn(`[seed] count failed for ${slug}: ${countErr.message}`);
    return;
  }
  if ((count ?? 0) > 0) {
    stats.skippedExisting++;
    return;
  }

  const { error: cacheErr } = await supabase
    .from('tcgdex_cards')
    .upsert(
      {
        tcgdex_id: card.id,
        data: card,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'tcgdex_id' }
    );
  if (cacheErr) {
    stats.failed++;
    console.warn(`[seed] tcgdex_cards upsert failed for ${card.id}: ${cacheErr.message}`);
    return;
  }

  const product = {
    slug,
    name: card.name,
    pokemon_name: card.category === 'Pokemon' ? card.name : null,
    rarity: card.rarity ?? null,
    card_number: card.localId ?? null,
    image_url: `${card.image}/high.webp`,
    set_id: setRow.id,
    category_id: singlesId,
    condition: 'NM',
    language: 'EN',
    variant: 'normal',
    price: priceForRarity(card.rarity),
    quantity: randomQuantity(),
    tcgdex_id: card.id,
    illustrator: card.illustrator ?? null,
    regulation_mark: card.regulationMark ?? null,
    category: card.category ?? null,
    stage: card.stage ?? null,
    type1: card.types?.[0] ?? null,
    type2: card.types?.[1] ?? null,
    legal_standard: card.legal?.standard ?? null,
    legal_expanded: card.legal?.expanded ?? null,
  };

  const { error: insErr } = await supabase.from('products').insert(product);
  if (insErr) {
    stats.failed++;
    console.warn(`[seed] insert failed for ${slug}: ${insErr.message}`);
    return;
  }
  stats.inserted++;
}

async function processSet(tcgdexSet, singlesId, stats) {
  const setRow = await upsertSet(tcgdexSet);
  console.log(`[seed] set ${tcgdexSet.id} (${tcgdexSet.name}) — listing cards…`);

  const resumes = await tcgdex.card.list(
    Query.create().equal('set.id', tcgdexSet.id).paginate(1, 250)
  );
  console.log(`[seed]   ${resumes.length} card resumes`);

  await inBatches(resumes, 5, async (resume) => {
    if (stats.inserted >= LIMIT) return;
    const full = await tcgdex.fetch('cards', resume.id).catch((err) => {
      console.warn(`[seed]   fetch ${resume.id} failed: ${err?.message ?? err}`);
      return null;
    });
    if (!full) {
      stats.failed++;
      return;
    }
    await processCard(full, setRow, singlesId, stats);
  });
}

// ---- Main ----------------------------------------------------------------

async function main() {
  const startedAt = Date.now();
  console.log(`[seed] target: ${SUPABASE_URL}`);
  console.log(`[seed] mode: ${DRY_RUN ? 'DRY-RUN' : 'WRITE'}${CLEAN ? ' + CLEAN' : ''}`);
  console.log(`[seed] limit: ${LIMIT}`);

  const singlesId = await getSinglesCategoryId();
  console.log(`[seed] singles category id: ${singlesId}`);

  if (CLEAN) {
    if (DRY_RUN) {
      console.log('[seed] (dry-run) skipping clean step');
    } else {
      await cleanSlate();
    }
  }

  const sets = await pickSets();
  if (sets.length === 0) abort('No sets selected — nothing to seed.');

  const stats = {
    inserted: 0,
    skippedNoImage: 0,
    skippedExisting: 0,
    skippedLimit: 0,
    skippedNoSlug: 0,
    failed: 0,
  };

  for (const s of sets) {
    if (stats.inserted >= LIMIT) break;
    await processSet(s, singlesId, stats);
    console.log(
      `[seed]   running totals — inserted ${stats.inserted}, ` +
        `skip-no-image ${stats.skippedNoImage}, ` +
        `skip-existing ${stats.skippedExisting}, ` +
        `failed ${stats.failed}`
    );
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log('');
  console.log(`[seed] sets:                ${sets.map((s) => s.id).join(', ')}`);
  console.log(`[seed] inserted:            ${stats.inserted}`);
  console.log(`[seed] skipped (no image):  ${stats.skippedNoImage}`);
  console.log(`[seed] skipped (existing):  ${stats.skippedExisting}`);
  console.log(`[seed] skipped (no slug):   ${stats.skippedNoSlug}`);
  console.log(`[seed] skipped (over limit):${stats.skippedLimit}`);
  console.log(`[seed] failed:              ${stats.failed}`);
  console.log(`[seed] elapsed:             ${elapsed}s`);
}

main().catch((err) => {
  console.error('[seed] FATAL:', err);
  process.exit(1);
});
