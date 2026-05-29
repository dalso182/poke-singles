import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import type { LoyaltyTransactionRow } from '../catalog/catalog.types';

/**
 * Customer-facing access to the loyalty ledger. RLS (`loyalty_self_read`) scopes
 * every read to the signed-in user, so we never pass a user id. Balance is the
 * SUM of `amount` — derived, not cached — so it can legitimately be negative
 * (a reversal clawing back points that were already spent). Admin reporting goes
 * through ReportsService + the admin_loyalty_transactions_report RPC instead.
 */
@Injectable({ providedIn: 'root' })
export class LoyaltyService {
  private readonly supabase = inject(SupabaseService);

  /** Current points balance for the signed-in user (sum of all ledger rows). */
  async getMyBalance(): Promise<number> {
    const { data, error } = await (this.supabase.client as any)
      .from('loyalty_transactions')
      .select('amount');
    if (error) throw error;
    return ((data ?? []) as { amount: number }[]).reduce(
      (sum, r) => sum + (Number(r.amount) || 0),
      0,
    );
  }

  /** Recent ledger entries, newest-first, for the /account history list. */
  async getMyHistory(limit = 50): Promise<LoyaltyTransactionRow[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('loyalty_transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as LoyaltyTransactionRow[];
  }
}
