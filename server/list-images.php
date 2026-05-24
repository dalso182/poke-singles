<?php
/**
 * Tiny read-only image browser endpoint for the admin's "pick image" dialog.
 *
 * Drop this file at the ROOT of the images folder on SiteGround, e.g.
 *   /new.poke-singles.com/public_html/images/list-images.php
 *
 * It serves a JSON listing of the directory (and subdirectories) it lives in,
 * scoped strictly below itself — `realpath` enforces the bound, so `?path=..`
 * tricks fail. URLs returned are absolute and computed from the script's own
 * web path, so the file is location-independent: move the folder, no edits.
 *
 * Query params:
 *   path  — relative subfolder under the script's directory (default: root).
 *
 * Response:
 *   {
 *     path: "foo/bar",          // current relative path ("" at root)
 *     parent: "foo" | null,     // parent path, or null if at root
 *     dirs:  [{ name, path }],
 *     files: [{ name, path, url, size, mtime }]
 *   }
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Supabase-Token');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Admin-only: validate the caller's Supabase token before listing.
require __DIR__ . '/_supabase-auth.php';
require_admin();

$baseDir = __DIR__;

// Build a fully-qualified base URL (scheme + host + dir path). The Angular
// admin runs on a different origin (localhost:4242 in dev, the subdomain in
// staging), so root-relative URLs would resolve against the SPA's host and
// 404. Returning absolute URLs makes the listing origin-independent.
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

$rel = isset($_GET['path']) ? (string) $_GET['path'] : '';
$rel = str_replace('\\', '/', $rel);
$rel = trim($rel, "/");

$candidate = $baseDir . ($rel === '' ? '' : DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $rel));
$target = realpath($candidate);

// Bound check: target must exist and be inside (or equal to) the base dir.
if ($target === false
    || (strpos($target, $baseDir) !== 0)
    || (!is_dir($target))
) {
    http_response_code(404);
    echo json_encode(['error' => 'not_found']);
    exit;
}

$entries = @scandir($target);
if ($entries === false) {
    http_response_code(500);
    echo json_encode(['error' => 'read_failed']);
    exit;
}

$imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'];
$dirs = [];
$files = [];

foreach ($entries as $entry) {
    if ($entry === '.' || $entry === '..') continue;
    if ($entry[0] === '.') continue; // hidden files/folders
    if ($entry === basename(__FILE__)) continue; // don't list this script

    $entryFullPath = $target . DIRECTORY_SEPARATOR . $entry;
    $entryRelPath = ltrim(($rel === '' ? '' : $rel . '/') . $entry, '/');

    if (is_dir($entryFullPath)) {
        $dirs[] = [
            'name' => $entry,
            'path' => $entryRelPath,
        ];
    } elseif (is_file($entryFullPath)) {
        $ext = strtolower(pathinfo($entry, PATHINFO_EXTENSION));
        if (!in_array($ext, $imageExtensions, true)) continue;
        $files[] = [
            'name'  => $entry,
            'path'  => $entryRelPath,
            'url'   => $baseUrl . '/' . str_replace('%2F', '/', rawurlencode($entryRelPath)),
            'size'  => filesize($entryFullPath),
            'mtime' => filemtime($entryFullPath),
        ];
    }
}

usort($dirs,  fn($a, $b) => strnatcasecmp($a['name'], $b['name']));
usort($files, fn($a, $b) => strnatcasecmp($a['name'], $b['name']));

$parent = null;
if ($rel !== '') {
    $slash = strrpos($rel, '/');
    $parent = ($slash === false) ? '' : substr($rel, 0, $slash);
}

echo json_encode([
    'path'   => $rel,
    'parent' => $parent,
    'dirs'   => $dirs,
    'files'  => $files,
], JSON_UNESCAPED_SLASHES);
