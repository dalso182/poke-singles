import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import type { RaffleRow, RaffleSummaryRow } from './catalog.types';

/**
 * Admin-facing raffle lifecycle: read the raffle row, set its scheduled draw
 * date, and trigger the draw. The public /rifas listing goes through
 * ProductsService.listRaffles() (the rifas_listing view) instead.
 */
@Injectable({ providedIn: 'root' })
export class RafflesService {
  private readonly supabase = inject(SupabaseService);

  /** Admin list: every raffle (product in the Rifas category) with status +
   *  entry counts, via the admin_raffles_summary() RPC. */
  async listSummary(): Promise<RaffleSummaryRow[]> {
    const { data, error } = await (this.supabase.client as any).rpc('admin_raffles_summary');
    if (error) throw error;
    return ((data ?? []) as RaffleSummaryRow[]).map((r) => ({
      ...r,
      entries_sold: Number(r.entries_sold),
      entries_pending: Number(r.entries_pending),
      participants: Number(r.participants),
    }));
  }

  async get(productId: string): Promise<RaffleRow | null> {
    const { data, error } = await (this.supabase.client as any)
      .from('raffles')
      .select('*')
      .eq('product_id', productId)
      .maybeSingle();
    if (error) throw error;
    return (data as RaffleRow | null) ?? null;
  }

  /** Create or update only the scheduled draw date. Winner/status are owned by
   *  draw_raffle, so the upsert intentionally touches just product_id + draw_at. */
  async upsert(productId: string, patch: { draw_at: string | null }): Promise<RaffleRow> {
    const { data, error } = await (this.supabase.client as any)
      .from('raffles')
      .upsert(
        { product_id: productId, draw_at: patch.draw_at },
        { onConflict: 'product_id' },
      )
      .select('*')
      .single();
    if (error) throw error;
    return data as RaffleRow;
  }

  /** Admin: draw a random winner (weighted by entries). Idempotent server-side
   *  — re-calling after a draw returns the existing result. */
  async draw(productId: string): Promise<RaffleRow> {
    const { data, error } = await (this.supabase.client as any).rpc('draw_raffle', {
      p_product_id: productId,
    });
    if (error) throw error;
    return data as RaffleRow;
  }
}
