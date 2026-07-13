import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';

import { Checkout } from './checkout';
import { AuthService } from '../../core/auth/auth.service';
import { ProfilesService } from '../../core/auth/profiles.service';
import { OrdersService } from '../../core/orders/orders.service';
import { ShippingMethodsService } from '../../core/catalog/shipping-methods.service';
import { createSupabaseFake } from '../../testing/supabase-fake';
import { createCartFake, makeCartLine } from '../../testing/cart-fake';
import type {
  PlaceOrderInput,
  PlaceOrderResult,
  ShippingMethodRow,
} from '../../core/catalog/catalog.types';

function makeMethod(overrides: Partial<ShippingMethodRow> = {}): ShippingMethodRow {
  return {
    id: 'm-pickup',
    name: 'Retiro Showroom',
    description: null,
    requires_address: false,
    price: 0,
    sort_order: 0,
    is_active: true,
    allowed_category_ids: [],
    deleted_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const PICKUP = makeMethod();
const DELIVERY_CAT_A = makeMethod({
  id: 'm-cat-a',
  name: 'Correos (solo singles)',
  requires_address: true,
  price: 2000,
  allowed_category_ids: ['catA'],
});
const DELIVERY_CAT_AB = makeMethod({
  id: 'm-cat-ab',
  name: 'Uber (singles y sellado)',
  requires_address: true,
  price: 3000,
  allowed_category_ids: ['catA', 'catB'],
});

describe('Checkout', () => {
  let fixture: ComponentFixture<Checkout>;
  let component: Checkout;
  let cartFake: ReturnType<typeof createCartFake>;
  let placeOrderCalls: PlaceOrderInput[];
  let placeOrderResult: PlaceOrderResult;
  let snackOpen: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.fn>;

  async function setup(opts: {
    methods?: ShippingMethodRow[];
    lines?: ReturnType<typeof makeCartLine>[];
  } = {}) {
    const methods = opts.methods ?? [PICKUP, DELIVERY_CAT_A, DELIVERY_CAT_AB];
    cartFake = createCartFake(
      opts.lines ?? [makeCartLine({ category_id: 'catA' })],
    );
    placeOrderCalls = [];
    placeOrderResult = { ok: true, order_id: 'o9', total: 1000 };
    const supabase = createSupabaseFake();

    await TestBed.configureTestingModule({
      imports: [Checkout],
      providers: [
        provideRouter([]),
        supabase.provider,
        cartFake.provider,
        {
          provide: AuthService,
          useValue: {
            ready: Promise.resolve(),
            currentUser: signal(null).asReadonly(),
            isSignedIn: signal(false).asReadonly(),
          },
        },
        { provide: ProfilesService, useValue: { getMine: async () => null } },
        {
          provide: OrdersService,
          useValue: {
            placeOrder: async (input: PlaceOrderInput) => {
              placeOrderCalls.push(input);
              return placeOrderResult;
            },
          },
        },
        {
          provide: ShippingMethodsService,
          useValue: { listActive: async () => methods },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Checkout);
    component = fixture.componentInstance;
    // MatSnackBarModule (in the component's imports) provides MatSnackBar in
    // the standalone injector, shadowing any TestBed useValue — spy on the
    // instance the component actually injected instead.
    snackOpen = vi
      .spyOn(
        (component as unknown as { snack: MatSnackBar }).snack,
        'open',
      )
      .mockReturnValue(undefined as never) as unknown as ReturnType<typeof vi.fn>;
    // No confirmation route is registered in the test router — stub navigate
    // so the success path doesn't reject with NG04002.
    navigate = vi
      .spyOn(TestBed.inject(Router), 'navigate')
      .mockResolvedValue(true) as unknown as ReturnType<typeof vi.fn>;
    fixture.detectChanges(); // runs ngOnInit → bootstrap()
    await flush();
  }

  /** Lets the async bootstrap settle, then flushes effects + re-renders. */
  async function flush() {
    await new Promise((r) => setTimeout(r, 0));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const c = () =>
    component as unknown as {
      visibleShippingMethods(): ShippingMethodRow[];
      selectedMethodRequiresAddress(): boolean;
      placing(): boolean;
      form: {
        controls: Record<string, {
          value: unknown;
          valid: boolean;
          setValue(v: unknown): void;
          hasError(e: string): boolean;
        }>;
        valid: boolean;
        patchValue(v: Record<string, unknown>): void;
      };
      onSubmit(): Promise<void>;
      mapErrorCode(code: string): string;
    };

  function fillContactForm() {
    // Email stays unpadded — Validators.email rejects surrounding whitespace,
    // so trimming is proven via name/phone instead.
    c().form.patchValue({
      email: 'buyer@test.local',
      name: '  Ash Ketchum ',
      phone: ' 88881234 ',
    });
  }

  describe('visibleShippingMethods', () => {
    it('offers a method only when every cart category is allowed by it', async () => {
      await setup({ lines: [makeCartLine({ category_id: 'catA' })] });
      expect(c().visibleShippingMethods().map((m) => m.id)).toEqual([
        'm-pickup',
        'm-cat-a',
        'm-cat-ab',
      ]);

      // catC is not in any allow-list → only the unrestricted method remains.
      cartFake.items.set([
        makeCartLine({ product_id: 'a', category_id: 'catA' }),
        makeCartLine({ product_id: 'x', category_id: 'catC' }),
      ]);
      expect(c().visibleShippingMethods().map((m) => m.id)).toEqual(['m-pickup']);
    });
  });

  describe('default shipping selection', () => {
    it('selects the first visible method and falls back when the cart hides it', async () => {
      await setup({
        methods: [DELIVERY_CAT_A, PICKUP],
        lines: [makeCartLine({ category_id: 'catA' })],
      });
      expect(c().form.controls['shipping_method_id'].value).toBe('m-cat-a');

      // Cart gains a category the selected method doesn't serve.
      cartFake.items.set([makeCartLine({ category_id: 'catC' })]);
      await flush();
      expect(c().form.controls['shipping_method_id'].value).toBe('m-pickup');
    });
  });

  describe('address validators', () => {
    it('requires the address only for methods with requires_address', async () => {
      await setup();
      fillContactForm();

      // Default selection is the pickup method → address fields optional.
      expect(c().form.controls['shipping_method_id'].value).toBe('m-pickup');
      expect(c().form.controls['line1'].valid).toBe(true);
      expect(c().form.valid).toBe(true);

      // Switch to a delivery method (guest → editable address form shown).
      c().form.controls['shipping_method_id'].setValue('m-cat-a');
      await flush();
      expect(c().form.controls['line1'].hasError('required')).toBe(true);
      expect(c().form.valid).toBe(false);
    });
  });

  describe('onSubmit', () => {
    it('builds the PlaceOrderInput, clears the cart, and navigates to confirmation', async () => {
      await setup({
        lines: [
          makeCartLine({ product_id: 'p1', quantity: 2, category_id: 'catA' }),
          makeCartLine({ product_id: 'p2', quantity: 1, category_id: 'catA' }),
        ],
      });
      cartFake.appliedCoupon.set({
        coupon_id: 'c1',
        code: 'TEST10',
        type: 'PERCENTAGE',
        discount_value: 10,
        min_purchase_amount: null,
        category_ids: null,
      });
      fillContactForm();

      await c().onSubmit();

      expect(placeOrderCalls).toEqual([
        {
          items: [
            { product_id: 'p1', quantity: 2 },
            { product_id: 'p2', quantity: 1 },
          ],
          buyer: {
            email: 'buyer@test.local',
            name: 'Ash Ketchum',
            phone: '88881234',
            address: null, // pickup method → no address on the order
          },
          shipping_method_id: 'm-pickup',
          payment_method: 'sinpe_or_transfer',
          coupon_code: 'TEST10',
          customer_notes: undefined,
        },
      ]);
      expect(cartFake.clearCalls).toBe(1);
      expect(navigate).toHaveBeenCalledWith(['/checkout/confirmation/o9'], {
        queryParams: { email: 'buyer@test.local' },
      });
    });

    it('includes the trimmed address for methods that require one', async () => {
      await setup({
        methods: [DELIVERY_CAT_A],
        lines: [makeCartLine({ category_id: 'catA' })],
      });
      fillContactForm();
      c().form.patchValue({
        line1: ' Calle 5 ',
        line2: '',
        city: ' San José ',
        province: ' San José ',
        address_notes: ' portón azul ',
      });
      await flush();

      await c().onSubmit();

      expect(placeOrderCalls[0].buyer.address).toEqual({
        line1: 'Calle 5',
        line2: null,
        city: 'San José',
        province: 'San José',
        notes: 'portón azul',
      });
      expect(placeOrderCalls[0].shipping_method_id).toBe('m-cat-a');
    });

    it('shows the mapped error, keeps the cart, and does not navigate on RPC failure', async () => {
      await setup();
      placeOrderResult = { ok: false, error: 'INSUFFICIENT_STOCK' };
      fillContactForm();

      await c().onSubmit();

      expect(snackOpen).toHaveBeenCalledWith(
        'Una de tus cartas se agotó mientras pagabas. Ajusta el carrito.',
        'OK',
        { duration: 5000 },
      );
      expect(navigate).not.toHaveBeenCalled();
      expect(cartFake.clearCalls).toBe(0);
      expect(c().placing()).toBe(false);
    });

    it('blocks an empty cart before calling placeOrder', async () => {
      await setup({ lines: [] });
      fillContactForm();

      await c().onSubmit();

      expect(snackOpen).toHaveBeenCalledWith('Tu carrito está vacío.', 'OK', {
        duration: 3000,
      });
      expect(placeOrderCalls).toEqual([]);
    });
  });

  describe('mapErrorCode', () => {
    it('maps every RPC error code to its Spanish copy', async () => {
      await setup();
      const map = (code: string) => c().mapErrorCode(code);
      expect(map('EMPTY_CART')).toBe('Tu carrito está vacío.');
      expect(map('EMAIL_REQUIRED')).toBe('Necesitamos tu correo electrónico.');
      expect(map('BUYER_INFO_REQUIRED')).toBe('Completa tu nombre y teléfono.');
      expect(map('ADDRESS_REQUIRED')).toBe('Necesitamos tu dirección de envío.');
      expect(map('INVALID_PAYMENT')).toBe('Selecciona un método de pago.');
      expect(map('INVALID_SHIPPING')).toBe('Selecciona un método de envío válido.');
      expect(map('SHIPPING_NOT_ALLOWED_FOR_CART')).toBe(
        'El método de envío elegido no es válido para los productos en tu carrito. Selecciona otro.',
      );
      expect(map('PRODUCT_GONE')).toBe(
        'Una de tus cartas ya no está disponible. Ajusta el carrito.',
      );
      expect(map('PRODUCT_UNAVAILABLE')).toBe(
        'Una de tus cartas ya no está disponible. Ajusta el carrito.',
      );
      expect(map('INSUFFICIENT_STOCK')).toBe(
        'Una de tus cartas se agotó mientras pagabas. Ajusta el carrito.',
      );
      for (const code of [
        'COUPON_INVALID',
        'COUPON_BELOW_MINIMUM',
        'COUPON_NO_ELIGIBLE',
        'COUPON_LIMIT',
      ]) {
        expect(map(code)).toBe('Tu cupón ya no es válido. Quítalo y vuelve a intentar.');
      }
      expect(map('SOMETHING_ELSE')).toBe(
        'No se pudo procesar el pedido. Intenta de nuevo.',
      );
    });
  });
});
