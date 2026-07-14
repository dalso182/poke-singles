import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { AnnouncementModalService } from './announcement-modal.service';
import { AuthService } from '../auth/auth.service';
import { createSupabaseFake } from '../../testing/supabase-fake';
import type { AnnouncementRow } from '../catalog/catalog.types';

function makeAnnouncement(overrides: Partial<AnnouncementRow> = {}): AnnouncementRow {
  return {
    id: 'a1',
    title: 'Novedades',
    body_html: '<p>Hola</p>',
    image_url: null,
    link_path: null,
    link_label: null,
    is_active: true,
    view_count: 0,
    deleted_at: null,
    created_at: '2026-07-14T00:00:00Z',
    updated_at: '2026-07-14T00:00:00Z',
    ...overrides,
  };
}

const SEEN_KEY = 'announcement:seen:a1';

describe('AnnouncementModalService', () => {
  let fake: ReturnType<typeof createSupabaseFake>;
  let currentUser: ReturnType<typeof signal<{ id: string } | null | undefined>>;
  let signedInTick: ReturnType<typeof signal<number>>;
  let isAdmin: ReturnType<typeof signal<boolean>>;
  let openCalls: unknown[][];
  let afterClosed$: Subject<unknown>;

  /** Flushes the constructor effect and lets the async decision chain settle
   *  (getActive → hasRead → lazy dialog import each need a microtask turn). */
  async function settle() {
    TestBed.tick();
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  function init(): AnnouncementModalService {
    return TestBed.inject(AnnouncementModalService);
  }

  // Warm the module cache so the service's lazy import() of the dialog
  // resolves within settle()'s few macrotask turns instead of straggling
  // into the next test.
  beforeAll(async () => {
    await import('../../user/announcement-dialog/announcement-dialog');
  });

  beforeEach(() => {
    localStorage.clear();
    fake = createSupabaseFake();
    currentUser = signal<{ id: string } | null | undefined>(undefined);
    signedInTick = signal(0);
    isAdmin = signal(false);
    // Captured as consts so the dialog fake's closure stays bound to THIS
    // test's instances — a straggling open from a prior test's async chain
    // must not push into the current test's arrays.
    const calls: unknown[][] = [];
    const closed$ = new Subject<unknown>();
    openCalls = calls;
    afterClosed$ = closed$;
    TestBed.configureTestingModule({
      providers: [
        fake.provider,
        {
          provide: AuthService,
          useValue: {
            currentUser: currentUser.asReadonly(),
            signedInTick: signedInTick.asReadonly(),
            isAdmin: isAdmin.asReadonly(),
          },
        },
        {
          provide: MatDialog,
          useValue: {
            openDialogs: [],
            open: (...args: unknown[]) => {
              calls.push(args);
              return { afterClosed: () => closed$.asObservable() };
            },
          },
        },
      ],
    });
  });

  function upserts(table: string) {
    return fake.tableCalls.filter((c) => c.table === table && c.method === 'upsert');
  }

  it('stays inert while the session is still resolving', async () => {
    fake.setTable('announcements', { data: makeAnnouncement() });
    init();
    await settle();
    expect(openCalls.length).toBe(0);
    expect(fake.tableCalls.length).toBe(0);
  });

  it('shows the active announcement to a guest and flags localStorage on close', async () => {
    fake.setTable('announcements', { data: makeAnnouncement() });
    init();
    currentUser.set(null);
    await settle();

    expect(openCalls.length).toBe(1);
    // Impressions bump fires at open time.
    expect(fake.rpcCalls).toEqual([
      { fn: 'increment_announcement_views', args: { p_id: 'a1' } },
    ]);
    // Not yet seen until closed.
    expect(localStorage.getItem(SEEN_KEY)).toBeNull();

    afterClosed$.next(undefined);
    await settle();
    expect(localStorage.getItem(SEEN_KEY)).toBe('1');
    // Guest → no DB write.
    expect(upserts('announcement_reads').length).toBe(0);
  });

  it('does not re-show to a guest who already dismissed it', async () => {
    localStorage.setItem(SEEN_KEY, '1');
    fake.setTable('announcements', { data: makeAnnouncement() });
    init();
    currentUser.set(null);
    await settle();
    expect(openCalls.length).toBe(0);
    expect(fake.rpcCalls.length).toBe(0);
  });

  it('syncs the guest dismissal to the DB on login instead of re-showing', async () => {
    localStorage.setItem(SEEN_KEY, '1');
    fake.setTable('announcements', { data: makeAnnouncement() });
    init();
    currentUser.set(null);
    await settle();
    expect(openCalls.length).toBe(0);

    // Fresh login (guest→user transition).
    currentUser.set({ id: 'u1' });
    signedInTick.set(1);
    await settle();

    expect(openCalls.length).toBe(0);
    expect(upserts('announcement_reads').length).toBe(1);
    expect(upserts('announcement_reads')[0].args[0]).toEqual({
      announcement_id: 'a1',
      user_id: 'u1',
    });
  });

  it('skips a signed-in user who dismissed on another device and backfills localStorage', async () => {
    fake.setTable('announcements', { data: makeAnnouncement() });
    // hasRead → a row exists.
    fake.setTable('announcement_reads', {
      data: { announcement_id: 'a1', user_id: 'u1' },
    });
    init();
    currentUser.set({ id: 'u1' });
    await settle();

    expect(openCalls.length).toBe(0);
    expect(localStorage.getItem(SEEN_KEY)).toBe('1');
  });

  it('shows once to a fresh signed-in user and marks read on close', async () => {
    fake.setTable('announcements', { data: makeAnnouncement() });
    fake.setTable('announcement_reads', { data: null });
    init();
    currentUser.set({ id: 'u1' });
    await settle();

    expect(openCalls.length).toBe(1);

    afterClosed$.next(undefined);
    await settle();
    expect(localStorage.getItem(SEEN_KEY)).toBe('1');
    expect(upserts('announcement_reads').length).toBe(1);
  });

  it('skips silently when there is no active announcement', async () => {
    fake.setTable('announcements', { data: null });
    init();
    currentUser.set(null);
    await settle();
    expect(openCalls.length).toBe(0);
  });

  it('skips silently when fetching the announcement fails', async () => {
    fake.setTable('announcements', { error: { message: 'boom' } });
    init();
    currentUser.set(null);
    await settle();
    expect(openCalls.length).toBe(0);
    expect(localStorage.getItem(SEEN_KEY)).toBeNull();
  });

  it('always shows to an admin, even with both seen-flags set, and records nothing', async () => {
    localStorage.setItem(SEEN_KEY, '1');
    fake.setTable('announcements', { data: makeAnnouncement() });
    // A read row exists too — must not matter for admins.
    fake.setTable('announcement_reads', {
      data: { announcement_id: 'a1', user_id: 'admin1' },
    });
    isAdmin.set(true);
    init();
    currentUser.set({ id: 'admin1' });
    await settle();

    expect(openCalls.length).toBe(1);
    // No view-count bump for admin previews.
    expect(fake.rpcCalls.length).toBe(0);

    afterClosed$.next(undefined);
    await settle();
    // No seen-flags written either — the admin re-sees on the next load.
    expect(upserts('announcement_reads').length).toBe(0);
    expect(localStorage.getItem(SEEN_KEY)).toBe('1'); // untouched pre-set value
  });

  it('does not re-show within the same session on a token-refresh tick', async () => {
    fake.setTable('announcements', { data: makeAnnouncement() });
    fake.setTable('announcement_reads', { data: null });
    init();
    currentUser.set({ id: 'u1' });
    await settle();
    expect(openCalls.length).toBe(1);

    // Token refresh fires another SIGNED_IN while the modal is still open.
    signedInTick.set(1);
    await settle();
    expect(openCalls.length).toBe(1);
  });
});
