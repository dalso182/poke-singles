<?php
/**
 * Config for the image-picker endpoints' admin gate (see _supabase-auth.php).
 *
 * Both values are PUBLIC (the same URL + publishable key the browser bundle ships
 * in src/environments/) — no secret lives here. The values below are a dev-tier
 * template: scripts/upload-images.mjs re-stamps them from the env-matching
 * environment file (--env=dev → environment.ts, --env=prod → environment.prod.ts)
 * at upload time, so each site gates against its own Supabase project.
 */

define('SUPABASE_URL', 'https://fdscdinfpmvswinpasdg.supabase.co');
define('SUPABASE_ANON_KEY', 'sb_publishable_1BXPpc4Z1U5u2nqa64_4SQ_-aDOeYdQ');
