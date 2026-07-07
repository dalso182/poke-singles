import { Injectable, effect, inject, signal } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthService } from '../auth/auth.service';
import type {
  LoyaltyTransactionRow,
  PokeballOpenResult,
} from '../catalog/catalog.types';

/**
 * Customer-facing access to the loyalty ledger. RLS (`loyalty_self_read`) scopes
 * every read to the signed-in user, so we never pass a user id. Balance is the
 * SUM of `amount` — derived, not cached server-side — so it can legitimately be
 * negative (a reversal clawing back points that were already spent). Admin
 * reporting goes through ReportsService + admin_loyalty_transactions_report.
 *
 * The balance is exposed as a shared session-scoped signal (mirroring
 * ProfilesService) so the header chip, /account, and the Pokéball modal all
 * stay in sync after a spend without each re-fetching independently.
 * Spending happens only through the open_pokeball SECURITY DEFINER RPC —
 * customers have no INSERT path on the ledger.
 */
@Injectable({ providedIn: 'root' })
export class LoyaltyService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  private readonly balanceSig = signal<number | null>(null);
  /** Reactive points balance. null = signed out or not loaded yet. */
  readonly balance = this.balanceSig.asReadonly();

  private inflight: Promise<number> | null = null;

  constructor() {
    // Clear on sign-out; drop a stale cache when the signed-in user changes so
    // the next ensureLoaded() fetches the new user's total.
    effect(() => {
      const user = this.auth.currentUser();
      if (user === undefined) return; // initial hydration still in flight
      if (!user) this.balanceSig.set(null);
    });
  }

  /** Load the balance into the signal unless already cached. Cheap to call from
   *  any consumer (header dropdown, /account, the Pokéball modal). */
  async ensureLoaded(): Promise<number> {
    const cached = this.balanceSig();
    if (cached !== null) return cached;
    return this.refresh();
  }

  /** Force a re-fetch (e.g. after an admin marks an order paid mid-session). */
  async refresh(): Promise<number> {
    if (this.inflight) return this.inflight;
    this.inflight = this.getMyBalance()
      .then((n) => {
        this.balanceSig.set(n);
        return n;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

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

  /** Ledger entries, paged newest-first, for the /account history list.
   *  `total` is the exact row count — of the *filtered* set when a `from`/`to`
   *  bound (inclusive ISO timestamps) is given — so the caller knows when to
   *  stop offering "Cargar más". The balance stays a separate full-table SUM
   *  (getMyBalance). */
  async getMyHistory(
    opts: { limit?: number; offset?: number; from?: string; to?: string } = {},
  ): Promise<{ rows: LoyaltyTransactionRow[]; total: number }> {
    const limit = Math.max(1, opts.limit ?? 20);
    const offset = Math.max(0, opts.offset ?? 0);
    let query = (this.supabase.client as any)
      .from('loyalty_transactions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (opts.from) query = query.gte('created_at', opts.from);
    if (opts.to) query = query.lte('created_at', opts.to);
    const { data, error, count } = await query;
    if (error) throw error;
    return { rows: (data ?? []) as LoyaltyTransactionRow[], total: count ?? 0 };
  }

  /** Open a Pokéball tier: the RPC atomically checks the balance, debits the
   *  ledger ('redeem' row), and awards random not-owned Pokémon. Thrown
   *  transport errors map to {ok:false, error:'RPC_ERROR'} (same idiom as
   *  OrdersService.placeOrder); business failures come back in-band. On
   *  success the shared balance signal is updated from the RPC's new_balance. */
  async openPokeball(tierKey: string): Promise<PokeballOpenResult> {
    const { data, error } = await (this.supabase.client as any).rpc(
      'open_pokeball',
      { p_tier: tierKey },
    );
    if (error) {
      console.error('[loyalty] open_pokeball failed', error);
      return { ok: false, error: 'RPC_ERROR' };
    }
    const result = (data ?? { ok: false, error: 'RPC_ERROR' }) as PokeballOpenResult;
    if (result.ok && typeof result.new_balance === 'number') {
      this.balanceSig.set(result.new_balance);
    }
    return result;
  }
}
