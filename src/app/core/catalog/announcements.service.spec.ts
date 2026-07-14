import { TestBed } from '@angular/core/testing';
import { AnnouncementsService } from './announcements.service';
import { createSupabaseFake } from '../../testing/supabase-fake';

describe('AnnouncementsService', () => {
  let fake: ReturnType<typeof createSupabaseFake>;
  let svc: AnnouncementsService;

  beforeEach(() => {
    fake = createSupabaseFake();
    TestBed.configureTestingModule({ providers: [fake.provider] });
    svc = TestBed.inject(AnnouncementsService);
  });

  it('activate() deactivates whatever is active before activating the target', async () => {
    await svc.activate('a2');

    const updates = fake.tableCalls.filter(
      (c) => c.table === 'announcements' && (c.method === 'update' || c.method === 'eq'),
    );
    // First query: update({is_active:false}).eq('is_active', true)
    expect(updates[0]).toEqual({
      table: 'announcements',
      method: 'update',
      args: [{ is_active: false }],
    });
    expect(updates[1]).toEqual({
      table: 'announcements',
      method: 'eq',
      args: ['is_active', true],
    });
    // Second query: update({is_active:true}).eq('id', 'a2')
    expect(updates[2]).toEqual({
      table: 'announcements',
      method: 'update',
      args: [{ is_active: true }],
    });
    expect(updates[3]).toEqual({
      table: 'announcements',
      method: 'eq',
      args: ['id', 'a2'],
    });
  });

  it('softDelete() also deactivates so a deleted announcement cannot stay live', async () => {
    await svc.softDelete('a1');

    const update = fake.tableCalls.find(
      (c) => c.table === 'announcements' && c.method === 'update',
    );
    expect(update).toBeTruthy();
    const patch = (update!.args[0] ?? {}) as Record<string, unknown>;
    expect(patch['is_active']).toBe(false);
    expect(patch['deleted_at']).toBeTruthy();
  });
});
