import { expect, test } from '@playwright/test';
import {
  loadFixtures,
  makeGuestOrderInput,
  serviceClient,
  signedInClient,
} from './helpers';

/**
 * DB-level test of the order-cancellation invariants — the money-and-inventory
 * contract of the store:
 *
 *   place (signed-in, coupon) → paid (loyalty trigger awards points)
 *   → cancel_order (admin) → stock restored, coupon redemption released,
 *     points reversed, status cancelled → second cancel is ALREADY_TERMINAL.
 *
 * Also proves the RPC's authz: a signed-in NON-admin gets NOT_ADMIN.
 * Loyalty settings are forced on for the test and restored afterwards.
 */

const fx = loadFixtures();
const cardB = fx.products.find((p) => p.slug === 'e2e-test-card-b')!;
const db = serviceClient();
const password = process.env['E2E_USER_PASSWORD']!;

// cardB ₡2500 − 10% coupon = net ₡2250 → 2 points at ₡1000/point.
const COLONES_PER_POINT = 1000;
const NET = cardB.price - cardB.price * (fx.coupon.percent / 100);
const EXPECTED_POINTS = Math.floor(NET / COLONES_PER_POINT);

test('cancel_order restores stock, releases the coupon, and reverses loyalty points', async () => {
  test.setTimeout(90_000);

  // Force loyalty on for a deterministic award; restore whatever dev had.
  // The snapshot MUST be trusted before anything is written — a silently
  // failed read here would make the finally-restore corrupt the shared dev
  // project's real loyalty settings.
  const { data: settingsBefore, error: settingsErr } = await db
    .from('app_settings')
    .select('loyalty_enabled, loyalty_colones_per_point')
    .eq('id', true)
    .single();
  expect(settingsErr).toBeNull();
  expect(settingsBefore).not.toBeNull();
  const { error: forceErr } = await db
    .from('app_settings')
    .update({ loyalty_enabled: true, loyalty_colones_per_point: COLONES_PER_POINT })
    .eq('id', true);
  expect(forceErr).toBeNull();

  try {
    const customer = await signedInClient(fx.user.email, password);
    const stockBefore = (
      await db.from('products').select('quantity').eq('id', cardB.id).single()
    ).data!.quantity as number;

    // Place a signed-in order with the 10% coupon.
    const { data: placed, error: placeErr } = await customer.rpc('place_order', {
      p_input: makeGuestOrderInput(fx, {
        items: [{ product_id: cardB.id, quantity: 1 }],
        buyer: {
          email: fx.user.email,
          name: 'E2E Customer',
          phone: '88881111',
          address: null,
        },
        coupon_code: fx.coupon.code,
      }),
    });
    expect(placeErr).toBeNull();
    expect(placed).toMatchObject({ ok: true });
    const orderId = (placed as { order_id: string }).order_id;
    expect(
      (await db.from('products').select('quantity').eq('id', cardB.id).single()).data!
        .quantity,
    ).toBe(stockBefore - 1);

    // A signed-in NON-admin cannot cancel.
    const { data: denied } = await customer.rpc('cancel_order', {
      p_order_id: orderId,
    });
    expect(denied).toMatchObject({ ok: false, error: 'NOT_ADMIN' });

    // pending → paid (what the admin order screen does) awards points once.
    await db.from('orders').update({ status: 'paid' }).eq('id', orderId);
    const { data: earns } = await db
      .from('loyalty_transactions')
      .select('amount, kind')
      .eq('order_id', orderId);
    expect(earns).toEqual([{ amount: EXPECTED_POINTS, kind: 'earn' }]);

    // Admin cancels: every side effect must unwind.
    const admin = await signedInClient(fx.admin.email, password);
    const { data: cancelled, error: cancelErr } = await admin.rpc('cancel_order', {
      p_order_id: orderId,
      p_notes: 'e2e invariants test',
    });
    expect(cancelErr).toBeNull();
    expect(cancelled).toMatchObject({ ok: true });

    const { data: orderAfter } = await db
      .from('orders')
      .select('status, cancellation_notes')
      .eq('id', orderId)
      .single();
    expect(orderAfter).toMatchObject({
      status: 'cancelled',
      cancellation_notes: 'e2e invariants test',
    });

    // Stock back where it started.
    expect(
      (await db.from('products').select('quantity').eq('id', cardB.id).single()).data!
        .quantity,
    ).toBe(stockBefore);

    // Coupon redemption released (max_uses_per_user counter goes back down).
    const { count: redemptions } = await db
      .from('coupon_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', orderId);
    expect(redemptions).toBe(0);

    // Points clawed back: earn + reversal net to zero.
    const { data: ledger } = await db
      .from('loyalty_transactions')
      .select('amount, kind')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });
    expect(ledger).toEqual([
      { amount: EXPECTED_POINTS, kind: 'earn' },
      { amount: -EXPECTED_POINTS, kind: 'reversal' },
    ]);

    // Cancelling twice is rejected.
    const { data: again } = await admin.rpc('cancel_order', { p_order_id: orderId });
    expect(again).toMatchObject({ ok: false, error: 'ALREADY_TERMINAL' });
  } finally {
    // Exact captured values, no fallbacks — the snapshot was asserted valid
    // before anything was written.
    const { error: restoreErr } = await db
      .from('app_settings')
      .update({
        loyalty_enabled: settingsBefore!.loyalty_enabled,
        loyalty_colones_per_point: settingsBefore!.loyalty_colones_per_point,
      })
      .eq('id', true);
    if (restoreErr) {
      throw new Error(
        `FAILED to restore app_settings loyalty values (enabled=` +
          `${settingsBefore!.loyalty_enabled}, per_point=` +
          `${settingsBefore!.loyalty_colones_per_point}) — restore manually: ` +
          restoreErr.message,
      );
    }
  }
});
