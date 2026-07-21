import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import type { AuctionRow, AuctionSummaryRow, BidRow } from './catalog.types';

/**
 * Admin-facing auction lifecycle: read the auction row and set its
 * admin-editable config (end date, minimum increment, anti-snipe window).
 * Live state (current_bid/bid_count/leader) is owned by the place_bid RPC and
 * the winner/close columns by process_auctions — the upsert never touches
 * them. The public /subastas listing goes through
 * ProductsService.listAuctions() (the subastas_listing view) instead.
 */
@Injectable({ providedIn: 'root' })
export class AuctionsService {
  private readonly supabase = inject(SupabaseService);

  /** Admin list: every auction (product in the Subastas category) with live
   *  state + winner, via the admin_auctions_summary() RPC. */
  async listSummary(): Promise<AuctionSummaryRow[]> {
    const { data, error } = await (this.supabase.client as any).rpc('admin_auctions_summary');
    if (error) throw error;
    return ((data ?? []) as AuctionSummaryRow[]).map((r) => ({
      ...r,
      bidders: Number(r.bidders),
    }));
  }

  /** Admin bid log for one auction — full names + emails (reads the bids
   *  table directly under admin RLS), newest first, incl. invalidated rows
   *  from previous rounds (relists). */
  async listBids(productId: string): Promise<BidRow[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('bids')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as BidRow[];
  }

  async get(productId: string): Promise<AuctionRow | null> {
    const { data, error } = await (this.supabase.client as any)
      .from('auctions')
      .select('*')
      .eq('product_id', productId)
      .maybeSingle();
    if (error) throw error;
    return (data as AuctionRow | null) ?? null;
  }

  /** Create or update the admin-editable auction config. Everything else on
   *  the row is owned by place_bid / process_auctions, so the upsert
   *  intentionally touches only these columns. */
  async upsert(
    productId: string,
    patch: {
      ends_at: string | null;
      min_increment: number | null;
      anti_snipe_minutes: number | null;
    },
  ): Promise<AuctionRow> {
    const row: Record<string, unknown> = {
      product_id: productId,
      ends_at: patch.ends_at,
    };
    // Let the DB defaults (1000 / 1) apply on first insert when left blank;
    // never write NULL into the not-null config columns.
    if (patch.min_increment != null) row['min_increment'] = patch.min_increment;
    if (patch.anti_snipe_minutes != null) row['anti_snipe_minutes'] = patch.anti_snipe_minutes;

    const { data, error } = await (this.supabase.client as any)
      .from('auctions')
      .upsert(row, { onConflict: 'product_id' })
      .select('*')
      .single();
    if (error) throw error;
    return data as AuctionRow;
  }

  /** Admin: cancel the defaulting winner's order and crown the next-highest
   *  eligible bidder (fires a fresh winner email). outcome 'void' = nobody
   *  eligible remained. */
  async reassign(
    productId: string,
  ): Promise<
    | { ok: true; outcome: 'reassigned'; winner_name: string; order_id: string }
    | { ok: true; outcome: 'void' }
    | { ok: false; error: string }
  > {
    const { data, error } = await (this.supabase.client as any).rpc(
      'reassign_auction_winner',
      { p_product_id: productId },
    );
    if (error) throw error;
    return data;
  }

  /** Admin: rerun a closed auction — cancels any winner order, archives this
   *  round's bids, and reopens with the given close (ISO timestamptz). */
  async relist(
    productId: string,
    endsAtIso: string,
  ): Promise<{ ok: true; ends_at: string } | { ok: false; error: string }> {
    const { data, error } = await (this.supabase.client as any).rpc('relist_auction', {
      p_product_id: productId,
      p_ends_at: endsAtIso,
    });
    if (error) throw error;
    return data;
  }
}
