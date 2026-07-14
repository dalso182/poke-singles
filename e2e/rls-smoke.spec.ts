import { expect, test } from '@playwright/test';
import {
  TINY_PNG,
  anonClient,
  loadFixtures,
  makeGuestOrderInput,
  serviceClient,
  signedInClient,
} from './helpers';

/**
 * RLS / leakage smoke tests — guards the CLASS of bug this project has
 * actually shipped (a view missing security_invoker leaked inactive products
 * through search). Reads run with the anon key (guest access level) or a
 * signed-in non-admin; the service client stages/restores state, except where
 * a test's point is that the anon write path itself is allowed.
 */

const fx = loadFixtures();
const cardA = fx.products.find((p) => p.slug === 'e2e-test-card-a')!;
const db = serviceClient();
const anon = anonClient();

test.describe('product visibility', () => {
  for (const [label, hide] of [
    ['inactive product', { active: false }],
    ['zero-stock product', { quantity: 0 }],
  ] as const) {
    test(`${label} is hidden from anon table reads AND search_products`, async () => {
      // Capture the live values — earlier specs' pending orders have consumed
      // stock, so restoring a hardcoded seed constant would resurrect units.
      const { data: before } = await db
        .from('products')
        .select('active, quantity')
        .eq('id', cardA.id)
        .single();
      expect(before).not.toBeNull();

      await db.from('products').update(hide).eq('id', cardA.id);
      try {
        // Direct table read (what the storefront grids do).
        const { data: rows, error } = await anon
          .from('products')
          .select('id')
          .eq('id', cardA.id);
        expect(error).toBeNull();
        expect(rows).toEqual([]);

        // Search RPC (the path that leaked before security_invoker).
        const { data: hits, error: searchErr } = await anon.rpc('search_products', {
          q: 'E2E Test Card A',
        });
        expect(searchErr).toBeNull();
        expect(
          ((hits ?? []) as { id?: string; slug?: string }[]).filter(
            (h) => h.slug === cardA.slug,
          ),
        ).toEqual([]);
      } finally {
        await db
          .from('products')
          .update({ active: before!.active, quantity: before!.quantity })
          .eq('id', cardA.id);
      }
    });
  }

  test('the same product IS visible when active and stocked (sanity)', async () => {
    const { data: rows } = await anon.from('products').select('id').eq('id', cardA.id);
    expect(rows).toHaveLength(1);
  });
});

test.describe('orders', () => {
  let orderId: string;

  test.beforeAll(async () => {
    // Stage a guest order the way a guest would (anon RPC).
    const { data } = await anon.rpc('place_order', {
      p_input: makeGuestOrderInput(fx),
    });
    expect(data).toMatchObject({ ok: true });
    orderId = (data as { order_id: string }).order_id;
  });

  test('anon cannot read the orders table at all', async () => {
    const { data } = await anon.from('orders').select('id').eq('id', orderId);
    expect(data).toEqual([]);
  });

  test('a signed-in customer cannot read someone else’s order', async () => {
    const customer = await signedInClient(
      fx.user.email,
      process.env['E2E_USER_PASSWORD']!,
    );
    const { data } = await customer.from('orders').select('id').eq('id', orderId);
    expect(data).toEqual([]);
  });

  test('get_guest_order is email-gated', async () => {
    const { data: wrong } = await anon.rpc('get_guest_order', {
      p_order_id: orderId,
      p_email: 'otro@correo.com',
    });
    expect(wrong).toBeNull();

    const { data: right } = await anon.rpc('get_guest_order', {
      p_order_id: orderId,
      p_email: fx.guestEmail,
    });
    expect(right).toMatchObject({ order: { id: orderId } });
  });
});

test.describe('payment-proofs bucket', () => {
  test('customers can upload a proof but never read one back', async () => {
    // Stage a guest order; the upload itself is deliberately ANON — that a
    // customer can write (while the order is pending + sinpe) but never read
    // is exactly the policy under test.
    const { data: placed } = await anon.rpc('place_order', {
      p_input: makeGuestOrderInput(fx),
    });
    expect(placed).toMatchObject({ ok: true });
    const orderId = (placed as { order_id: string }).order_id;
    const path = `${orderId}/proof.png`;

    const { error: upErr } = await anon.storage
      .from('payment-proofs')
      .upload(path, TINY_PNG, { contentType: 'image/png' });
    expect(upErr).toBeNull();

    // …but neither anon nor a signed-in non-admin can read it back.
    const { data: anonDl, error: anonErr } = await anon.storage
      .from('payment-proofs')
      .download(path);
    expect(anonDl).toBeNull();
    expect(anonErr).not.toBeNull();

    const customer = await signedInClient(
      fx.user.email,
      process.env['E2E_USER_PASSWORD']!,
    );
    const { data: custDl, error: custErr } = await customer.storage
      .from('payment-proofs')
      .download(path);
    expect(custDl).toBeNull();
    expect(custErr).not.toBeNull();

    // Listing leaks nothing either.
    const { data: listing } = await anon.storage.from('payment-proofs').list(orderId);
    expect(listing ?? []).toEqual([]);
  });
});

test.describe('loyalty ledger', () => {
  test('a staged loyalty row is visible to its owner but never to anon', async () => {
    // Stage a real row — without one, the anon assertion passes vacuously on
    // an empty table and can't catch a broken loyalty_self_read policy.
    const { data: staged, error: stageErr } = await db
      .from('loyalty_transactions')
      .insert({
        user_id: fx.user.id,
        order_id: null,
        amount: 1,
        kind: 'adjust',
        description: '[E2E] RLS probe',
      })
      .select('id')
      .single();
    expect(stageErr).toBeNull();

    try {
      // Control: the owner CAN see it (proves the row is really there and
      // readable through RLS)…
      const customer = await signedInClient(
        fx.user.email,
        process.env['E2E_USER_PASSWORD']!,
      );
      const { data: own } = await customer
        .from('loyalty_transactions')
        .select('id')
        .eq('id', staged!.id);
      expect(own).toHaveLength(1);

      // …anon cannot.
      const { data: leaked } = await anon
        .from('loyalty_transactions')
        .select('id')
        .eq('id', staged!.id);
      expect(leaked).toEqual([]);
    } finally {
      await db.from('loyalty_transactions').delete().eq('id', staged!.id);
    }
  });
});
