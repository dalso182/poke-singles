import { TestBed } from '@angular/core/testing';
import { OrdersService } from './orders.service';
import { createSupabaseFake } from '../../testing/supabase-fake';
import type { PlaceOrderInput } from '../catalog/catalog.types';

function makeInput(overrides: Partial<PlaceOrderInput> = {}): PlaceOrderInput {
  return {
    items: [{ product_id: 'p1', quantity: 2 }],
    buyer: {
      email: 'buyer@test.local',
      name: 'Test Buyer',
      phone: '88888888',
      address: null,
    },
    shipping_method_id: 'ship-1',
    payment_method: 'sinpe_or_transfer',
    ...overrides,
  };
}

describe('OrdersService.placeOrder', () => {
  let fake: ReturnType<typeof createSupabaseFake>;
  let service: OrdersService;

  beforeEach(() => {
    fake = createSupabaseFake();
    TestBed.configureTestingModule({ providers: [fake.provider] });
    service = TestBed.inject(OrdersService);
  });

  it('calls the place_order RPC with the input under p_input and fires the order email', async () => {
    fake.setRpc('place_order', {
      data: { ok: true, order_id: 'o1', total: 3500 },
    });
    const input = makeInput();

    const result = await service.placeOrder(input);

    expect(result).toEqual({ ok: true, order_id: 'o1', total: 3500 });
    expect(fake.rpcCalls).toEqual([
      { fn: 'place_order', args: { p_input: input } },
    ]);
    // The email invoke is fire-and-forget (void'ed promise) — flush microtasks.
    await Promise.resolve();
    expect(fake.invokeCalls).toEqual([
      {
        name: 'send-order-email',
        options: { body: { order_id: 'o1', email: 'buyer@test.local' } },
      },
    ]);
  });

  it('returns a business error as-is and does not send the email', async () => {
    fake.setRpc('place_order', {
      data: { ok: false, error: 'INSUFFICIENT_STOCK' },
    });

    const result = await service.placeOrder(makeInput());

    expect(result).toEqual({ ok: false, error: 'INSUFFICIENT_STOCK' });
    await Promise.resolve();
    expect(fake.invokeCalls).toEqual([]);
  });

  it('maps a transport error to RPC_ERROR and does not send the email', async () => {
    fake.setRpc('place_order', {
      data: null,
      error: { message: 'network down' },
    });

    const result = await service.placeOrder(makeInput());

    expect(result).toEqual({ ok: false, error: 'RPC_ERROR' });
    await Promise.resolve();
    expect(fake.invokeCalls).toEqual([]);
  });
});
