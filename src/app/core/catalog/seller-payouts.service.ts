import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  PayoutItemDetail,
  SealedPayoutItemRow,
  SealedPayoutItemsParams,
  SealedPayoutItemsResult,
  SellerPayoutCreated,
  SellerPayoutListParams,
  SellerPayoutListResult,
  SellerPayoutRow,
  SellerPendingTotal,
} from './catalog.types';

/** Consignment payouts (Reportes → Consignaciones). Reads go through the
 *  admin_sealed_* RPCs (security definer + is_admin guard); the batch list and
 *  delete are direct table access gated by the seller_payouts admin RLS.
 *  Deleting a batch reverts its items to pending via the FK's ON DELETE SET
 *  NULL — that is the undo path. */
@Injectable({ providedIn: 'root' })
export class SellerPayoutsService {
  private readonly supabase = inject(SupabaseService);

  /** Sold sealed consignment items + live fee breakdown. */
  async listSealedItems(
    params: SealedPayoutItemsParams = {},
  ): Promise<SealedPayoutItemsResult> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(200, params.pageSize ?? 50));
    const { data, error } = await (this.supabase.client as any).rpc(
      'admin_sealed_payouts_report',
      {
        p_seller_id: params.sellerId || null,
        p_pending_only: params.pendingOnly ?? true,
        p_date_start: params.dateStart ?? null,
        p_date_end: params.dateEnd ?? null,
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
      },
    );
    if (error) {
      console.error('[payouts] admin_sealed_payouts_report', error);
      throw error;
    }
    const rpcRows = (data ?? []) as (SealedPayoutItemRow & {
      total_count: number | string;
    })[];
    const rows: SealedPayoutItemRow[] = rpcRows.map((r) => ({
      ...r,
      order_number: Number(r.order_number) || 0,
      quantity: Number(r.quantity) || 0,
      unit_price: Number(r.unit_price) || 0,
      line_total: Number(r.line_total) || 0,
      cuanto_fee: Number(r.cuanto_fee) || 0,
      store_fee: Number(r.store_fee) || 0,
      payout_amount: Number(r.payout_amount) || 0,
    }));
    const total = rpcRows.length > 0 ? Number(rpcRows[0].total_count) || 0 : 0;
    return { rows, total, page, pageSize };
  }

  /** Pending payout per seller — the unpaginated header-strip aggregate. */
  async sealedPendingTotals(): Promise<SellerPendingTotal[]> {
    const { data, error } = await (this.supabase.client as any).rpc(
      'admin_sealed_pending_totals',
    );
    if (error) {
      console.error('[payouts] admin_sealed_pending_totals', error);
      throw error;
    }
    return ((data ?? []) as SellerPendingTotal[]).map((r) => ({
      ...r,
      item_count: Number(r.item_count) || 0,
      pending_sold: Number(r.pending_sold) || 0,
      pending_payout: Number(r.pending_payout) || 0,
    }));
  }

  /** Bulk "mark paid": creates one payout batch for one seller's items.
   *  Rejects with the RPC's error code (MIXED_SELLERS, ALREADY_PAID,
   *  ORDER_NOT_REALIZED, NOT_SEALED, …) for the component to translate. */
  async createPayout(
    itemIds: string[],
    notes?: string | null,
  ): Promise<SellerPayoutCreated> {
    const { data, error } = await (this.supabase.client as any).rpc(
      'create_seller_payout',
      { p_item_ids: itemIds, p_notes: notes ?? null },
    );
    if (error) {
      console.error('[payouts] create_seller_payout', error);
      throw error;
    }
    if (!data || data.ok !== true) {
      throw new Error((data && data.error) || 'UNKNOWN');
    }
    return {
      payout_id: data.payout_id,
      seller_id: data.seller_id,
      seller_name: data.seller_name,
      item_count: Number(data.item_count) || 0,
      total_sold: Number(data.total_sold) || 0,
      cuanto_fees: Number(data.cuanto_fees) || 0,
      store_fees: Number(data.store_fees) || 0,
      total: Number(data.total) || 0,
    };
  }

  /** Payout batch history, newest first. */
  async listPayouts(
    params: SellerPayoutListParams = {},
  ): Promise<SellerPayoutListResult> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(200, params.pageSize ?? 50));
    let query = (this.supabase.client as any)
      .from('seller_payouts')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (params.sellerId) {
      query = query.eq('seller_id', params.sellerId);
    }
    const { data, error, count } = await query;
    if (error) throw error;
    const rows = ((data ?? []) as SellerPayoutRow[]).map((r) => ({
      ...r,
      total_sold: Number(r.total_sold) || 0,
      cuanto_fees: Number(r.cuanto_fees) || 0,
      store_fees: Number(r.store_fees) || 0,
      total: Number(r.total) || 0,
      item_count: Number(r.item_count) || 0,
    }));
    return { rows, total: count ?? 0, page, pageSize };
  }

  /** The items a batch covered, with their parent order — the "what did this
   *  payment cover?" dialog. Snapshot columns only; no product join needed. */
  async listPayoutItems(payoutId: string): Promise<PayoutItemDetail[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('order_items')
      .select(
        'id, quantity, unit_price, line_total, product_name, product_image_url, ' +
          'product_set_name, orders(id, order_number, created_at)',
      )
      .eq('seller_payout_id', payoutId);
    if (error) throw error;
    type Raw = Omit<
      PayoutItemDetail,
      'order_id' | 'order_number' | 'order_created_at'
    > & {
      orders: { id: string; order_number: number; created_at: string } | null;
    };
    return ((data ?? []) as Raw[])
      .filter((r) => r.orders != null)
      .map((r) => ({
        id: r.id,
        product_name: r.product_name,
        product_image_url: r.product_image_url,
        product_set_name: r.product_set_name,
        quantity: Number(r.quantity) || 0,
        unit_price: Number(r.unit_price) || 0,
        line_total: Number(r.line_total) || 0,
        order_id: r.orders!.id,
        order_number: Number(r.orders!.order_number) || 0,
        order_created_at: r.orders!.created_at,
      }))
      .sort(
        (a, b) =>
          b.order_created_at.localeCompare(a.order_created_at) ||
          a.product_name.localeCompare(b.product_name),
      );
  }

  /** Item ids linked to a batch — capture BEFORE deletePayout so an undo can
   *  re-create the batch from the same items. */
  async payoutItemIds(payoutId: string): Promise<string[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('order_items')
      .select('id')
      .eq('seller_payout_id', payoutId);
    if (error) throw error;
    return ((data ?? []) as { id: string }[]).map((r) => r.id);
  }

  /** Delete a batch; the FK's ON DELETE SET NULL reverts its items to pending. */
  async deletePayout(payoutId: string): Promise<void> {
    const { error } = await (this.supabase.client as any)
      .from('seller_payouts')
      .delete()
      .eq('id', payoutId);
    if (error) throw error;
  }
}
