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
const E2E_ADMIN_EMAIL = 'e2e-admin@test.local';
const E2E_GUEST_EMAIL = 'e2e-guest@test.local';
const COUPON_CODES = ['E2ETEST10', 'E2ELIMIT1'];
const RESTRICTED_METHOD_NAME = '[E2E] Restricted (RPC test)';
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
if (!SUPABASE_URL.includes('fdscdinfpmvswinpasdg')) {
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

  // Payment-proof objects live under payment-proofs/<order_id>/ — remove them
  // before the order rows so the private bucket doesn't accumulate orphans.
  for (const id of ids) {
    const { data: files, error: listErr } = await supabase.storage
      .from('payment-proofs')
      .list(id);
    if (listErr) abort(`payment-proofs list failed for ${id}: ${listErr.message}`);
    if (files?.length) {
      const { error: rmErr } = await supabase.storage
        .from('payment-proofs')
        .remove(files.map((f) => `${id}/${f.name}`));
      if (rmErr) abort(`payment-proofs remove failed for ${id}: ${rmErr.message}`);
    }
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

  // Remaining redemptions for the test coupons (belt and braces).
  const { data: coupons, error: coupErr } = await supabase
    .from('coupons')
    .select('id')
    .in('code', COUPON_CODES);
  if (coupErr) abort(`coupons lookup failed: ${coupErr.message}`);
  const couponIds = (coupons ?? []).map((c) => c.id);
  if (couponIds.length) {
    const { error } = await supabase
      .from('coupon_redemptions')
      .delete()
      .in('coupon_id', couponIds);
    if (error) abort(`coupon_redemptions delete failed: ${error.message}`);
  }

  // Reset fixture products to their seeded stock (or remove them entirely).
  if (PURGE) {
    const { error } = await supabase.from('products').delete().in('slug', PRODUCT_SLUGS);
    if (error) abort(`products purge failed: ${error.message}`);
    if (couponIds.length) {
      const { error: cDelErr } = await supabase.from('coupons').delete().in('id', couponIds);
      if (cDelErr) abort(`coupons purge failed: ${cDelErr.message}`);
    }
    const { error: smErr } = await supabase
      .from('shipping_methods')
      .delete()
      .eq('name', RESTRICTED_METHOD_NAME);
    if (smErr) abort(`shipping_methods purge failed: ${smErr.message}`);
    console.log('[e2e-cleanup] fixture products + coupons + restricted method purged');
    // The auth users too — above all the seeded ADMIN account: leaving an
    // admin login with the shared test password in the project defeats the
    // point of a purge (and this "dev" instance has been promoted to prod
    // once before).
    const { data: userList, error: purgeListErr } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (purgeListErr) abort(`listUsers failed: ${purgeListErr.message}`);
    for (const email of [E2E_ADMIN_EMAIL, E2E_USER_EMAIL]) {
      const u = userList.users.find(
        (x) => x.email?.toLowerCase() === email.toLowerCase()
      );
      if (!u) continue;
      const { error: delErr } = await supabase.auth.admin.deleteUser(u.id);
      if (delErr) abort(`deleteUser failed for ${email}: ${delErr.message}`);
      console.log(`[e2e-cleanup] auth user ${email}: deleted`);
    }
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
    // Loyalty rows survive order deletion (order_id → set null) — sweep them.
    const r3 = await supabase
      .from('loyalty_transactions')
      .delete()
      .eq('user_id', user.id);
    if (r3.error) abort(`loyalty_transactions delete failed: ${r3.error.message}`);
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
