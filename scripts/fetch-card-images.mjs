// Download every TCGdex card image into a local series/set folder tree, ready
// to upload to SiteGround (see scripts/upload-images.mjs) and self-host instead
// of hotlinking assets.tcgdex.net.
//
// Output layout (relative URLs survive the eventual domain cutover):
//   ./card-images/<serie>/<set>/<localId>.<ext>
//   e.g. ./card-images/swsh/swsh3/136.webp
//
// Usage:
//   npm run images:fetch                         — download ALL English sets
//   node scripts/fetch-card-images.mjs --dry-run — count sets/cards + size estimate, download nothing
//   node scripts/fetch-card-images.mjs --sets=ME05,sv01   — only these set IDs (the "new set dropped" path)
//   node scripts/fetch-card-images.mjs --series=swsh,sv   — only these series
//
// Flags:
//   --out=./card-images   output root (default ./card-images)
//   --sets=a,b            only these TCGdex set IDs (skips listing every set)
//   --series=a,b          only sets in these TCGdex serie IDs
//   --quality=high|low    card image quality (default high; logos/symbols have no quality)
//   --ext=webp|png|jpg    image extension (default webp)
//   --lang=en             TCGdex language (default en)
//   --concurrency=8       parallel downloads per set (default 8)
//   --logos               also download each set's logo + symbol
//   --dry-run             list + estimate, write nothing
//
// Resumable: a target file that already exists with non-zero size is skipped, so
// re-runs only fetch what's missing. Downloads are written to a .part file and
// renamed on success, so an interrupted run never leaves a truncated "complete" file.
//
// Cards with no contributed scan (no `image` field) are skipped and recorded in
// card-images/missing-images.json — except the SWSH gallery-subset sets (Trainer
// Gallery / Galarian Gallery / Shiny Vault), which TCGdex has no scans for at all:
// those fall back to images.pokemontcg.io (PNG, transcoded to --ext via sharp) and
// land at the same <serie>/<set>/<localId>.<ext> path. The run never touches Supabase.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile, rename, stat } from 'node:fs/promises';
import TCGdex from '@tcgdex/sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

// ---- CLI parsing ---------------------------------------------------------

const ARGS = process.argv.slice(2);
const FLAG_SET = new Set(ARGS);
const DRY_RUN = FLAG_SET.has('--dry-run');
const LOGOS = FLAG_SET.has('--logos');

function argValue(prefix, fallback = null) {
  const a = ARGS.find((x) => x.startsWith(prefix));
  return a ? a.slice(prefix.length) : fallback;
}
function listValue(prefix) {
  const raw = argValue(prefix);
  if (!raw) return null;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const OUT_DIR = path.resolve(REPO_ROOT, argValue('--out=', 'card-images'));
const SETS_FILTER = listValue('--sets=');
const SERIES_FILTER = listValue('--series=');
const QUALITY = argValue('--quality=', 'high');
const EXT = argValue('--ext=', 'webp');
const LANG = argValue('--lang=', 'en');
const CONCURRENCY = Math.max(1, Number(argValue('--concurrency=', '8')) || 8);

if (!['high', 'low'].includes(QUALITY)) abort(`invalid --quality=${QUALITY} (expected high|low)`);
if (!['webp', 'png', 'jpg'].includes(EXT)) abort(`invalid --ext=${EXT} (expected webp|png|jpg)`);

const tcgdex = new TCGdex(LANG);

// TCGdex gallery-subset sets with no scans on assets.tcgdex.net (0/N images).
// pokemontcg.io has them all and its card numbers match TCGdex localIds 1:1
// (GG04, TG01, SV001…). Values are the pokemontcg.io set ids. sma (Hidden Fates
// Shiny Vault) and the embedded swsh10 TG cards are covered by TCGdex already.
const PTCGIO_FALLBACK_SETS = {
  'swsh9.5tg': 'swsh9tg',
  'swsh11.5tg': 'swsh11tg',
  'swsh12.5tg': 'swsh12tg',
  'swsh12.5gg': 'swsh12pt5gg',
  'swsh4.5sv': 'swsh45sv',
};

// ---- Helpers -------------------------------------------------------------

function log(msg) {
  console.log(`[images] ${msg}`);
}
function abort(msg) {
  console.error(`[images] ${msg}`);
  process.exit(1);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Mirrors scripts/seed-products.mjs:inBatches — run `fn` over `items` with at
// most `size` in flight at once.
async function inBatches(items, size, fn) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

// localId is usually just a number but can be "TG01", "SWSH001", "H1", etc.
// Strip anything unsafe for a filename so it can never escape the set folder.
function safeName(localId) {
  return String(localId).replace(/[/\\?%*:|"<>]/g, '_').trim() || 'unknown';
}

function humanBytes(n) {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

async function fileIsComplete(target) {
  try {
    const s = await stat(target);
    return s.isFile() && s.size > 0;
  } catch {
    return false;
  }
}

// sharp is only needed for pokemontcg.io fallbacks (PNG → EXT); load it lazily
// so TCGdex-only runs still work even if the native module ever fails to build.
let sharpPromise;
async function transcodeToExt(buf) {
  sharpPromise ??= import('sharp').then((m) => m.default);
  const img = (await sharpPromise)(buf);
  if (EXT === 'webp') return img.webp({ quality: 90 }).toBuffer();
  if (EXT === 'png') return img.png().toBuffer();
  return img.jpeg({ quality: 90 }).toBuffer();
}

// Download `url` to `target` atomically, with retries. Returns one of:
//   { status: 'downloaded', bytes } | { status: 'missing' } | { status: 'failed', error }
async function downloadTo(url, target, { transcode = false, retries = 3 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 404) return { status: 'missing' };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) throw new Error('empty body');
      if (transcode) buf = await transcodeToExt(buf);
      const tmp = `${target}.part`;
      await writeFile(tmp, buf);
      await rename(tmp, target);
      return { status: 'downloaded', bytes: buf.length };
    } catch (err) {
      if (attempt === retries) return { status: 'failed', error: err?.message ?? String(err) };
      await sleep(400 * (attempt + 1)); // linear backoff: 0.4s, 0.8s, 1.2s
    }
  }
  return { status: 'failed', error: 'unreachable' };
}

// ---- Set selection -------------------------------------------------------

// Resolve the list of set IDs to process from the active flags.
async function resolveSetIds() {
  if (SETS_FILTER) {
    log(`set filter: ${SETS_FILTER.join(', ')}`);
    return SETS_FILTER;
  }
  if (SERIES_FILTER) {
    log(`series filter: ${SERIES_FILTER.join(', ')}`);
    const ids = [];
    for (const serieId of SERIES_FILTER) {
      const serie = await tcgdex.serie.get(serieId).catch(() => null);
      if (!serie) {
        console.warn(`[images]   serie "${serieId}" not found — skipping`);
        continue;
      }
      for (const s of serie.sets ?? []) ids.push(s.id);
    }
    return ids;
  }
  log('listing all sets…');
  const all = await tcgdex.set.list();
  return all.map((s) => s.id);
}

// ---- Main ----------------------------------------------------------------

async function main() {
  log(`output: ${OUT_DIR}`);
  log(`quality=${QUALITY} ext=${EXT} lang=${LANG} concurrency=${CONCURRENCY}${LOGOS ? ' +logos' : ''}${DRY_RUN ? '  (dry run)' : ''}`);

  const setIds = await resolveSetIds();
  if (setIds.length === 0) abort('no sets matched the given filters.');
  log(`${setIds.length} set(s) to process`);

  const manifest = { generatedAt: new Date().toISOString(), series: {}, sets: {}, counts: {} };
  const missing = []; // { set, localId, id }
  const totals = { cards: 0, downloaded: 0, skipped: 0, missing: 0, failed: 0, fallback: 0, bytes: 0 };

  // Process one set at a time (clean per-set progress); parallelise downloads
  // within each set. ~170 sequential set.get() calls are cheap next to the image
  // bytes, and TCGdex caches them.
  await inBatches(setIds, 1, async (setId) => {
    const set = await tcgdex.set.get(setId).catch((err) => {
      console.warn(`[images]   set.get(${setId}) failed: ${err?.message ?? err}`);
      return null;
    });
    if (!set) {
      console.warn(`[images]   set "${setId}" not found — skipping`);
      return;
    }

    const serieId = set.serie?.id ?? 'unknown';
    const serieName = set.serie?.name ?? serieId;
    const setDir = path.join(OUT_DIR, safeName(serieId), safeName(set.id));
    manifest.series[serieId] = serieName;
    manifest.sets[set.id] = { name: set.name, serie: serieId, cards: set.cards?.length ?? 0 };

    if (!DRY_RUN) await mkdir(setDir, { recursive: true });

    // Build the download tasks for this set.
    const tasks = [];
    for (const card of set.cards ?? []) {
      totals.cards++;
      const target = path.join(setDir, `${safeName(card.localId)}.${EXT}`);
      if (!card.image) {
        const ptcgioSet = PTCGIO_FALLBACK_SETS[set.id];
        if (ptcgioSet) {
          tasks.push({
            url: `https://images.pokemontcg.io/${ptcgioSet}/${card.localId}_hires.png`,
            target,
            transcode: true,
          });
          continue;
        }
        totals.missing++;
        missing.push({ set: set.id, localId: card.localId, id: card.id });
        continue;
      }
      tasks.push({ url: `${card.image}/${QUALITY}.${EXT}`, target });
    }
    if (LOGOS) {
      if (set.logo) tasks.push({ url: `${set.logo}.${EXT}`, target: path.join(setDir, `logo.${EXT}`) });
      if (set.symbol) tasks.push({ url: `${set.symbol}.${EXT}`, target: path.join(setDir, `symbol.${EXT}`) });
    }

    let dl = 0;
    let sk = 0;
    let fa = 0;
    let mi = 0;
    let fb = 0;

    if (DRY_RUN) {
      // Count how many would actually download vs already exist.
      for (const t of tasks) {
        if (await fileIsComplete(t.target)) sk++;
        else dl++;
      }
    } else {
      await inBatches(tasks, CONCURRENCY, async (t) => {
        if (await fileIsComplete(t.target)) {
          sk++;
          return;
        }
        const r = await downloadTo(t.url, t.target, { transcode: t.transcode });
        if (r.status === 'downloaded') {
          dl++;
          if (t.transcode) fb++;
          totals.bytes += r.bytes;
        } else if (r.status === 'missing') {
          mi++;
          missing.push({ set: set.id, localId: path.basename(t.target), url: t.url });
        } else {
          fa++;
          console.warn(`[images]   FAIL ${t.url} — ${r.error}`);
        }
      });
    }

    totals.downloaded += dl;
    totals.skipped += sk;
    totals.failed += fa;
    totals.missing += mi;
    totals.fallback += fb;
    log(
      `[${set.id}] ${serieName} — ${tasks.length} img | ` +
        `${DRY_RUN ? `${dl} to download, ${sk} present` : `${dl} downloaded${fb ? ` (${fb} via pokemontcg.io)` : ''}, ${sk} skipped, ${mi} missing, ${fa} failed`}`
    );
  });

  manifest.counts = { ...totals };

  if (DRY_RUN) {
    const toDownload = totals.cards - totals.skipped - totals.missing;
    log('—');
    log(`DRY RUN: ${Object.keys(manifest.sets).length} sets, ${totals.cards} cards`);
    log(`would download ~${toDownload} images (est. ${humanBytes(toDownload * 85 * 1024)} at ~85 KB each)`);
    log(`already present: ${totals.skipped} | no scan available: ${totals.missing}`);
    return;
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, '_manifest.json'), JSON.stringify(manifest, null, 2));
  await writeFile(path.join(OUT_DIR, 'missing-images.json'), JSON.stringify(missing, null, 2));

  log('—');
  log(
    `done: ${totals.downloaded} downloaded (${humanBytes(totals.bytes)}${totals.fallback ? `, ${totals.fallback} via pokemontcg.io` : ''}), ` +
      `${totals.skipped} skipped, ${totals.missing} missing, ${totals.failed} failed`
  );
  if (totals.failed > 0) {
    log(`re-run the same command to retry the ${totals.failed} failed download(s).`);
    process.exitCode = 1;
  }
}

main().catch((err) => abort(err?.stack ?? err?.message ?? String(err)));
