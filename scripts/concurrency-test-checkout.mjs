// Concurrency proof harness for `place_order` (DEV ONLY).
//
// Fires genuinely-parallel guest checkouts against the dev Supabase project to
// prove two properties about the checkout RPC:
//
//   1. oversell  — many buyers race for a product with limited stock. Exactly
//                  `stock` orders must succeed; the rest must get
//                  INSUFFICIENT_STOCK; the product must never go negative.
//   2. deadlock  — two multi-item carts share the same products in OPPOSITE
//                  order and check out simultaneously. On v6 (cart-array lock
//                  order) this can deadlock (SQLSTATE 40P01); on v7
//                  (product_id-ordered locks) it must not.
//
// It only DRIVES the RPCs (guest path, anon key — `anon` has EXECUTE on
// place_order). Seeding the throwaway products and reading/cleaning their final
// stock is done out-of-band via SQL (see the plan / MCP), because anon can't
// write to `products`.
//
// Usage:
//   node scripts/concurrency-test-checkout.mjs oversell --product=<uuid> [--count=6] [--qty=1]
//   node scripts/concurrency-test-checkout.mjs deadlock --p1=<uuid> --p2=<uuid> [--iter=50]
//
// URL + anon key default to the dev project (both are public); override with
// SUPABASE_URL / SUPABASE_ANON_KEY env vars if needed.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://dhslfridsjdmhwzrgebv.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || 'sb_publishable_jsLP6YsmsjjVvEZ2JuCkwQ_DP_rWRHA';

// "Retiro Showroom" — active, requires_address=false, price 0 → no address needed.
const SHIPPING_METHOD_ID =
  process.env.SHIPPING_ID || '4edec6ca-54b9-4dd0-a557-1befd1bc275b';

// ── arg parsing ────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const mode = argv.find((a) => !a.startsWith('--')) || 'oversell';
const flags = Object.fromEntries(
  argv
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=');
      return [k, v ?? true];
    }),
);

// A fresh anon client per request avoids any shared auth-lock serialization,
// so the calls really do hit the DB in parallel.
function freshClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function buildInput(items, tag) {
  return {
    buyer: {
      email: `race+${tag}@test.local`,
      name: 'Race Test',
      phone: '0000-0000',
    },
    items, // [{ product_id, quantity }]
    payment_method: 'sinpe_or_transfer',
    shipping_method_id: SHIPPING_METHOD_ID,
  };
}

// Classify one rpc outcome into a coarse bucket.
function classify({ data, error }) {
  if (error) {
    const msg = `${error.code || ''} ${error.message || ''}`.toLowerCase();
    if (error.code === '40P01' || msg.includes('deadlock')) return 'deadlock';
    return 'rpc_error';
  }
  if (data?.ok) return 'ok';
  if (data?.error === 'INSUFFICIENT_STOCK') return 'insufficient_stock';
  return `other:${data?.error ?? 'unknown'}`;
}

async function placeOrder(items, tag) {
  const client = freshClient();
  const res = await client.rpc('place_order', { p_input: buildInput(items, tag) });
  return { res, bucket: classify(res) };
}

function tally(buckets) {
  const counts = {};
  for (const b of buckets) counts[b] = (counts[b] || 0) + 1;
  return counts;
}

// ── oversell mode ──────────────────────────────────────────────────────────
async function runOversell() {
  const product = flags.product || process.env.PRODUCT_ID;
  const count = Number(flags.count ?? 6);
  const qty = Number(flags.qty ?? 1);
  if (!product) throw new Error('oversell mode needs --product=<uuid>');

  console.log(
    `\n[oversell] product=${product} firing ${count} concurrent checkouts of qty ${qty}\n`,
  );

  const results = await Promise.all(
    Array.from({ length: count }, (_, i) =>
      placeOrder([{ product_id: product, quantity: qty }], `os${i}`),
    ),
  );

  const counts = tally(results.map((r) => r.bucket));
  const orderIds = results
    .map((r) => r.res.data?.order_id)
    .filter(Boolean);

  console.log('  results:', counts);
  console.log('  created order_ids (for cleanup):', orderIds);
  console.log(
    '\n  EXPECT: ok == stock, the rest INSUFFICIENT_STOCK, and final quantity never negative.',
  );
  console.log('  Verify final products.quantity via SQL after this run.\n');
}

// ── deadlock mode ──────────────────────────────────────────────────────────
async function runDeadlock() {
  const p1 = flags.p1 || process.env.P1;
  const p2 = flags.p2 || process.env.P2;
  const iter = Number(flags.iter ?? 50);
  if (!p1 || !p2) throw new Error('deadlock mode needs --p1=<uuid> --p2=<uuid>');

  console.log(
    `\n[deadlock] p1=${p1} p2=${p2} firing ${iter * 2} concurrent checkouts ` +
      `(${iter} in order [p1,p2], ${iter} in order [p2,p1])\n`,
  );

  // Interleave opposite-order carts and fire them ALL at once for max contention.
  const jobs = [];
  for (let i = 0; i < iter; i++) {
    jobs.push(
      placeOrder(
        [
          { product_id: p1, quantity: 1 },
          { product_id: p2, quantity: 1 },
        ],
        `dlA${i}`,
      ),
    );
    jobs.push(
      placeOrder(
        [
          { product_id: p2, quantity: 1 },
          { product_id: p1, quantity: 1 },
        ],
        `dlB${i}`,
      ),
    );
  }

  const results = await Promise.all(jobs);
  const counts = tally(results.map((r) => r.bucket));
  const orderIds = results.map((r) => r.res.data?.order_id).filter(Boolean);

  // Distinct error messages (with counts) for any failed call, so we can see
  // exactly why non-ok calls failed.
  const errMsgs = {};
  for (const { res } of results) {
    if (res.error) {
      const key = `[${res.error.code || '?'}] ${res.error.message || ''}`.trim();
      errMsgs[key] = (errMsgs[key] || 0) + 1;
    }
  }

  console.log('  results:', counts);
  if (Object.keys(errMsgs).length) console.log('  error messages:', errMsgs);
  console.log('  created order_ids:', orderIds.length, '(see SQL cleanup)');
  console.log(
    `\n  EXPECT v6: deadlock > 0.   EXPECT v7: deadlock == 0.   (${counts.deadlock ?? 0} this run)\n`,
  );
}

// ── main ───────────────────────────────────────────────────────────────────
const run = mode === 'deadlock' ? runDeadlock : runOversell;
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
