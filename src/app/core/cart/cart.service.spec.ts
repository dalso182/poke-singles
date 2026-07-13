import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CartService } from './cart.service';
import { AuthService } from '../auth/auth.service';
import { createSupabaseFake } from '../../testing/supabase-fake';
import { makeCartLine } from '../../testing/cart-fake';
import type { AppliedCoupon } from '../catalog/catalog.types';

/** Seeds the service's private state the way hydrate would. */
function seed(
  svc: CartService,
  opts: {
    items?: ReturnType<typeof makeCartLine>[];
    coupon?: AppliedCoupon | null;
    userId?: string | null;
  },
) {
  const s = svc as unknown as {
    _items: { set(v: unknown): void };
    _appliedCoupon: { set(v: unknown): void };
    lastUserId: string | null | undefined;
  };
  if (opts.items) s._items.set(opts.items);
  if (opts.coupon !== undefined) s._appliedCoupon.set(opts.coupon);
  if (opts.userId !== undefined) s.lastUserId = opts.userId;
}

function percentCoupon(overrides: Partial<AppliedCoupon> = {}): AppliedCoupon {
  return {
    coupon_id: 'c1',
    code: 'TEST10',
    type: 'PERCENTAGE',
    discount_value: 10,
    min_purchase_amount: null,
    category_ids: null,
    ...overrides,
  };
}

describe('CartService', () => {
  let fake: ReturnType<typeof createSupabaseFake>;
  let svc: CartService;

  beforeEach(() => {
    localStorage.removeItem('cart:v1');
    fake = createSupabaseFake();
    TestBed.configureTestingModule({
      providers: [
        fake.provider,
        // `undefined` = session still hydrating → the constructor auth-effect
        // early-returns, so no hydration side effects fire during the test.
        {
          provide: AuthService,
          useValue: { currentUser: signal(undefined).asReadonly() },
        },
      ],
    });
    svc = TestBed.inject(CartService);
  });

  describe('discount()', () => {
    it('applies a PERCENTAGE coupon only to lines in the coupon categories', () => {
      seed(svc, {
        items: [
          makeCartLine({ product_id: 'a', price: 1000, quantity: 2, category_id: 'catA' }),
          makeCartLine({ product_id: 'b', price: 500, quantity: 1, category_id: 'catB' }),
        ],
        coupon: percentCoupon({ category_ids: ['catA'] }),
      });
      // 10% of the catA lines (2000), not of the 2500 subtotal.
      expect(svc.discount()).toBe(200);
    });

    it('rounds a PERCENTAGE discount to 2 decimals', () => {
      seed(svc, {
        items: [makeCartLine({ price: 333, quantity: 1 })],
        coupon: percentCoupon({ discount_value: 10 }),
      });
      expect(svc.discount()).toBe(33.3);
    });

    it('FIXED_ON_THRESHOLD pays nothing below the minimum and the fixed value at it', () => {
      const coupon = percentCoupon({
        type: 'FIXED_ON_THRESHOLD',
        discount_value: 1000,
        min_purchase_amount: 5000,
      });
      seed(svc, {
        items: [makeCartLine({ price: 2000, quantity: 1 })],
        coupon,
      });
      expect(svc.discount()).toBe(0);

      seed(svc, { items: [makeCartLine({ price: 2500, quantity: 2 })] });
      expect(svc.discount()).toBe(1000);
    });

    it('caps the discount at the eligible subtotal', () => {
      seed(svc, {
        items: [makeCartLine({ price: 800, quantity: 1 })],
        coupon: percentCoupon({
          type: 'FIXED_ON_THRESHOLD',
          discount_value: 3000,
          min_purchase_amount: 500,
        }),
      });
      expect(svc.discount()).toBe(800);
    });
  });

  describe('applyCoupon()', () => {
    it('rejects when signed out without calling the RPC', async () => {
      seed(svc, { userId: null });
      const result = await svc.applyCoupon('TEST10');
      expect(result).toEqual({ error: 'AUTH_REQUIRED' });
      expect(fake.rpcCalls).toEqual([]);
    });

    it('validates via RPC, stores the coupon, and persists it on the carts row', async () => {
      seed(svc, {
        userId: 'u1',
        items: [makeCartLine({ price: 1000, quantity: 3 })],
      });
      fake.setRpc('validate_coupon', {
        data: {
          ok: true,
          coupon_id: 'c9',
          type: 'PERCENTAGE',
          discount_value: 15,
          min_purchase_amount: null,
          category_ids: null,
          expires_at: '2027-01-01T00:00:00Z',
        },
      });

      const result = await svc.applyCoupon('  test15 ');

      expect(result).toEqual({});
      expect(fake.rpcCalls).toEqual([
        { fn: 'validate_coupon', args: { p_code: 'TEST15', p_subtotal: 3000 } },
      ]);
      expect(svc.appliedCoupon()).toEqual({
        coupon_id: 'c9',
        code: 'TEST15',
        type: 'PERCENTAGE',
        discount_value: 15,
        min_purchase_amount: null,
        category_ids: null,
      });
      const upsert = fake.tableCalls.find(
        (c) => c.table === 'carts' && c.method === 'upsert',
      );
      expect(upsert).toBeTruthy();
      expect(upsert!.args[0]).toMatchObject({ user_id: 'u1', coupon_id: 'c9' });
      expect(upsert!.args[1]).toEqual({ onConflict: 'user_id' });
    });

    it('surfaces the RPC business error with its gap', async () => {
      seed(svc, { userId: 'u1' });
      fake.setRpc('validate_coupon', {
        data: { ok: false, error: 'BELOW_MINIMUM', gap: 1500 },
      });
      const result = await svc.applyCoupon('TEST10');
      expect(result).toEqual({ error: 'BELOW_MINIMUM', gap: 1500 });
      expect(svc.appliedCoupon()).toBeNull();
    });
  });

  describe('revalidateAppliedCoupon()', () => {
    const revalidate = (s: CartService) =>
      (s as unknown as { revalidateAppliedCoupon(): Promise<void> })
        .revalidateAppliedCoupon();

    it('drops the coupon and bumps couponDroppedTick when no longer valid', async () => {
      seed(svc, {
        userId: 'u1',
        items: [makeCartLine({ price: 1000, quantity: 1 })],
        coupon: percentCoupon(),
      });
      fake.setRpc('validate_coupon', {
        data: { ok: false, error: 'BELOW_MINIMUM', gap: 500 },
      });

      await revalidate(svc);

      expect(svc.appliedCoupon()).toBeNull();
      expect(svc.couponDroppedTick()).toMatchObject({
        error: 'BELOW_MINIMUM',
        gap: 500,
      });
      // removeCoupon persisted the drop on the carts row.
      const update = fake.tableCalls.find(
        (c) => c.table === 'carts' && c.method === 'update',
      );
      expect(update!.args[0]).toMatchObject({ coupon_id: null });
    });

    it('keeps a coupon the RPC still accepts', async () => {
      seed(svc, {
        userId: 'u1',
        items: [makeCartLine({ price: 9000, quantity: 1 })],
        coupon: percentCoupon(),
      });
      fake.setRpc('validate_coupon', {
        data: { ok: true, coupon_id: 'c1' },
      });

      await revalidate(svc);

      expect(svc.appliedCoupon()).toEqual(percentCoupon());
      expect(svc.couponDroppedTick()).toBeNull();
    });
  });

  describe('clear()', () => {
    it('empties the cart and drops the applied coupon', async () => {
      seed(svc, {
        userId: null,
        items: [makeCartLine()],
        coupon: percentCoupon(),
      });

      await svc.clear();

      expect(svc.items()).toEqual([]);
      expect(svc.appliedCoupon()).toBeNull();
      expect(svc.discount()).toBe(0);
    });
  });
});
