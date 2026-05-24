<?php
/**
 * Tiny image-upload endpoint for the admin's "pick image" dialog (the write
 * counterpart to list-images.php). Drop it beside that file at the ROOT of the
 * images folder on SiteGround, e.g.
 *   /new.poke-singles.com/public_html/card-images/upload-image.php
 *
 * Accepts a multipart/form-data POST:
 *   file  — the image (required)
 *   path  — relative subfolder under this script's directory (default: root)
 *
 * The target folder is resolved with realpath and must sit inside this script's
 * directory, so `path=..` escapes fail (same bound as list-images.php). The file
 * is validated as a real raster image (MIME via finfo) and the SAVED EXTENSION is
 * derived from the detected type — a disguised .php payload can never be written
 * as executable. The name is slugified and de-duplicated (never overwrites).
 *
 * Response (200): { name, path, url, size, mtime }  — same shape as a list entry.
 * Errors: 4xx/5xx with { error: "<code>" }.
 *
 * Admin-only: require_admin() (see _supabase-auth.php) validates the caller's
 * Supabase token and role before any write. Content validation below is a second
 * layer (prevents code execution even if the gate were misconfigured).
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Supabase-Token');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Admin-only: validate the caller's Supabase token before any write.
require __DIR__ . '/_supabase-auth.php';
require_admin();

function fail($code, $status = 400) {
    http_response_code($status);
    echo json_encode(['error' => $code]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    fail('method_not_allowed', 405);
}

$baseDir = __DIR__;
$maxBytes = 8 * 1024 * 1024; // 8 MB

// Allowed image types → canonical saved extension. The key is the MIME finfo
// reports; the value is the extension we force on disk.
$allowed = [
    'image/webp' => 'webp',
    'image/png'  => 'png',
    'image/jpeg' => 'jpg',
    'image/gif'  => 'gif',
    'image/avif' => 'avif',
];

// ---- Resolve + bound-check the target folder (mirrors list-images.php) -------

$rel = isset($_POST['path']) ? (string) $_POST['path'] : '';
$rel = str_replace('\\', '/', $rel);
$rel = trim($rel, '/');

$candidate = $baseDir . ($rel === '' ? '' : DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $rel));
$target = realpath($candidate);

if ($target === false || strpos($target, $baseDir) !== 0 || !is_dir($target) || !is_writable($target)) {
    fail('bad_path', 400);
}

// ---- Validate the upload ----------------------------------------------------

if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
    fail('no_file', 400);
}
$file = $_FILES['file'];
if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    fail('upload_error', 400);
}
if (!is_uploaded_file($file['tmp_name'])) {
    fail('not_uploaded', 400);
}
if ($file['size'] <= 0 || $file['size'] > $maxBytes) {
    fail('bad_size', 413);
}

// Detect the real content type — do NOT trust the client-supplied name/type.
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime = $finfo ? finfo_file($finfo, $file['tmp_name']) : false;
if ($finfo) finfo_close($finfo);
if ($mime === false || !isset($allowed[$mime])) {
    fail('not_an_image', 415);
}
$ext = $allowed[$mime];

// ---- Build a safe, unique filename ------------------------------------------

$origBase = pathinfo((string) ($file['name'] ?? 'image'), PATHINFO_FILENAME);
$slug = strtolower($origBase);
$slug = preg_replace('/[^a-z0-9_-]+/', '-', $slug);
$slug = trim($slug, '-_');
if ($slug === '' || $slug === false) {
    $slug = 'image';
}

$name = $slug . '.' . $ext;
$dest = $target . DIRECTORY_SEPARATOR . $name;
$i = 1;
while (file_exists($dest)) {
    $name = $slug . '-' . $i . '.' . $ext;
    $dest = $target . DIRECTORY_SEPARATOR . $name;
    $i++;
}

if (!move_uploaded_file($file['tmp_name'], $dest)) {
    fail('write_failed', 500);
}
@chmod($dest, 0644);

// ---- Respond with the same shape list-images.php uses for a file ------------

$scheme = (!empty($_SERVER['HTTPS']) && strtolower($_SERVER['HTTPS']) !== 'off')
    || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower($_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https')
    || (($_SERVER['SERVER_PORT'] ?? '') === '443')
    ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'] ?? ($_SERVER['SERVER_NAME'] ?? '');
$basePath = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\');
if ($basePath === '\\') {
    $basePath = '';
}
$baseUrl = $scheme . '://' . $host . $basePath;

$entryRelPath = ltrim(($rel === '' ? '' : $rel . '/') . $name, '/');

echo json_encode([
    'name'  => $name,
    'path'  => $entryRelPath,
    'url'   => $baseUrl . '/' . str_replace('%2F', '/', rawurlencode($entryRelPath)),
    'size'  => filesize($dest),
    'mtime' => filemtime($dest),
], JSON_UNESCAPED_SLASHES);
