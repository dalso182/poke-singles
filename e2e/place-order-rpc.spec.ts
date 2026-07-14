import { expect, test } from '@playwright/test';
import { anonClient, loadFixtures, makeGuestOrderInput, serviceClient } from './helpers';

/**
 * DB-level tests of the place_order RPC's failure paths — no browser.
 * Calls the function exactly like a guest storefront session (anon key) and
 * verifies both the returned error code AND that a failed order writes
 * nothing: stock, orders, and coupon_redemptions all unchanged. The business
 * rules live in SQL (v10 as of writing), so these are the regression net for
 * migrations.
 */

const fx = loadFixtures();
const cardA = fx.products.find((p) => p.slug === 'e2e-test-card-a')!;
const db = serviceClient();
const anon = anonClient();

const makeInput = (overrides: Record<string, unknown> = {}) =>
  makeGuestOrderInput(fx, overrides);

async function placeOrder(
  input: ReturnType<typeof makeInput>,
): Promise<Record<string, unknown>> {
  const { data, error } = await anon.rpc('place_order', { p_input: input });
  expect(error).toBeNull();
  return data as Record<string, unknown>;
}

/** Everything a failed place_order must leave untouched. */
async function snapshot() {
  const { data: product } = await db
    .from('products')
    .select('quantity')
    .eq('id', cardA.id)
    .single();
  const { count: orders } = await db
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('customer_email', fx.guestEmail);
  const { count: redemptions } = await db
    .from('coupon_redemptions')
    .select('id', { count: 'exact', head: true })
    .in('coupon_id', [fx.coupon.id, fx.limitCoupon.id]);
  return {
    stock: product!.quantity as number,
    orders: orders ?? 0,
    redemptions: redemptions ?? 0,
  };
}

async function expectNothingWritten(before: Awaited<ReturnType<typeof snapshot>>) {
  expect(await snapshot()).toEqual(before);
}

test('INSUFFICIENT_STOCK: over-ordering rejects and writes nothing', async () => {
  const before = await snapshot();

  const result = await placeOrder(
    makeInput({ items: [{ product_id: cardA.id, quantity: before.stock + 1 }] }),
  );

  expect(result).toMatchObject({
    ok: false,
    error: 'INSUFFICIENT_STOCK',
    product_id: cardA.id,
    available: before.stock,
  });
  await expectNothingWritten(before);
});

test('PRODUCT_UNAVAILABLE: an inactive product rejects the whole order', async () => {
  const before = await snapshot();
  await db.from('products').update({ active: false }).eq('id', cardA.id);
  try {
    const result = await placeOrder(makeInput());
    expect(result).toMatchObject({
      ok: false,
      error: 'PRODUCT_UNAVAILABLE',
      product_id: cardA.id,
    });
    await expectNothingWritten(before);
  } finally {
    await db.from('products').update({ active: true }).eq('id', cardA.id);
  }
});

test('SHIPPING_NOT_ALLOWED_FOR_CART: category-restricted method rejects the cart', async () => {
  const before = await snapshot();
  const result = await placeOrder(
    makeInput({ shipping_method_id: fx.restrictedMethod.id }),
  );
  expect(result).toMatchObject({ ok: false, error: 'SHIPPING_NOT_ALLOWED_FOR_CART' });
  await expectNothingWritten(before);
});

test('COUPON_INVALID: unknown code rejects before touching stock', async () => {
  const before = await snapshot();
  const result = await placeOrder(makeInput({ coupon_code: 'E2E-NO-EXISTE' }));
  expect(result).toMatchObject({ ok: false, error: 'COUPON_INVALID' });
  await expectNothingWritten(before);
});

test('COUPON_LIMIT: the guest-email redemption cap blocks a second use', async () => {
  // Self-resetting: drop this coupon's guest redemptions so retries
  // (--retries/--repeat-each) start from the same state as a fresh seed.
  await db
    .from('coupon_redemptions')
    .delete()
    .eq('coupon_id', fx.limitCoupon.id)
    .eq('guest_email', fx.guestEmail);
  const before = await snapshot();

  // First redemption of the single-use coupon succeeds…
  const first = await placeOrder(makeInput({ coupon_code: fx.limitCoupon.code }));
  expect(first).toMatchObject({ ok: true });
  expect(first['total']).toBe(
    cardA.price - cardA.price * (fx.limitCoupon.percent / 100) + fx.pickupMethod.price,
  );
  const afterFirst = await snapshot();
  expect(afterFirst).toEqual({
    stock: before.stock - 1,
    orders: before.orders + 1,
    redemptions: before.redemptions + 1,
  });

  // …the second, same guest email, hits max_uses_per_user = 1 and writes nothing.
  const second = await placeOrder(makeInput({ coupon_code: fx.limitCoupon.code }));
  expect(second).toMatchObject({ ok: false, error: 'COUPON_LIMIT' });
  await expectNothingWritten(afterFirst);
});
