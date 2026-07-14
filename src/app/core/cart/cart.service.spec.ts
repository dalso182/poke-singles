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
  let currentUser: ReturnType<typeof signal<{ id: string } | null | undefined>>;

  /** Flushes the constructor auth-effect and lets its async work settle. */
  async function settle() {
    TestBed.tick();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  }

  beforeEach(() => {
    localStorage.removeItem('cart:v1');
    fake = createSupabaseFake();
    // Starts `undefined` (= session still hydrating) so the constructor
    // auth-effect stays inert unless a test drives a transition via settle().
    currentUser = signal<{ id: string } | null | undefined>(undefined);
    TestBed.configureTestingModule({
      providers: [
        fake.provider,
        {
          provide: AuthService,
          useValue: { currentUser: currentUser.asReadonly() },
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

  describe('merge on sign-in', () => {
    const dbProductRow = {
      id: 'p1',
      name: 'Card A',
      slug: 'card-a',
      image_url: null,
      price: 1000,
      sale_price: null,
      quantity: 5,
      condition: 'NM',
      card_number: null,
      type1: null,
      type2: null,
      category_id: 'catA',
      sets: null,
    };

    it('mergeAnonIntoDb sums quantities, caps at stock, and drops gone products', async () => {
      // DB cart already holds p1×1; p3 no longer exists in products.
      fake.setTable('cart_items', { data: [{ product_id: 'p1', quantity: 1 }] });
      fake.setTable('products', {
        data: [
          { id: 'p1', quantity: 3 },
          { id: 'p2', quantity: 4 },
        ],
      });
      const anonItems = [
        { product_id: 'p1', quantity: 2, added_at: '2026-01-01T00:00:00Z' },
        { product_id: 'p2', quantity: 5, added_at: '2026-01-01T00:00:01Z' },
        { product_id: 'p3', quantity: 1, added_at: '2026-01-01T00:00:02Z' },
      ];

      await (
        svc as unknown as {
          mergeAnonIntoDb(items: unknown[], userId: string): Promise<void>;
        }
      ).mergeAnonIntoDb(anonItems, 'u1');

      const upsert = fake.tableCalls.find(
        (c) => c.table === 'cart_items' && c.method === 'upsert',
      );
      expect(upsert!.args[0]).toEqual([
        // 1 in DB + 2 anon = 3, exactly at stock.
        { user_id: 'u1', product_id: 'p1', quantity: 3 },
        // 0 in DB + 5 anon, capped at stock 4.
        { user_id: 'u1', product_id: 'p2', quantity: 4 },
        // p3 dropped: not in the products lookup.
      ]);
      expect(upsert!.args[1]).toEqual({ onConflict: 'user_id,product_id' });
    });

    it('signing in merges the anon cart, clears localStorage, and hydrates from the DB', async () => {
      localStorage.setItem(
        'cart:v1',
        JSON.stringify([
          { product_id: 'p1', quantity: 2, added_at: '2026-01-01T00:00:00Z' },
        ]),
      );
      fake.setTable('products', { data: [dbProductRow] });
      // Serves both the pre-merge read ({product_id, quantity}) and the
      // post-merge hydrateFromDb read (needs the joined products row).
      // DB quantity 4 is deliberately DIFFERENT from the anon quantity 2 so
      // the final items() assertion can only pass if hydrateFromDb actually
      // ran after the merge (not if stale anon state was left behind).
      fake.setTable('cart_items', {
        data: [
          {
            product_id: 'p1',
            quantity: 4,
            added_at: '2026-01-01T00:00:00Z',
            products: dbProductRow,
          },
        ],
      });

      // Session resolves as signed out → cart hydrates from localStorage.
      currentUser.set(null);
      await settle();
      expect(svc.items().map((l) => l.product_id)).toEqual(['p1']);

      // Fresh login → anon cart merges into the DB cart.
      currentUser.set({ id: 'u1' });
      await settle();

      const upsert = fake.tableCalls.find(
        (c) => c.table === 'cart_items' && c.method === 'upsert',
      );
      // 4 already in the DB cart + 2 anon = 6, capped at stock 5.
      expect(upsert!.args[0]).toEqual([
        { user_id: 'u1', product_id: 'p1', quantity: 5 },
      ]);
      // localStorage handed over to the DB cart.
      expect(localStorage.getItem('cart:v1')).toBeNull();
      // Local view now reflects the DB cart (qty 4 — distinct from anon's 2).
      expect(svc.items()).toHaveLength(1);
      expect(svc.items()[0]).toMatchObject({ product_id: 'p1', quantity: 4 });
    });

    it('signing in with no anon items skips the merge entirely', async () => {
      fake.setTable('cart_items', { data: [] });

      currentUser.set(null);
      await settle();
      currentUser.set({ id: 'u1' });
      await settle();

      const upsert = fake.tableCalls.find(
        (c) => c.table === 'cart_items' && c.method === 'upsert',
      );
      expect(upsert).toBeUndefined();
      expect(svc.items()).toEqual([]);
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
