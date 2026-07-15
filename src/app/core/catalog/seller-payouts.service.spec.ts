import { TestBed } from '@angular/core/testing';
import { SellerPayoutsService } from './seller-payouts.service';
import { createSupabaseFake } from '../../testing/supabase-fake';

const RPC_ROW = {
  item_id: 'i1',
  order_id: 'o1',
  order_number: '7301',
  order_created_at: '2026-07-10T12:00:00Z',
  order_status: 'paid',
  payment_method: 'payment_link',
  product_name: 'ETB Prismatic',
  product_slug: 'etb-prismatic-jd',
  product_image_url: null,
  product_set_name: null,
  product_card_number: null,
  seller_id: 's1',
  seller_code: 'JD',
  seller_name: 'Juan',
  quantity: '1',
  unit_price: '30000.00',
  line_total: '30000.00',
  cuanto_fee: '1500',
  store_fee: '2000',
  payout_amount: '26500',
  seller_payout_id: null,
  payout_paid_at: null,
  total_count: '3',
};

describe('SellerPayoutsService', () => {
  let fake: ReturnType<typeof createSupabaseFake>;
  let svc: SellerPayoutsService;

  beforeEach(() => {
    fake = createSupabaseFake();
    TestBed.configureTestingModule({ providers: [fake.provider] });
    svc = TestBed.inject(SellerPayoutsService);
  });

  it('listSealedItems() maps params to RPC args and coerces numerics', async () => {
    fake.setRpc('admin_sealed_payouts_report', { data: [RPC_ROW] });

    const res = await svc.listSealedItems({ sellerId: '', page: 2, pageSize: 50 });

    expect(fake.rpcCalls[0]).toEqual({
      fn: 'admin_sealed_payouts_report',
      args: {
        p_seller_id: null, // '' (Todos) travels as null
        p_pending_only: true, // the default
        p_date_start: null,
        p_date_end: null,
        p_limit: 50,
        p_offset: 50, // page 2
      },
    });
    expect(res.total).toBe(3);
    const row = res.rows[0];
    expect(row.line_total).toBe(30000);
    expect(row.cuanto_fee).toBe(1500);
    expect(row.store_fee).toBe(2000);
    expect(row.payout_amount).toBe(26500);
    expect(row.order_number).toBe(7301);
  });

  it('listSealedItems() returns total 0 on an empty page', async () => {
    fake.setRpc('admin_sealed_payouts_report', { data: [] });
    const res = await svc.listSealedItems();
    expect(res.rows).toEqual([]);
    expect(res.total).toBe(0);
  });

  it('createPayout() parses the ok payload and passes ids + notes', async () => {
    fake.setRpc('create_seller_payout', {
      data: {
        ok: true,
        payout_id: 'p1',
        seller_id: 's1',
        seller_name: 'Juan',
        item_count: '2',
        total_sold: '60000',
        cuanto_fees: '3000',
        store_fees: '4000',
        total: '53000',
      },
    });

    const res = await svc.createPayout(['i1', 'i2']);

    expect(fake.rpcCalls[0]).toEqual({
      fn: 'create_seller_payout',
      args: { p_item_ids: ['i1', 'i2'], p_notes: null },
    });
    expect(res).toEqual({
      payout_id: 'p1',
      seller_id: 's1',
      seller_name: 'Juan',
      item_count: 2,
      total_sold: 60000,
      cuanto_fees: 3000,
      store_fees: 4000,
      total: 53000,
    });
  });

  it('createPayout() rejects with the RPC error code on ok:false', async () => {
    fake.setRpc('create_seller_payout', {
      data: { ok: false, error: 'MIXED_SELLERS' },
    });
    await expect(svc.createPayout(['i1'])).rejects.toThrow('MIXED_SELLERS');
  });

  it('deletePayout() deletes the batch by id', async () => {
    await svc.deletePayout('p1');
    expect(fake.tableCalls).toEqual([
      { table: 'seller_payouts', method: 'delete', args: [] },
      { table: 'seller_payouts', method: 'eq', args: ['id', 'p1'] },
    ]);
  });

  it('listPayouts() orders newest-first, paginates, and reads count', async () => {
    fake.setTable('seller_payouts', {
      data: [
        {
          id: 'p1',
          seller_id: 's1',
          seller_code: 'JD',
          seller_name: 'Juan',
          total_sold: '60000',
          cuanto_fees: '0',
          store_fees: '4000',
          total: '56000',
          item_count: '2',
          notes: null,
          created_at: '2026-07-10T12:00:00Z',
        },
      ],
      count: 7,
    });

    const res = await svc.listPayouts({ page: 1, pageSize: 25 });

    expect(fake.tableCalls).toEqual([
      { table: 'seller_payouts', method: 'select', args: ['*', { count: 'exact' }] },
      { table: 'seller_payouts', method: 'order', args: ['created_at', { ascending: false }] },
      { table: 'seller_payouts', method: 'range', args: [0, 24] },
    ]);
    expect(res.total).toBe(7);
    expect(res.rows[0].total).toBe(56000);
    expect(res.rows[0].item_count).toBe(2);
  });

  it('listPayouts() filters by seller only when one is given', async () => {
    await svc.listPayouts({ sellerId: 's1' });
    const eq = fake.tableCalls.find((c) => c.method === 'eq');
    expect(eq).toEqual({
      table: 'seller_payouts',
      method: 'eq',
      args: ['seller_id', 's1'],
    });
  });

  it('listPayoutItems() flattens the order embed and coerces numerics', async () => {
    fake.setTable('order_items', {
      data: [
        {
          id: 'i1',
          quantity: '1',
          unit_price: '32900',
          line_total: '32900',
          product_name: 'Chaos Rising - ETB',
          product_image_url: null,
          product_set_name: 'Chaos Rising',
          orders: { id: 'o1', order_number: '7345', created_at: '2026-07-14T17:00:00Z' },
        },
        {
          id: 'i2',
          quantity: '2',
          unit_price: '20000',
          line_total: '40000',
          product_name: 'Booster Box',
          product_image_url: null,
          product_set_name: null,
          orders: null, // orphaned embed must be dropped
        },
      ],
    });

    const items = await svc.listPayoutItems('p1');

    const eq = fake.tableCalls.find((c) => c.method === 'eq');
    expect(eq).toEqual({
      table: 'order_items',
      method: 'eq',
      args: ['seller_payout_id', 'p1'],
    });
    expect(items).toEqual([
      {
        id: 'i1',
        product_name: 'Chaos Rising - ETB',
        product_image_url: null,
        product_set_name: 'Chaos Rising',
        quantity: 1,
        unit_price: 32900,
        line_total: 32900,
        order_id: 'o1',
        order_number: 7345,
        order_created_at: '2026-07-14T17:00:00Z',
      },
    ]);
  });

  it('payoutItemIds() reads the linked order_items ids', async () => {
    fake.setTable('order_items', { data: [{ id: 'i1' }, { id: 'i2' }] });
    const ids = await svc.payoutItemIds('p1');
    expect(ids).toEqual(['i1', 'i2']);
    expect(fake.tableCalls).toEqual([
      { table: 'order_items', method: 'select', args: ['id'] },
      { table: 'order_items', method: 'eq', args: ['seller_payout_id', 'p1'] },
    ]);
  });
});
