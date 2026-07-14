// Dev-server proxy: makes self-hosted card images load on localhost.
//
// Products store relative image paths (/card-images/<serie>/<set>/<localId>.webp)
// so they survive the dev.→main domain cutover. On the deployed site those resolve
// same-origin; on localhost there's nothing at /card-images, so we forward those
// requests to dev.poke-singles.com. That host is HTTP-Basic-password-protected, so
// we attach the credentials here (read from .env.local — never committed).
//
// Must stay on the DEV subdomain: the image-picker PHP endpoints there are stamped
// for the dev Supabase project, so tokens from a local (dev-pointed) session
// validate. new.poke-singles.com still carries pre-split endpoints that gate
// against the old project and answer 401 invalid_token.
//
// Setup: add to .env.local
//   IMAGES_HTTP_USER=<site password username>
//   IMAGES_HTTP_PASSWORD=<site password>
// then restart `npm start`. If the creds are absent the proxy still runs, but the
// upstream will answer 401 (images stay broken locally) — that's the hint to set them.
//
// This only affects `ng serve` (local dev). Production builds never use it.

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env.local') });

const user = process.env.IMAGES_HTTP_USER?.trim();
const pass = process.env.IMAGES_HTTP_PASSWORD?.trim();
const authHeader =
  user && pass ? `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}` : null;

if (!authHeader) {
  console.warn(
    '[proxy] IMAGES_HTTP_USER / IMAGES_HTTP_PASSWORD not set in .env.local — ' +
      '/card-images requests will hit dev.poke-singles.com unauthenticated (401).',
  );
}

export default {
  '/card-images': {
    target: 'https://dev.poke-singles.com',
    secure: true,
    changeOrigin: true,
    ...(authHeader ? { headers: { Authorization: authHeader } } : {}),
  },
};
