import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  AdminCustomerListParams,
  AdminCustomerListResult,
  CustomerDetail,
  CustomerRow,
  PokedexLeaderboardRow,
} from '../catalog/catalog.types';

/** Raw row from admin_customers() — numeric/bigint aggregates may arrive as
 *  strings, so we coerce on the way out. Carries total_count for pagination. */
interface CustomerListRpcRow extends Omit<CustomerRow, 'order_count' | 'total_spent'> {
  order_count: number | string;
  total_spent: number | string;
  total_count: number | string;
}

@Injectable({ providedIn: 'root' })
export class CustomersService {
  private readonly supabase = inject(SupabaseService);

  /** Admin paginated list of registered customers. Backed by the
   *  admin_customers RPC (security definer + is_admin guard). */
  async listCustomers(
    params: AdminCustomerListParams = {},
  ): Promise<AdminCustomerListResult> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(200, params.pageSize ?? 25));
    const { data, error } = await (this.supabase.client as any).rpc('admin_customers', {
      p_search: params.search?.trim() ?? '',
      p_limit: pageSize,
      p_offset: (page - 1) * pageSize,
      p_sort: params.sort ?? 'created',
    });
    if (error) {
      console.error('[customers] admin_customers', error);
      throw error;
    }
    const rpcRows = (data ?? []) as CustomerListRpcRow[];
    const rows: CustomerRow[] = rpcRows.map((r) => ({
      id: r.id,
      full_name: r.full_name,
      email: r.email,
      phone: r.phone,
      created_at: r.created_at,
      last_sign_in_at: r.last_sign_in_at,
      last_order_at: r.last_order_at,
      order_count: Number(r.order_count) || 0,
      total_spent: Number(r.total_spent) || 0,
      auction_banned_at: r.auction_banned_at,
    }));
    // total_count is identical across rows (window aggregate); 0 on empty page.
    const total = rpcRows.length > 0 ? Number(rpcRows[0].total_count) || 0 : 0;
    return { rows, total, page, pageSize };
  }

  /** Admin single-customer detail (profile + email + stats + recent orders).
   *  Returns null if no profile matches. */
  async getCustomer(id: string): Promise<CustomerDetail | null> {
    const { data, error } = await (this.supabase.client as any).rpc('admin_customer', {
      p_id: id,
    });
    if (error) {
      console.error('[customers] admin_customer', error);
      return null;
    }
    if (!data) return null;
    const c = data as CustomerDetail;
    return {
      ...c,
      order_count: Number(c.order_count) || 0,
      total_spent: Number(c.total_spent) || 0,
      loyalty_balance: Number(c.loyalty_balance) || 0,
      orders: (c.orders ?? []).map((o) => ({
        ...o,
        total: Number(o.total) || 0,
      })),
      loyalty_transactions: (c.loyalty_transactions ?? []).map((t) => ({
        ...t,
        amount: Number(t.amount) || 0,
      })),
      caught_pokemon_numbers: c.caught_pokemon_numbers ?? [],
    };
  }

  /** Set or clear the auctions-only ban on a customer. Backed by
   *  admin_set_auction_ban (security definer + is_admin guard); place_bid
   *  rejects banned users and the close flow skips their bids. */
  async setAuctionBan(
    userId: string,
    banned: boolean,
    reason?: string,
  ): Promise<{ ok: boolean; auction_banned_at: string | null }> {
    const { data, error } = await (this.supabase.client as any).rpc('admin_set_auction_ban', {
      p_user_id: userId,
      p_banned: banned,
      p_reason: reason ?? null,
    });
    if (error) throw error;
    return data as { ok: boolean; auction_banned_at: string | null };
  }

  /** Top customers by Pokémon captured, for the dashboard "Top Pokédex" panel.
   *  Backed by admin_pokedex_leaderboard (security definer + is_admin guard). */
  async pokedexLeaderboard(limit = 10): Promise<PokedexLeaderboardRow[]> {
    const { data, error } = await (this.supabase.client as any).rpc(
      'admin_pokedex_leaderboard',
      { p_limit: limit },
    );
    if (error) {
      console.error('[customers] admin_pokedex_leaderboard', error);
      throw error;
    }
    return ((data ?? []) as PokedexLeaderboardRow[]).map((r) => ({
      ...r,
      caught_count: Number(r.caught_count) || 0,
    }));
  }
}
