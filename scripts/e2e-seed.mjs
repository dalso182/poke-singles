// Seed the dev DB with the fixtures the Playwright checkout suite expects.
//
// Usage:
//   npm run e2e:seed          — also runs automatically via e2e/global-setup.ts
//
// Idempotent: re-runs reset the fixture products' stock/flags, reuse the
// existing test user, and reset the test coupon's redemptions, so every
// suite run starts from the same state.
//
// Auth: reads SUPABASE_DEV_URL + SUPABASE_DEV_SERVICE_ROLE_KEY from .env.local,
// plus E2E_USER_EMAIL + E2E_USER_PASSWORD for the signed-in spec.
// The service role key bypasses RLS — DEV ONLY.

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(REPO_ROOT, '.env.local') });

const SUPABASE_URL = process.env.SUPABASE_DEV_URL;
const SUPABASE_KEY = process.env.SUPABASE_DEV_SERVICE_ROLE_KEY;
const E2E_USER_EMAIL = process.env.E2E_USER_EMAIL;
const E2E_USER_PASSWORD = process.env.E2E_USER_PASSWORD;

export const E2E_GUEST_EMAIL = 'e2e-guest@test.local';
/** Dev-only admin (app_metadata.role = 'admin') for RPCs behind is_admin(). */
const E2E_ADMIN_EMAIL = 'e2e-admin@test.local';
const COUPON_CODE = 'E2ETEST10';
/** Single-use coupon for the COUPON_LIMIT RPC test. */
const LIMIT_COUPON_CODE = 'E2ELIMIT1';
/** Shipping method restricted to a category id that can never exist, so the
 *  SHIPPING_NOT_ALLOWED_FOR_CART path is testable at the RPC level while the
 *  method stays invisible to real storefront carts (subset check always fails). */
const RESTRICTED_METHOD_NAME = '[E2E] Restricted (RPC test)';
const BOGUS_CATEGORY_ID = '11111111-1111-1111-1111-111111111111';
const FIXTURES_PATH = path.join(REPO_ROOT, 'e2e', '.fixtures.json');

const PRODUCTS = [
  {
    slug: 'e2e-test-card-a',
    name: '[E2E] Test Card A',
    price: 1000,
  },
  {
    slug: 'e2e-test-card-b',
    name: '[E2E] Test Card B',
    price: 2500,
  },
];
const STOCK = 10;

function abort(msg) {
  console.error(`[e2e-seed] ${msg}`);
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
  abort(
    'Missing SUPABASE_DEV_URL or SUPABASE_DEV_SERVICE_ROLE_KEY in .env.local. ' +
      'Copy from Supabase dashboard → Project Settings → API.'
  );
}
// Safety: this script writes fixtures + resets stock — dev project only.
if (!SUPABASE_URL.includes('fdscdinfpmvswinpasdg')) {
  abort(`Refusing to seed: ${SUPABASE_URL} is not the dev Supabase project.`);
}
if (!E2E_USER_EMAIL || !E2E_USER_PASSWORD) {
  abort(
    'Missing E2E_USER_EMAIL or E2E_USER_PASSWORD in .env.local. Add e.g.\n' +
      '  E2E_USER_EMAIL=e2e-checkout@test.local\n' +
      '  E2E_USER_PASSWORD=<any strong password>\n' +
      'The seed creates/reuses this dev-only auth user for the signed-in spec.'
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

async function getSinglesCategoryId() {
  const { data, error } = await supabase
    .from('categories')
    .select('id')
    .eq('slug', 'singles')
    .maybeSingle();
  if (error) abort(`categories lookup failed: ${error.message}`);
  if (!data) abort('No `singles` category in dev DB — create it via /admin/categories.');
  return data.id;
}

async function upsertProducts(categoryId) {
  const rows = [];
  for (const p of PRODUCTS) {
    const base = {
      name: p.name,
      price: p.price,
      sale_price: null,
      quantity: STOCK,
      active: true,
      category_id: categoryId,
      condition: 'NM',
      language: 'EN',
      variant: 'normal',
      image_url: null,
    };
    const { data: existing, error: selErr } = await supabase
      .from('products')
      .select('id')
      .eq('slug', p.slug)
      .maybeSingle();
    if (selErr) abort(`products lookup failed for ${p.slug}: ${selErr.message}`);

    if (existing) {
      const { error } = await supabase.from('products').update(base).eq('id', existing.id);
      if (error) abort(`products update failed for ${p.slug}: ${error.message}`);
      rows.push({ id: existing.id, slug: p.slug, name: p.name, price: p.price });
      console.log(`[e2e-seed] product ${p.slug}: existing, stock/flags reset`);
    } else {
      const { data, error } = await supabase
        .from('products')
        .insert({ ...base, slug: p.slug })
        .select('id')
        .single();
      if (error) abort(`products insert failed for ${p.slug}: ${error.message}`);
      rows.push({ id: data.id, slug: p.slug, name: p.name, price: p.price });
      console.log(`[e2e-seed] product ${p.slug}: created`);
    }
  }
  return rows;
}

// app_metadata is ALWAYS (re)written — the customer fixture must be provably
// non-admin on every seed, so stale role:'admin' (from a botched run or a
// manual dashboard edit) can't silently break the NOT_ADMIN / RLS assertions.
async function ensureUser(email, { appMetadata = { role: 'customer' } } = {}) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: E2E_USER_PASSWORD,
    email_confirm: true,
    app_metadata: appMetadata,
  });
  if (!error) {
    console.log(`[e2e-seed] user ${email}: created`);
    return data.user.id;
  }
  if (!/already/i.test(error.message)) {
    abort(`createUser failed for ${email}: ${error.message}`);
  }
  // Already exists — find the id (dev user count is small; one page is enough).
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listErr) abort(`listUsers failed: ${listErr.message}`);
  const user = list.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );
  if (!user) abort(`user ${email} exists but was not found via listUsers`);
  // Keep password + role in sync with .env.local so sign-in never drifts.
  const { error: updErr } = await supabase.auth.admin.updateUserById(user.id, {
    password: E2E_USER_PASSWORD,
    app_metadata: appMetadata,
  });
  if (updErr) abort(`updateUserById failed for ${email}: ${updErr.message}`);
  console.log(`[e2e-seed] user ${email}: existing, password synced`);
  return user.id;
}

async function ensureUserProfile(userId) {
  // A favorite Pokémon pre-set keeps the post-login avatar-picker onboarding
  // dialog from opening over the checkout flow during the signed-in spec.
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, avatar_pokemon_number: 25 }, { onConflict: 'id' });
  if (error) abort(`profiles upsert failed: ${error.message}`);
  console.log('[e2e-seed] test user profile: avatar set');
}

async function resetUserCart(userId) {
  const r1 = await supabase.from('cart_items').delete().eq('user_id', userId);
  if (r1.error) abort(`cart_items reset failed: ${r1.error.message}`);
  const r2 = await supabase
    .from('carts')
    .update({ coupon_id: null, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (r2.error) abort(`carts reset failed: ${r2.error.message}`);
  console.log('[e2e-seed] test user cart cleared');
}

async function upsertCoupon(userId, { code, name, maxUses }) {
  const base = {
    name,
    type: 'PERCENTAGE',
    discount_value: 10,
    min_purchase_amount: null,
    category_ids: null,
    is_active: true,
    deleted_at: null,
    max_uses_per_user: maxUses,
    expires_at: '2030-01-01T00:00:00Z',
  };
  const { data: existing, error: selErr } = await supabase
    .from('coupons')
    .select('id')
    .eq('code', code)
    .maybeSingle();
  if (selErr) abort(`coupons lookup failed: ${selErr.message}`);

  let couponId;
  if (existing) {
    const { error } = await supabase.from('coupons').update(base).eq('id', existing.id);
    if (error) abort(`coupons update failed: ${error.message}`);
    couponId = existing.id;
    console.log(`[e2e-seed] coupon ${code}: existing, reset`);
  } else {
    const { data, error } = await supabase
      .from('coupons')
      .insert({ ...base, code })
      .select('id')
      .single();
    if (error) abort(`coupons insert failed: ${error.message}`);
    couponId = data.id;
    console.log(`[e2e-seed] coupon ${code}: created`);
  }

  // Reset the per-user redemption count so the cap never blocks a run.
  const { error: redErr } = await supabase
    .from('coupon_redemptions')
    .delete()
    .eq('coupon_id', couponId)
    .or(`user_id.eq.${userId},guest_email.eq.${E2E_GUEST_EMAIL}`);
  if (redErr) abort(`coupon_redemptions reset failed: ${redErr.message}`);
  return couponId;
}

async function ensureRestrictedShippingMethod() {
  const base = {
    description: 'Fixture del RPC test SHIPPING_NOT_ALLOWED_FOR_CART — no usar.',
    requires_address: false,
    price: 0,
    sort_order: 999,
    is_active: true,
    allowed_category_ids: [BOGUS_CATEGORY_ID],
  };
  const { data: existing, error: selErr } = await supabase
    .from('shipping_methods')
    .select('id')
    .eq('name', RESTRICTED_METHOD_NAME)
    .maybeSingle();
  if (selErr) abort(`shipping_methods lookup failed: ${selErr.message}`);

  if (existing) {
    const { error } = await supabase
      .from('shipping_methods')
      .update({ ...base, deleted_at: null })
      .eq('id', existing.id);
    if (error) abort(`shipping_methods update failed: ${error.message}`);
    console.log(`[e2e-seed] restricted method: existing, reset`);
    return existing.id;
  }
  const { data, error } = await supabase
    .from('shipping_methods')
    .insert({ ...base, name: RESTRICTED_METHOD_NAME })
    .select('id')
    .single();
  if (error) abort(`shipping_methods insert failed: ${error.message}`);
  console.log(`[e2e-seed] restricted method: created`);
  return data.id;
}

async function findPickupShippingMethod() {
  const { data, error } = await supabase
    .from('shipping_methods')
    .select('id, name, price, requires_address, allowed_category_ids')
    .eq('is_active', true)
    .is('deleted_at', null)
    .eq('requires_address', false)
    .order('sort_order', { ascending: true });
  if (error) abort(`shipping_methods lookup failed: ${error.message}`);
  const pickup = (data ?? []).find(
    (m) => (m.allowed_category_ids ?? []).length === 0
  );
  if (!pickup) {
    abort(
      'No active, category-unrestricted shipping method with requires_address=false ' +
        'in dev. The e2e suite needs a pickup-style method (e.g. "Retiro Showroom") — ' +
        'create one via /admin/shipping-methods.'
    );
  }
  console.log(`[e2e-seed] pickup shipping method: ${pickup.name} (₡${pickup.price})`);
  return pickup;
}

async function main() {
  console.log(`[e2e-seed] target: ${SUPABASE_URL}`);
  const categoryId = await getSinglesCategoryId();
  const products = await upsertProducts(categoryId);
  const userId = await ensureUser(E2E_USER_EMAIL);
  const adminId = await ensureUser(E2E_ADMIN_EMAIL, {
    appMetadata: { role: 'admin' },
  });
  await ensureUserProfile(userId);
  await resetUserCart(userId);
  const couponId = await upsertCoupon(userId, {
    code: COUPON_CODE,
    name: '[E2E] Test coupon',
    maxUses: 1000,
  });
  const limitCouponId = await upsertCoupon(userId, {
    code: LIMIT_COUPON_CODE,
    name: '[E2E] Single-use coupon (RPC test)',
    maxUses: 1,
  });
  const restrictedMethodId = await ensureRestrictedShippingMethod();
  const pickup = await findPickupShippingMethod();

  const fixtures = {
    products,
    user: { id: userId, email: E2E_USER_EMAIL },
    admin: { id: adminId, email: E2E_ADMIN_EMAIL },
    guestEmail: E2E_GUEST_EMAIL,
    coupon: { id: couponId, code: COUPON_CODE, percent: 10 },
    limitCoupon: { id: limitCouponId, code: LIMIT_COUPON_CODE, percent: 10 },
    pickupMethod: { id: pickup.id, name: pickup.name, price: pickup.price },
    restrictedMethod: { id: restrictedMethodId, name: RESTRICTED_METHOD_NAME },
    seededAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(FIXTURES_PATH), { recursive: true });
  fs.writeFileSync(FIXTURES_PATH, JSON.stringify(fixtures, null, 2));
  console.log(`[e2e-seed] fixtures written → ${path.relative(REPO_ROOT, FIXTURES_PATH)}`);
}

main().catch((err) => {
  console.error('[e2e-seed] FATAL:', err);
  process.exit(1);
});
