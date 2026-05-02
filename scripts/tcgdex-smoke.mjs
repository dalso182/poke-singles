// Smoke test for @tcgdex/sdk — verifies the SDK works on this network/Node version
// without booting the Angular dev server. Exits non-zero on any failure.
//
// Usage: node scripts/tcgdex-smoke.mjs

import TCGdex from '@tcgdex/sdk';

const tcgdex = new TCGdex('en');

const main = async () => {
  console.log('1. Fetching known card (swsh3-136 — Furret)...');
  const card = await tcgdex.fetch('cards', 'swsh3-136');
  if (!card) throw new Error('Expected card swsh3-136, got nothing');
  console.log(`   → ${card.name} (${card.category}, rarity: ${card.rarity})`);

  console.log('2. Listing all sets...');
  const sets = await tcgdex.set.list();
  console.log(`   → ${sets.length} sets`);
  if (sets.length < 100) throw new Error(`Suspiciously few sets: ${sets.length}`);

  console.log('3. Pulling a random card...');
  const random = await tcgdex.random.card();
  console.log(`   → ${random.name} (set: ${random.set?.name ?? 'n/a'})`);

  console.log('\nAll checks passed.');
};

main().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
