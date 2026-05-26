import type { Card } from '@tcgdex/sdk';

/**
 * Pure helpers for reading TCGplayer market-price data off a TCGdex `Card`
 * payload. Lives outside any Angular service so the price-review report, the
 * add-product flow, and any future caller share one implementation. The SDK's
 * TypeScript types don't declare the `pricing` block, but it exists at
 * runtime — these helpers do the unsafe-cast in one place.
 *
 * Note: a card may have several TCGplayer variants (normal / holo / reverse /
 * 1stEdition…). We deliberately pick the first non-metadata variant, matching
 * what the add-product suggested-price logic does. Per-variant matching is a
 * separate, larger feature.
 */

type TcgplayerVariant = {
  productId?: number | null;
  marketPrice?: number | null;
};

type TcgplayerBlock = {
  tcgplayer?: Record<string, unknown>;
};

function readPricingBlock(card: Card): TcgplayerBlock | null {
  const block = (card as unknown as { pricing?: TcgplayerBlock }).pricing;
  return block ?? null;
}

/** First TCGplayer variant object on the card, skipping the `updated` / `unit` metadata keys. */
export function firstTcgplayerVariant(card: Card): TcgplayerVariant | null {
  const tp = readPricingBlock(card)?.tcgplayer;
  if (!tp) return null;
  for (const [key, val] of Object.entries(tp)) {
    if (key === 'updated' || key === 'unit') continue;
    if (val && typeof val === 'object') {
      return val as TcgplayerVariant;
    }
  }
  return null;
}

/** First available TCGplayer market price (USD) on the card, if any. */
export function tcgplayerMarketUsd(card: Card): number | null {
  const price = firstTcgplayerVariant(card)?.marketPrice;
  return typeof price === 'number' && price > 0 ? price : null;
}

/**
 * The `pricing.tcgplayer.updated` timestamp from the TCGdex payload, when
 * present. Used by the price-review report to show "as of <date>" so the admin
 * can judge how stale the market signal is.
 */
export function tcgplayerUpdatedAt(card: Card): string | null {
  const updated = readPricingBlock(card)?.tcgplayer?.['updated'];
  return typeof updated === 'string' && updated.length > 0 ? updated : null;
}
