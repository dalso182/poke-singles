// Dev-server proxy: makes self-hosted card images load on localhost.
//
// Products store relative image paths (/card-images/<serie>/<set>/<localId>.webp)
// so they survive the new.→main domain cutover. On the deployed site those resolve
// same-origin; on localhost there's nothing at /card-images, so we forward those
// requests to new.poke-singles.com. That host is HTTP-Basic-password-protected, so
// we attach the credentials here (read from .env.local — never committed).
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
      '/card-images requests will hit new.poke-singles.com unauthenticated (401).',
  );
}

export default {
  '/card-images': {
    target: 'https://new.poke-singles.com',
    secure: true,
    changeOrigin: true,
    ...(authHeader ? { headers: { Authorization: authHeader } } : {}),
  },
};
