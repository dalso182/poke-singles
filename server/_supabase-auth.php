<?php
/**
 * Admin gate for the image-picker endpoints. `require` this and call
 * `require_admin()` near the top of each endpoint (after the OPTIONS short-circuit).
 *
 * The Angular admin sends its Supabase session token in the `X-Supabase-Token`
 * header (a custom header — `Authorization` is occupied by the dev proxy's HTTP
 * Basic Auth on localhost). We validate it by asking Supabase who the token belongs
 * to (`GET /auth/v1/user`) and requiring `app_metadata.role === 'admin'`. This is
 * signature-algorithm-agnostic and needs no server-side secret — only the public
 * URL + publishable key from auth-config.php.
 *
 * The leading underscore keeps this out of the way; it's an include, not an
 * endpoint (and .php files never appear in the image listing anyway).
 */

require_once __DIR__ . '/auth-config.php';

function require_admin() {
    $token = '';
    if (isset($_SERVER['HTTP_X_SUPABASE_TOKEN'])) {
        $token = trim((string) $_SERVER['HTTP_X_SUPABASE_TOKEN']);
    }
    if ($token === '') {
        http_response_code(401);
        echo json_encode(['error' => 'no_token']);
        exit;
    }

    $ch = curl_init(rtrim(SUPABASE_URL, '/') . '/auth/v1/user');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'apikey: ' . SUPABASE_ANON_KEY,
            'Authorization: Bearer ' . $token,
            'Accept: application/json',
        ],
        CURLOPT_TIMEOUT => 8,
    ]);
    $body = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    if ($status !== 200 || $body === false) {
        http_response_code(401);
        echo json_encode(['error' => 'invalid_token']);
        exit;
    }

    $user = json_decode($body, true);
    $role = $user['app_metadata']['role'] ?? null;
    if ($role !== 'admin') {
        http_response_code(403);
        echo json_encode(['error' => 'not_admin']);
        exit;
    }
}
