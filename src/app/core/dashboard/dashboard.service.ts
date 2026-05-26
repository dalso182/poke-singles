import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import type { DashboardStats } from '../catalog/catalog.types';

const EMPTY_STATS: DashboardStats = {
  total_orders: 0,
  total_sales: 0,
  total_customers: 0,
  pending_orders: 0,
  inventory_value: 0,
  series: [],
};

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly supabase = inject(SupabaseService);

  /** Headline KPIs + 30-day trend in one call. Admin-only RPC (RLS-free,
   *  gated by is_admin() inside the function). Returns zeroed stats on error
   *  so the dashboard degrades gracefully instead of throwing. */
  async getStats(): Promise<DashboardStats> {
    const { data, error } = await (this.supabase.client as any).rpc(
      'admin_dashboard_stats',
    );
    if (error) {
      console.error('[dashboard] admin_dashboard_stats', error);
      return EMPTY_STATS;
    }
    const stats = data as DashboardStats | null;
    if (!stats) return EMPTY_STATS;
    // jsonb numerics arrive as numbers already; coerce defensively in case
    // Postgres returns numeric sums as strings.
    return {
      total_orders: Number(stats.total_orders) || 0,
      total_sales: Number(stats.total_sales) || 0,
      total_customers: Number(stats.total_customers) || 0,
      pending_orders: Number(stats.pending_orders) || 0,
      inventory_value: Number(stats.inventory_value) || 0,
      series: (stats.series ?? []).map((b) => ({
        d: b.d,
        orders: Number(b.orders) || 0,
        sales: Number(b.sales) || 0,
      })),
    };
  }
}
