import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  CouponReportParams,
  CouponReportResult,
  CouponReportRow,
  CustomerActivityParams,
  CustomerActivityResult,
  CustomerActivityRow,
  CustomerOrdersReportParams,
  CustomerOrdersReportResult,
  CustomerOrdersReportRow,
  CustomerSearchParams,
  CustomerSearchResult,
  CustomerSearchRow,
} from '../catalog/catalog.types';

/** Raw row from admin_customer_orders_report() — bigint/numeric aggregates may
 *  arrive as strings, so we coerce on the way out. Carries total_count. */
interface OrdersReportRpcRow extends Omit<
  CustomerOrdersReportRow,
  'order_count' | 'no_products' | 'total_spent'
> {
  order_count: number | string;
  no_products: number | string;
  total_spent: number | string;
  total_count: number | string;
}

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private readonly supabase = inject(SupabaseService);

  /** Admin "Pedidos por cliente" report. Backed by the
   *  admin_customer_orders_report RPC (security definer + is_admin guard). */
  async listCustomerOrders(
    params: CustomerOrdersReportParams = {},
  ): Promise<CustomerOrdersReportResult> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(200, params.pageSize ?? 25));
    const { data, error } = await (this.supabase.client as any).rpc(
      'admin_customer_orders_report',
      {
        p_search: params.search?.trim() ?? '',
        p_date_start: params.dateStart ?? null,
        p_date_end: params.dateEnd ?? null,
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
        p_sort: params.sort ?? 'total',
      },
    );
    if (error) {
      console.error('[reports] admin_customer_orders_report', error);
      throw error;
    }
    const rpcRows = (data ?? []) as OrdersReportRpcRow[];
    const rows: CustomerOrdersReportRow[] = rpcRows.map((r) => ({
      id: r.id,
      full_name: r.full_name,
      email: r.email,
      order_count: Number(r.order_count) || 0,
      no_products: Number(r.no_products) || 0,
      total_spent: Number(r.total_spent) || 0,
    }));
    // total_count is identical across rows (window aggregate); 0 on empty page.
    const total = rpcRows.length > 0 ? Number(rpcRows[0].total_count) || 0 : 0;
    return { rows, total, page, pageSize };
  }

  /** Admin "Actividad de clientes" report. Backed by the
   *  admin_customer_activity RPC (security definer + is_admin guard). */
  async listCustomerActivity(
    params: CustomerActivityParams = {},
  ): Promise<CustomerActivityResult> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(200, params.pageSize ?? 50));
    const { data, error } = await (this.supabase.client as any).rpc(
      'admin_customer_activity',
      {
        p_search: params.search?.trim() ?? '',
        p_date_start: params.dateStart ?? null,
        p_date_end: params.dateEnd ?? null,
        p_ip: params.ip?.trim() ?? '',
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
      },
    );
    if (error) {
      console.error('[reports] admin_customer_activity', error);
      throw error;
    }
    const rpcRows = (data ?? []) as (CustomerActivityRow & {
      total_count: number | string;
    })[];
    const rows: CustomerActivityRow[] = rpcRows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      customer_name: r.customer_name,
      customer_email: r.customer_email,
      event_type: r.event_type,
      order_id: r.order_id,
      ip: r.ip,
      created_at: r.created_at,
    }));
    const total = rpcRows.length > 0 ? Number(rpcRows[0].total_count) || 0 : 0;
    return { rows, total, page, pageSize };
  }

  /** Admin "Búsquedas" report. Backed by the admin_customer_searches RPC
   *  (security definer + is_admin guard). */
  async listCustomerSearches(
    params: CustomerSearchParams = {},
  ): Promise<CustomerSearchResult> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(200, params.pageSize ?? 50));
    const { data, error } = await (this.supabase.client as any).rpc(
      'admin_customer_searches',
      {
        p_search: params.search?.trim() ?? '',
        p_keyword: params.keyword?.trim() ?? '',
        p_date_start: params.dateStart ?? null,
        p_date_end: params.dateEnd ?? null,
        p_ip: params.ip?.trim() ?? '',
        p_customer_type: params.customerType ?? 'all',
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
      },
    );
    if (error) {
      console.error('[reports] admin_customer_searches', error);
      throw error;
    }
    const rpcRows = (data ?? []) as (CustomerSearchRow & {
      total_count: number | string;
    })[];
    const rows: CustomerSearchRow[] = rpcRows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      customer_name: r.customer_name,
      customer_email: r.customer_email,
      keyword: r.keyword,
      found_count: Number(r.found_count) || 0,
      category_name: r.category_name,
      ip: r.ip,
      created_at: r.created_at,
    }));
    const total = rpcRows.length > 0 ? Number(rpcRows[0].total_count) || 0 : 0;
    return { rows, total, page, pageSize };
  }

  /** Admin "Cupones" report. Backed by the admin_coupons_report RPC
   *  (security definer + is_admin guard). */
  async listCoupons(params: CouponReportParams = {}): Promise<CouponReportResult> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(200, params.pageSize ?? 50));
    const { data, error } = await (this.supabase.client as any).rpc(
      'admin_coupons_report',
      {
        p_search: params.search?.trim() ?? '',
        p_date_start: params.dateStart ?? null,
        p_date_end: params.dateEnd ?? null,
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
        p_sort: params.sort ?? 'discount',
      },
    );
    if (error) {
      console.error('[reports] admin_coupons_report', error);
      throw error;
    }
    const rpcRows = (data ?? []) as (CouponReportRow & {
      total_count: number | string;
    })[];
    const rows: CouponReportRow[] = rpcRows.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      order_count: Number(r.order_count) || 0,
      total_discount: Number(r.total_discount) || 0,
      total_revenue: Number(r.total_revenue) || 0,
    }));
    const total = rpcRows.length > 0 ? Number(rpcRows[0].total_count) || 0 : 0;
    return { rows, total, page, pageSize };
  }
}
