<?php
/**
 * Tiny folder-create endpoint for the admin's "pick image" dialog (sibling to
 * list-images.php / upload-image.php). Drop it at the ROOT of the images folder
 * on SiteGround, e.g.
 *   /new.poke-singles.com/public_html/card-images/create-folder.php
 *
 * Accepts a POST:
 *   path  — relative parent folder under this script's directory (default: root)
 *   name  — new folder name (slugified to a single safe segment)
 *
 * The parent is resolved with realpath and must sit inside this script's
 * directory, so `path=..` escapes fail. The name is slugified (no slashes/dots),
 * so it can never traverse out. Idempotent: if the folder already exists it's
 * returned rather than erroring.
 *
 * Response (200): { name, path }  — same shape as a list-images.php dir entry.
 * Errors: 4xx/5xx with { error: "<code>" }.
 *
 * Admin-only: require_admin() (see _supabase-auth.php) validates the caller's
 * Supabase token and role before creating anything.
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

// Admin-only: validate the caller's Supabase token before creating anything.
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

// ---- Resolve + bound-check the parent folder (mirrors list-images.php) -------

$rel = isset($_POST['path']) ? (string) $_POST['path'] : '';
$rel = str_replace('\\', '/', $rel);
$rel = trim($rel, '/');

$candidate = $baseDir . ($rel === '' ? '' : DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $rel));
$parent = realpath($candidate);

if ($parent === false || strpos($parent, $baseDir) !== 0 || !is_dir($parent) || !is_writable($parent)) {
    fail('bad_path', 400);
}

// ---- Sanitize the folder name to a single safe segment ----------------------

$raw = isset($_POST['name']) ? (string) $_POST['name'] : '';
$name = strtolower($raw);
$name = preg_replace('/[^a-z0-9_-]+/', '-', $name);
$name = trim($name, '-_');
if ($name === '' || $name === false) {
    fail('bad_name', 400);
}

$dest = $parent . DIRECTORY_SEPARATOR . $name;

// Idempotent: existing folder is fine; otherwise create it.
if (!is_dir($dest)) {
    if (file_exists($dest) || !@mkdir($dest, 0755)) {
        fail('create_failed', 500);
    }
}

$entryRelPath = ltrim(($rel === '' ? '' : $rel . '/') . $name, '/');

echo json_encode([
    'name' => $name,
    'path' => $entryRelPath,
], JSON_UNESCAPED_SLASHES);
