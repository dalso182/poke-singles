import { computed, signal } from '@angular/core';
import type { Provider } from '@angular/core';
import { CartService } from '../core/cart/cart.service';
import type {
  AppliedCoupon,
  CartLine,
  CouponErrorCode,
  LineCoupon,
} from '../core/catalog/catalog.types';

/**
 * CartService fake for component specs (checkout, cart drawer, coupon field).
 * No vitest imports — tsconfig.app.json type-checks this file as app code.
 * Writable signals let tests mutate cart state directly; itemCount/subtotal
 * derive from items the same way the real service does.
 */

export interface CartFake {
  provider: Provider;
  items: ReturnType<typeof signal<CartLine[]>>;
  appliedCoupon: ReturnType<typeof signal<AppliedCoupon | null>>;
  /** Stub — set the value your test needs; the real service computes it. */
  discount: ReturnType<typeof signal<number>>;
  clearCalls: number;
}

export function createCartFake(initial: CartLine[] = []): CartFake {
  const items = signal<CartLine[]>(initial);
  const appliedCoupon = signal<AppliedCoupon | null>(null);
  const discount = signal(0);
  const couponDroppedTick = signal<{
    error: CouponErrorCode;
    gap?: number;
    at: number;
  } | null>(null);

  const fake = {
    items,
    appliedCoupon,
    discount,
    couponDroppedTick,
    loading: signal(false),
    drawerOpen: signal(false),
    itemCount: computed(() => items().reduce((n, l) => n + l.quantity, 0)),
    subtotal: computed(() =>
      items().reduce((s, l) => s + l.price * l.quantity, 0),
    ),
    total: computed(
      () =>
        items().reduce((s, l) => s + l.price * l.quantity, 0) - discount(),
    ),
    lineCoupon: computed(() => new Map<string, LineCoupon>()),
    clear: async () => {
      result.clearCalls++;
      items.set([]);
      appliedCoupon.set(null);
    },
    applyCoupon: async (_code: string) => ({}),
    removeCoupon: async () => {
      appliedCoupon.set(null);
    },
    add: async () => ({}),
    setQuantity: async () => ({}),
    remove: async () => undefined,
    openDrawer: () => undefined,
    closeDrawer: () => undefined,
  };

  const result: CartFake = {
    provider: { provide: CartService, useValue: fake as unknown as CartService },
    items,
    appliedCoupon,
    discount,
    clearCalls: 0,
  };
  return result;
}

/** CartLine fixture with sensible defaults; override what the test cares about. */
export function makeCartLine(overrides: Partial<CartLine> = {}): CartLine {
  return {
    product_id: 'p1',
    quantity: 1,
    added_at: '2026-01-01T00:00:00.000Z',
    name: 'Test Card',
    slug: 'test-card',
    image_url: null,
    price: 1000,
    stock: 10,
    condition: 'NM',
    card_number: '001/100',
    type1: null,
    type2: null,
    set_name: null,
    category_id: 'cat-singles',
    ...overrides,
  };
}
