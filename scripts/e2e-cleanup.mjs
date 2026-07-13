// Remove everything the Playwright checkout suite wrote to the dev DB.
//
// Usage:
//   npm run e2e:cleanup            — also runs automatically via e2e/global-teardown.ts
//   node scripts/e2e-cleanup.mjs --purge   — additionally delete the fixture
//                                            products + coupon entirely
//
// Deliberately does NOT go through the cancel_order RPC (its admin check
// expects a real auth.uid(); service-role PostgREST calls have none). E2E
// orders only ever contain the two [E2E] fixture products, so restoring
// stock is simply resetting them to the seeded quantity.
//
// Idempotent: zero rows to remove is success.

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(REPO_ROOT, '.env.local') });

const SUPABASE_URL = process.env.SUPABASE_DEV_URL;
const SUPABASE_KEY = process.env.SUPABASE_DEV_SERVICE_ROLE_KEY;
const E2E_USER_EMAIL = process.env.E2E_USER_EMAIL ?? 'e2e-checkout@test.local';
const E2E_GUEST_EMAIL = 'e2e-guest@test.local';
const COUPON_CODE = 'E2ETEST10';
const PRODUCT_SLUGS = ['e2e-test-card-a', 'e2e-test-card-b'];
const STOCK = 10;
const PURGE = process.argv.includes('--purge');

function abort(msg) {
  console.error(`[e2e-cleanup] ${msg}`);
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
  abort('Missing SUPABASE_DEV_URL or SUPABASE_DEV_SERVICE_ROLE_KEY in .env.local.');
}
if (!SUPABASE_URL.includes('dhslfridsjdmhwzrgebv')) {
  abort(`Refusing to clean: ${SUPABASE_URL} is not the dev Supabase project.`);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

const TEST_EMAILS = [E2E_GUEST_EMAIL, E2E_USER_EMAIL];

async function deleteTestOrders() {
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id')
    .in('customer_email', TEST_EMAILS);
  if (error) abort(`orders lookup failed: ${error.message}`);
  const ids = (orders ?? []).map((o) => o.id);
  if (ids.length === 0) {
    console.log('[e2e-cleanup] no test orders found');
    return 0;
  }

  // Children first — not all FKs cascade.
  for (const [table, column] of [
    ['coupon_redemptions', 'order_id'],
    ['customer_activity', 'order_id'],
    ['order_items', 'order_id'],
  ]) {
    const { error: delErr } = await supabase.from(table).delete().in(column, ids);
    if (delErr) abort(`${table} delete failed: ${delErr.message}`);
  }
  const { error: ordErr } = await supabase.from('orders').delete().in('id', ids);
  if (ordErr) abort(`orders delete failed: ${ordErr.message}`);
  return ids.length;
}

async function main() {
  console.log(`[e2e-cleanup] target: ${SUPABASE_URL}${PURGE ? ' (--purge)' : ''}`);

  const removedOrders = await deleteTestOrders();

  // Any stray activity rows not tied to an order (e.g. logins by the test user).
  const { error: actErr } = await supabase
    .from('customer_activity')
    .delete()
    .in('customer_email', TEST_EMAILS);
  if (actErr) abort(`customer_activity delete failed: ${actErr.message}`);

  // Remaining redemptions for the test coupon (belt and braces).
  const { data: coupon, error: coupErr } = await supabase
    .from('coupons')
    .select('id')
    .eq('code', COUPON_CODE)
    .maybeSingle();
  if (coupErr) abort(`coupons lookup failed: ${coupErr.message}`);
  if (coupon) {
    const { error } = await supabase
      .from('coupon_redemptions')
      .delete()
      .eq('coupon_id', coupon.id);
    if (error) abort(`coupon_redemptions delete failed: ${error.message}`);
  }

  // Reset fixture products to their seeded stock (or remove them entirely).
  if (PURGE) {
    const { error } = await supabase.from('products').delete().in('slug', PRODUCT_SLUGS);
    if (error) abort(`products purge failed: ${error.message}`);
    if (coupon) {
      const { error: cDelErr } = await supabase.from('coupons').delete().eq('id', coupon.id);
      if (cDelErr) abort(`coupons purge failed: ${cDelErr.message}`);
    }
    console.log('[e2e-cleanup] fixture products + coupon purged');
  } else {
    const { error } = await supabase
      .from('products')
      .update({ quantity: STOCK, active: true })
      .in('slug', PRODUCT_SLUGS);
    if (error) abort(`products stock reset failed: ${error.message}`);
  }

  // Empty the test user's server-side cart.
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listErr) abort(`listUsers failed: ${listErr.message}`);
  const user = list.users.find(
    (u) => u.email?.toLowerCase() === E2E_USER_EMAIL.toLowerCase()
  );
  if (user) {
    const r1 = await supabase.from('cart_items').delete().eq('user_id', user.id);
    if (r1.error) abort(`cart_items delete failed: ${r1.error.message}`);
    const r2 = await supabase
      .from('carts')
      .update({ coupon_id: null, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
    if (r2.error) abort(`carts reset failed: ${r2.error.message}`);
  }

  console.log(
    `[e2e-cleanup] done — orders removed: ${removedOrders}, ` +
      `products ${PURGE ? 'purged' : `reset to quantity=${STOCK}`}, ` +
      `coupon redemptions cleared`
  );
}

main().catch((err) => {
  console.error('[e2e-cleanup] FATAL:', err);
  process.exit(1);
});
