import { Injectable, PLATFORM_ID, Signal, WritableSignal, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';
import type { AuctionStatus } from '../catalog/catalog.types';

/** Payload pushed by the tg_auction_broadcast DB trigger on topic
 *  'auction:<product_id>' (event 'auction_update'). Already masked
 *  server-side. The channel is public, so treat this as an optimistic hint
 *  and re-fetch the definer views for authoritative state. */
export interface AuctionLiveEvent {
  product_id: string;
  status: AuctionStatus;
  current_bid: number | null;
  bid_count: number;
  ends_at: string | null;
  top_bidder: string | null;
  top_avatar: number | null;
}

/**
 * Live auction updates over Supabase Broadcast. One public channel per
 * auction ('auction:<product_id>'); `watch()` returns a signal that emits
 * each auction_update event, `teardown()` closes the channel (call it from
 * ngOnDestroy). Channel lifecycle mirrors PresenceService.
 */
@Injectable({ providedIn: 'root' })
export class AuctionLiveService {
  private readonly supabase = inject(SupabaseService);
  private readonly platformId = inject(PLATFORM_ID);

  private readonly channels = new Map<
    string,
    { channel: RealtimeChannel; event: WritableSignal<AuctionLiveEvent | null> }
  >();

  /** Subscribe to an auction's live events. Idempotent per product id. */
  watch(productId: string): Signal<AuctionLiveEvent | null> {
    const existing = this.channels.get(productId);
    if (existing) return existing.event.asReadonly();

    const event = signal<AuctionLiveEvent | null>(null);
    if (!isPlatformBrowser(this.platformId)) return event.asReadonly();

    const channel = this.supabase.client
      .channel(`auction:${productId}`)
      .on('broadcast', { event: 'auction_update' }, ({ payload }) => {
        event.set(payload as AuctionLiveEvent);
      })
      .subscribe();

    this.channels.set(productId, { channel, event });
    return event.asReadonly();
  }

  /** Close the auction's channel and drop its signal. */
  teardown(productId: string): void {
    const entry = this.channels.get(productId);
    if (!entry) return;
    void this.supabase.client.removeChannel(entry.channel);
    this.channels.delete(productId);
  }
}
