import { Injectable, PLATFORM_ID, Signal, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';

/** Shared Realtime presence topic. Storefront visitors `track` themselves here;
 *  the admin dashboard subscribes to count them. Presence runs over the anon
 *  key with no backing table. */
const CHANNEL = 'online';

/**
 * One channel instance serves both roles. supabase-js dedupes channels by
 * topic (`client.channel('online')` returns the existing instance) and throws
 * if presence callbacks are added after `subscribe()` — so visitor tracking
 * and the admin's count listener can't each build their own channel. The
 * channel is created once with the presence bindings attached up front;
 * `joinAsVisitor()` merely tracks on it and `watchOnlineCount()` merely reads
 * the count signal it feeds.
 */
@Injectable({ providedIn: 'root' })
export class PresenceService {
  private readonly supabase = inject(SupabaseService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private channel: RealtimeChannel | null = null;
  /** This tab is (or wants to be) announced as a storefront visitor. */
  private trackAsVisitor = false;
  private readonly onlineCount = signal(0);

  /** Storefront: announce this visitor on the shared presence channel so the
   *  admin dashboard's "people online" counter sees them. Idempotent — safe to
   *  call once per shell init. No-op outside the browser (no WebSocket on the
   *  server, per the SSR-ready convention). The visitor stays announced until
   *  the tab closes. */
  joinAsVisitor(): void {
    if (!this.isBrowser || this.trackAsVisitor) return;
    this.trackAsVisitor = true;
    const channel = this.ensureChannel();
    // Already joined (admin hard-loaded /admin, then went to the store):
    // the subscribe callback has come and gone, so announce directly.
    if (channel.state === 'joined') {
      void channel.track({ role: 'visitor', at: Date.now() });
    }
  }

  /** Admin dashboard: live count of visitors currently on the storefront.
   *  Watching alone doesn't `track`, so an admin who hard-loaded /admin isn't
   *  counted — but one who browsed the store first stays announced. Returns a
   *  signal that updates on every presence sync/join/leave. Pair with
   *  teardown() in the consumer's ngOnDestroy. */
  watchOnlineCount(): Signal<number> {
    if (this.isBrowser) this.ensureChannel();
    return this.onlineCount.asReadonly();
  }

  /** Called from the dashboard's ngOnDestroy. The shared channel must outlive
   *  the dashboard while this tab is announced as a visitor (a browsing admin
   *  stays "online"); only an admin-only tab actually drops it. */
  teardown(): void {
    if (this.channel && !this.trackAsVisitor) {
      void this.supabase.client.removeChannel(this.channel);
      this.channel = null;
      this.onlineCount.set(0);
    }
  }

  private ensureChannel(): RealtimeChannel {
    if (this.channel) return this.channel;
    const channel = this.supabase.client.channel(CHANNEL, {
      config: { presence: { key: this.randomKey() } },
    });
    const recount = (): void => this.onlineCount.set(this.countVisitors(channel));
    channel
      .on('presence', { event: 'sync' }, recount)
      .on('presence', { event: 'join' }, recount)
      .on('presence', { event: 'leave' }, recount)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && this.trackAsVisitor) {
          void channel.track({ role: 'visitor', at: Date.now() });
        }
      });
    this.channel = channel;
    return channel;
  }

  private countVisitors(channel: RealtimeChannel): number {
    const state = channel.presenceState<{ role?: string }>();
    let n = 0;
    for (const key of Object.keys(state)) {
      if (state[key]?.some((m) => m.role === 'visitor')) n++;
    }
    return n;
  }

  private randomKey(): string {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}
