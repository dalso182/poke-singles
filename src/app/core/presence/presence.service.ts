import { Injectable, PLATFORM_ID, Signal, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';

/** Shared Realtime presence topic. Storefront visitors `track` themselves here;
 *  the admin dashboard subscribes to count them. Presence runs over the anon
 *  key with no backing table. */
const CHANNEL = 'online';

@Injectable({ providedIn: 'root' })
export class PresenceService {
  private readonly supabase = inject(SupabaseService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private visitorChannel: RealtimeChannel | null = null;
  private watchChannel: RealtimeChannel | null = null;
  private readonly onlineCount = signal(0);

  /** Storefront: announce this visitor on the shared presence channel so the
   *  admin dashboard's "people online" counter sees them. Idempotent — safe to
   *  call once per shell init. No-op outside the browser (no WebSocket on the
   *  server, per the SSR-ready convention). The visitor stays announced until
   *  the tab closes. */
  joinAsVisitor(): void {
    if (!this.isBrowser || this.visitorChannel) return;
    const channel = this.supabase.client.channel(CHANNEL, {
      config: { presence: { key: this.randomKey() } },
    });
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void channel.track({ role: 'visitor', at: Date.now() });
      }
    });
    this.visitorChannel = channel;
  }

  /** Admin dashboard: live count of visitors currently on the storefront.
   *  Subscribes WITHOUT tracking, so the watching admin isn't counted. Returns
   *  a signal that updates on every presence sync/join/leave. Pair with
   *  teardown() in the consumer's ngOnDestroy. */
  watchOnlineCount(): Signal<number> {
    if (!this.isBrowser || this.watchChannel) {
      return this.onlineCount.asReadonly();
    }
    const channel = this.supabase.client.channel(CHANNEL);
    const recount = (): void => this.onlineCount.set(this.countVisitors(channel));
    channel
      .on('presence', { event: 'sync' }, recount)
      .on('presence', { event: 'join' }, recount)
      .on('presence', { event: 'leave' }, recount)
      .subscribe();
    this.watchChannel = channel;
    return this.onlineCount.asReadonly();
  }

  /** Drop the admin watch channel (call from the dashboard's ngOnDestroy).
   *  Leaves the visitor channel alone — a browsing admin stays "online". */
  teardown(): void {
    if (this.watchChannel) {
      void this.supabase.client.removeChannel(this.watchChannel);
      this.watchChannel = null;
    }
    this.onlineCount.set(0);
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
