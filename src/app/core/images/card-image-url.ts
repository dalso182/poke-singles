// Helpers for mapping a TCGdex card image to our self-hosted copy.
//
// We download every card image into `/card-images/<serie>/<set>/<localId>.webp`
// (see scripts/fetch-card-images.mjs) and serve it from our own host instead of
// hotlinking the TCGdex CDN. These pure functions translate between the two and
// resolve relative paths for display.

/** Path prefix under which self-hosted card images live (matches the downloader). */
const CARD_IMAGES_PREFIX = '/card-images';

// TCGdex card image base URL, e.g.
//   https://assets.tcgdex.net/en/swsh/swsh3/136
// The capture group is `<serie>/<set>/<localId>` — exactly our folder layout.
const TCGDEX_ASSET_RE = /^https?:\/\/assets\.tcgdex\.net\/[^/]+\/(.+)$/i;

/**
 * Convert a TCGdex `card.image` base URL to our self-hosted relative path.
 * Returns `''` when the image is absent or not a recognizable TCGdex asset URL
 * (the admin can then fill the field via the picker or by hand).
 *
 *   https://assets.tcgdex.net/en/swsh/swsh3/136 → /card-images/swsh/swsh3/136.webp
 */
export function tcgdexImageToHostedPath(imageBase: string | null | undefined): string {
  if (!imageBase) return '';
  const match = TCGDEX_ASSET_RE.exec(imageBase.trim());
  if (!match) return '';
  return `${CARD_IMAGES_PREFIX}/${match[1]}.webp`;
}

/**
 * Resolve a stored image value to a loadable `<img src>`. Relative paths
 * (`/card-images/...`) are made absolute against `origin` so the preview loads
 * regardless of where the admin UI runs; absolute URLs (from the picker or
 * manual entry) are returned unchanged. Falls back to the raw value when no
 * origin is available.
 */
export function resolveHostedSrc(value: string | null | undefined, origin: string): string {
  if (!value) return '';
  if (origin && value.startsWith('/')) return `${origin}${value}`;
  return value;
}
