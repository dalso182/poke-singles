// Upload the local card-image tree (built by scripts/fetch-card-images.mjs) to
// SiteGround's card-images/ folder, so the store self-hosts its images.
//
// This is deliberately separate from scripts/deploy.mjs: it only ever writes
// under <remote>/card-images, never the app root, so normal app deploys and the
// live-store guard are untouched. ssh2-sftp-client's uploads don't mirror-delete,
// so the images persist across regular deploys.
//
// Usage:
//   npm run images:upload                          — upload ALL of ./card-images to the dev domain
//   node scripts/upload-images.mjs --dry-run       — show target + file count, connect to nothing
//   node scripts/upload-images.mjs --sets=ME05     — upload only those set subtrees (pairs with fetch --sets)
//   node scripts/upload-images.mjs --endpoints-only — push ONLY server/*.php (no image tree, no tar). Fast.
//   node scripts/upload-images.mjs --env=prod      — use prod creds (DEPLOY_*) instead of dev (DEV_DEPLOY_*)
//   node scripts/upload-images.mjs --sftp          — per-file SFTP instead of tarball+extract (slower, no remote tar)
//
// Default transport is a single tar.gz uploaded then extracted over SSH (minutes,
// not hours). --sftp falls back to per-file uploadDir when remote tar is unavailable.
//
// Target dir: IMAGES_REMOTE_DIR if set, else <{ENV_}DEPLOY_REMOTE_DIR>/card-images.
// Creds come from the same .env.local keys deploy.mjs uses (DEV_-prefixed for dev).

import dotenv from 'dotenv';
import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import SftpClient from 'ssh2-sftp-client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(REPO_ROOT, '.env.local') });

// ---- CLI parsing ---------------------------------------------------------

const ARGS = process.argv.slice(2);
const FLAG_SET = new Set(ARGS);
const DRY_RUN = FLAG_SET.has('--dry-run');
const USE_SFTP = FLAG_SET.has('--sftp');
const NO_PHP = FLAG_SET.has('--no-php');
const ENDPOINTS_ONLY = FLAG_SET.has('--endpoints-only');

function argValue(prefix, fallback = null) {
  const a = ARGS.find((x) => x.startsWith(prefix));
  return a ? a.slice(prefix.length) : fallback;
}
function listValue(prefix) {
  const raw = argValue(prefix);
  if (!raw) return null;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

const ENV = (argValue('--env=', 'dev') || 'dev').toLowerCase();
if (!['dev', 'prod'].includes(ENV)) abort(`invalid --env=${ENV} (expected dev|prod)`);
const KEY_PREFIX = ENV === 'dev' ? 'DEV_' : '';

const OUT_DIR = path.resolve(REPO_ROOT, argValue('--out=', 'card-images'));
const SETS_FILTER = listValue('--sets=');

// ---- Helpers -------------------------------------------------------------

function log(msg) {
  console.log(`[upload] ${msg}`);
}
function abort(msg) {
  console.error(`[upload] ${msg}`);
  process.exit(1);
}

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') abort(`Missing ${name} in .env.local`);
  return value.trim();
}

// Resolve the remote card-images dir. Explicit IMAGES_REMOTE_DIR wins; otherwise
// derive it from the deploy remote dir for the chosen env.
function resolveRemoteDir() {
  const explicit = process.env.IMAGES_REMOTE_DIR?.trim();
  const dir = explicit || `${getRequiredEnv(`${KEY_PREFIX}DEPLOY_REMOTE_DIR`).replace(/\/+$/, '')}/card-images`;
  const clean = dir.replace(/\/+$/, '');
  // Safety: never let this script write outside a card-images folder.
  if (!/(^|\/)card-images$/.test(clean)) {
    abort(
      `Refusing to upload to "${clean}" — the target must end in /card-images. ` +
        `Set IMAGES_REMOTE_DIR explicitly, or check ${KEY_PREFIX}DEPLOY_REMOTE_DIR.`
    );
  }
  return clean;
}

async function buildAuthOptions() {
  const host = getRequiredEnv(`${KEY_PREFIX}DEPLOY_HOST`);
  const port = Number(process.env[`${KEY_PREFIX}DEPLOY_PORT`] ?? 18765);
  const username = getRequiredEnv(`${KEY_PREFIX}DEPLOY_USER`);

  const keyPath = process.env[`${KEY_PREFIX}DEPLOY_PRIVATE_KEY_PATH`]?.trim();
  if (keyPath) {
    const privateKey = await readFile(keyPath, 'utf8');
    return { host, port, username, privateKey, passphrase: process.env[`${KEY_PREFIX}DEPLOY_PRIVATE_KEY_PASSPHRASE`] };
  }
  const password = getRequiredEnv(`${KEY_PREFIX}DEPLOY_PASSWORD`);
  return { host, port, username, password };
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

function isUploadable(filePath) {
  const base = path.basename(filePath);
  if (base === '.DS_Store') return false;
  if (base.endsWith('.part')) return false; // interrupted downloads
  if (base.endsWith('.tar.gz')) return false; // stray archives
  return true;
}

// Map each requested set ID to its "<serie>/<set>" path under OUT_DIR, using the
// manifest when present, else scanning the serie folders.
async function resolveSetRelPaths(setIds) {
  let manifest = null;
  const manifestPath = path.join(OUT_DIR, '_manifest.json');
  if (existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    } catch {
      /* fall through to scan */
    }
  }

  const series = manifest ? null : (await readdir(OUT_DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  const rels = [];
  for (const setId of setIds) {
    let serie = manifest?.sets?.[setId]?.serie ?? null;
    if (!serie && series) {
      serie = series.find((s) => existsSync(path.join(OUT_DIR, s, setId))) ?? null;
    }
    if (!serie) {
      console.warn(`[upload]   set "${setId}" not found under ${OUT_DIR} — skipping`);
      continue;
    }
    const rel = `${serie}/${setId}`;
    if (!existsSync(path.join(OUT_DIR, serie, setId))) {
      console.warn(`[upload]   ${rel} missing on disk — run images:fetch --sets=${setId} first`);
      continue;
    }
    rels.push(rel);
  }
  return rels;
}

// Promisified ssh2 exec over the SFTP connection's underlying client.
function sshExec(sftp, cmd) {
  return new Promise((resolve, reject) => {
    const conn = sftp.client;
    if (!conn || typeof conn.exec !== 'function') {
      return reject(new Error('SSH exec unavailable on this connection — re-run with --sftp'));
    }
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('close', (code) => (code === 0 ? resolve(stdout) : reject(new Error(`exit ${code}: ${stderr.trim()}`))));
      stream.on('data', (d) => (stdout += d));
      stream.stderr.on('data', (d) => (stderr += d));
    });
  });
}

// All PHP endpoints under server/ (list-images.php, upload-image.php, and any we
// add later). Globbed so new endpoints ship automatically.
async function endpointPhpFiles() {
  const dir = path.join(REPO_ROOT, 'server');
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  return entries
    .filter((n) => n.toLowerCase().endsWith('.php'))
    .sort()
    .map((n) => path.join(dir, n));
}

// fastPut every server/*.php into the card-images root.
async function uploadEndpoints(sftp, remoteDir) {
  for (const php of await endpointPhpFiles()) {
    const name = path.basename(php);
    log(`uploading ${name}…`);
    await sftp.fastPut(php, `${remoteDir}/${name}`);
  }
}

function buildTarball(archivePath, members) {
  // Run tar with cwd=OUT_DIR so archive entries are relative (./swsh/swsh3/...),
  // which extract cleanly inside the remote card-images dir.
  const args = ['--exclude=*.part', '--exclude=*.tar.gz', '-czf', archivePath, ...members];
  log(`tar ${members.join(' ')} → ${path.basename(archivePath)}`);
  const r = spawnSync('tar', args, { cwd: OUT_DIR, stdio: 'inherit' });
  if (r.status !== 0) abort(`tar failed (exit ${r.status}). Ensure 'tar' is on PATH.`);
}

// ---- Main ----------------------------------------------------------------

async function main() {
  const remoteDir = resolveRemoteDir();

  // Fast path: push only the server/*.php endpoints — no image tree, no tar.
  if (ENDPOINTS_ONLY) {
    const auth = await buildAuthOptions();
    const names = (await endpointPhpFiles()).map((f) => path.basename(f));
    log(`env=${ENV} endpoints-only${DRY_RUN ? '  (dry run)' : ''}`);
    log(`remote: ${remoteDir}`);
    log(`endpoints: ${names.join(', ') || '(no .php found in server/)'}`);
    if (DRY_RUN) {
      log(`dry run — would connect to ${auth.username}@${auth.host}:${auth.port} and upload ${names.length} file(s).`);
      return;
    }
    const sftp = new SftpClient();
    try {
      log(`connecting to ${auth.username}@${auth.host}:${auth.port}…`);
      await sftp.connect(auth);
      await sftp.mkdir(remoteDir, true).catch(() => {}); // idempotent
      await uploadEndpoints(sftp, remoteDir);
      log('done.');
    } catch (err) {
      abort(`upload failed: ${err?.message ?? err}`);
    } finally {
      await sftp.end().catch(() => {});
    }
    return;
  }

  if (!existsSync(OUT_DIR)) abort(`output dir not found: ${OUT_DIR}. Run images:fetch first.`);

  // Work out what to upload: specific set subtrees or the whole tree.
  let members; // tar members, relative to OUT_DIR
  let localRoots; // [{ local, remote }] for the --sftp path
  if (SETS_FILTER) {
    const rels = await resolveSetRelPaths(SETS_FILTER);
    if (rels.length === 0) abort('no requested sets found on disk.');
    members = rels;
    localRoots = rels.map((rel) => ({ local: path.join(OUT_DIR, rel), remote: `${remoteDir}/${rel}` }));
  } else {
    members = ['.'];
    localRoots = [{ local: OUT_DIR, remote: remoteDir }];
  }

  // Count uploadable files for reporting.
  let fileCount = 0;
  for (const { local } of localRoots) {
    for await (const f of walk(local)) if (isUploadable(f)) fileCount++;
  }

  const auth = await buildAuthOptions();
  log(`env=${ENV} transport=${USE_SFTP ? 'sftp' : 'tarball'}${DRY_RUN ? '  (dry run)' : ''}`);
  log(`local:  ${OUT_DIR}${SETS_FILTER ? ` (sets: ${members.join(', ')})` : ''}`);
  log(`remote: ${remoteDir}`);
  log(`files:  ${fileCount}`);

  if (DRY_RUN) {
    log(`dry run — would connect to ${auth.username}@${auth.host}:${auth.port} and upload ${fileCount} file(s).`);
    return;
  }

  const sftp = new SftpClient();
  try {
    log(`connecting to ${auth.username}@${auth.host}:${auth.port}…`);
    await sftp.connect(auth);
    await sftp.mkdir(remoteDir, true).catch(() => {}); // idempotent

    if (USE_SFTP) {
      for (const { local, remote } of localRoots) {
        log(`sftp ${local} → ${remote}`);
        await sftp.uploadDir(local, remote, { useFastput: true, filter: (fp, isDir) => isDir || isUploadable(fp) });
      }
    } else {
      const archivePath = path.join(os.tmpdir(), `poke-card-images-${Date.now()}.tar.gz`);
      buildTarball(archivePath, members);
      const remoteArchive = `${remoteDir}/${path.basename(archivePath)}`;
      log(`uploading archive (${archiveSize(archivePath)})…`);
      await sftp.fastPut(archivePath, remoteArchive);
      log('extracting on server…');
      await sshExec(sftp, `cd '${remoteDir}' && tar -xzf '${path.basename(archivePath)}' && rm -f '${path.basename(archivePath)}'`);
    }

    // Drop the image-picker endpoints into the card-images root (full uploads only).
    if (!SETS_FILTER && !NO_PHP) {
      await uploadEndpoints(sftp, remoteDir);
    }

    log('done.');
  } catch (err) {
    abort(`upload failed: ${err?.message ?? err}`);
  } finally {
    await sftp.end().catch(() => {});
  }
}

// Small sync helper for the size log line.
function archiveSize(p) {
  try {
    return `${(statSync(p).size / (1024 * 1024)).toFixed(1)} MB`;
  } catch {
    return '?';
  }
}

main().catch((err) => abort(err?.stack ?? err?.message ?? String(err)));
