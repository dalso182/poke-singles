import { TestBed } from '@angular/core/testing';
import { ProductsService } from './products.service';
import { createSupabaseFake } from '../../testing/supabase-fake';

describe('ProductsService', () => {
  let fake: ReturnType<typeof createSupabaseFake>;
  let svc: ProductsService;

  beforeEach(() => {
    fake = createSupabaseFake();
    TestBed.configureTestingModule({ providers: [fake.provider] });
    svc = TestBed.inject(ProductsService);
  });

  it('softDelete() also deactivates so a deleted product cannot stay purchasable', async () => {
    await svc.softDelete('p1');

    const update = fake.tableCalls.find(
      (c) => c.table === 'products' && c.method === 'update',
    );
    expect(update).toBeTruthy();
    const patch = (update!.args[0] ?? {}) as Record<string, unknown>;
    expect(patch['active']).toBe(false);
    expect(patch['deleted_at']).toBeTruthy();
  });

  it('restore() clears deleted_at and reinstates the given active state', async () => {
    await svc.restore('p1', true);

    const update = fake.tableCalls.find(
      (c) => c.table === 'products' && c.method === 'update',
    );
    expect(update).toEqual({
      table: 'products',
      method: 'update',
      args: [{ deleted_at: null, active: true }],
    });
  });

  it('restore() defaults to inactive', async () => {
    await svc.restore('p1');

    const update = fake.tableCalls.find(
      (c) => c.table === 'products' && c.method === 'update',
    );
    expect(update!.args[0]).toEqual({ deleted_at: null, active: false });
  });

  it('list() excludes soft-deleted rows by default', async () => {
    await svc.list();

    const deletedFilter = fake.tableCalls.find(
      (c) =>
        c.table === 'products' &&
        c.method === 'is' &&
        c.args[0] === 'deleted_at' &&
        c.args[1] === null,
    );
    expect(deletedFilter).toBeTruthy();
  });

  it('list({ deletedOnly: true }) returns only soft-deleted rows', async () => {
    await svc.list({ deletedOnly: true });

    const liveFilter = fake.tableCalls.find(
      (c) =>
        c.table === 'products' && c.method === 'is' && c.args[0] === 'deleted_at',
    );
    expect(liveFilter).toBeUndefined();
    const deletedFilter = fake.tableCalls.find(
      (c) => c.table === 'products' && c.method === 'not',
    );
    expect(deletedFilter).toEqual({
      table: 'products',
      method: 'not',
      args: ['deleted_at', 'is', null],
    });
  });
});
