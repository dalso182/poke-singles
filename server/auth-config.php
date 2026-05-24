<?php
/**
 * Config for the image-picker endpoints' admin gate (see _supabase-auth.php).
 *
 * Both values are PUBLIC (the same URL + publishable key the browser bundle ships
 * in src/environments/environment.ts) — no secret lives here. Edit when a separate
 * prod Supabase project exists. Deployed automatically by `npm run images:upload`
 * (globs server/*.php) to the card-images root.
 */

define('SUPABASE_URL', 'https://dhslfridsjdmhwzrgebv.supabase.co');
define('SUPABASE_ANON_KEY', 'sb_publishable_jsLP6YsmsjjVvEZ2JuCkwQ_DP_rWRHA');
