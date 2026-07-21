import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import type { AuctionBidItem } from '../catalog/catalog.types';

/** Envelope returned by the place_bid RPC (mirrors place_order's style).
 *  Business rejections come back as ok:false with a stable error code;
 *  only a missing session raises. */
export type PlaceBidResult =
  | {
      ok: true;
      bid_id: string;
      current_bid: number;
      bid_count: number;
      ends_at: string;
      /** True when the bid landed inside the anti-snipe window and pushed
       *  the close out. */
      extended: boolean;
    }
  | {
      ok: false;
      error:
        | 'INVALID_AMOUNT'
        | 'NOT_AN_AUCTION'
        | 'AUCTION_NOT_ACTIVE'
        | 'AUCTION_ENDED'
        | 'AUCTION_BANNED'
        | 'ALREADY_LEADING'
        | 'BID_TOO_LOW'
        | string;
      min_next?: number;
      current_bid?: number | null;
      bid_count?: number;
    };

/**
 * Customer-facing bid reads for /subastas/:slug. Goes through the public
 * `subastas_bids` definer view — bidder names arrive already masked
 * (mask_bidder_name) and invalidated bids (from relists) are filtered out
 * server-side. Bid writes happen via the place_bid RPC (added with the
 * bidding phase).
 */
@Injectable({ providedIn: 'root' })
export class BidsService {
  private readonly supabase = inject(SupabaseService);

  /** Place a bid via the place_bid RPC. Requires a signed-in session (the
   *  RPC raises NOT_AUTHORIZED otherwise — gate with the login dialog
   *  first). Business rejections come back in the envelope, not as throws. */
  async placeBid(productId: string, amount: number): Promise<PlaceBidResult> {
    const { data, error } = await (this.supabase.client as any).rpc('place_bid', {
      p_product_id: productId,
      p_amount: amount,
    });
    if (error) throw error;
    return data as PlaceBidResult;
  }

  /** Masked bid history for one auction, newest first. */
  async listBids(productId: string): Promise<AuctionBidItem[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('subastas_bids')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as AuctionBidItem[];
  }
}
