import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  AdminCustomerListParams,
  AdminCustomerListResult,
  CustomerDetail,
  CustomerRow,
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
      orders: (c.orders ?? []).map((o) => ({
        ...o,
        total: Number(o.total) || 0,
      })),
    };
  }
}
