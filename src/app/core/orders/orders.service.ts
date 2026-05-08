import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  OrderItemRow,
  OrderRow,
  OrderStatus,
  PaymentMethod,
  PlaceOrderInput,
  PlaceOrderResult,
} from '../catalog/catalog.types';

/** WhatsApp sentinel value stored in `orders.payment_proof_url` when the
 *  customer chose the "ya envié por WhatsApp" path instead of uploading. */
export const WHATSAPP_PROOF_SENTINEL = '__whatsapp__';

const ALL_ORDER_STATUSES: readonly OrderStatus[] = [
  'pending',
  'paid',
  'shipped',
  'completed',
  'cancelled',
];

export interface AdminOrderListParams {
  status?: OrderStatus | 'all';
  search?: string;
  paymentMethod?: PaymentMethod | 'all';
  page?: number;
  pageSize?: number;
}

export interface AdminOrderListResult {
  rows: OrderRow[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable({ providedIn: 'root' })
export class OrdersService {
  private readonly supabase = inject(SupabaseService);

  async placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
    const { data, error } = await (this.supabase.client as any).rpc(
      'place_order',
      { p_input: input },
    );
    if (error) {
      console.error('[orders] place_order rpc', error);
      return { ok: false, error: 'RPC_ERROR' };
    }
    const result = data as PlaceOrderResult;
    if (result.ok && result.order_id) {
      // Fire-and-forget: customer + admin notification emails. Failure here
      // doesn't block checkout — admin can re-send manually if needed.
      void this.supabase.client.functions
        .invoke('send-order-email', {
          body: { order_id: result.order_id, email: input.buyer.email },
        })
        .catch((err) => console.error('[orders] send-order-email', err));
    }
    return result;
  }

  /** Signed-in user's order history. RLS scopes to their own rows. */
  async getMyOrders(): Promise<OrderRow[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as OrderRow[];
  }

  /** Confirmation-page lookup. Works for both anon (guest) and authed.
   *  Returns null if id + email don't match. */
  async getGuestOrder(
    orderId: string,
    email: string,
  ): Promise<{ order: OrderRow; items: OrderItemRow[] } | null> {
    const { data, error } = await (this.supabase.client as any).rpc(
      'get_guest_order',
      { p_order_id: orderId, p_email: email },
    );
    if (error) {
      console.error('[orders] get_guest_order rpc', error);
      return null;
    }
    if (!data) return null;
    const payload = data as { order: OrderRow; items: OrderItemRow[] };
    return payload;
  }

  /** Direct fetch for signed-in customers (RLS-scoped). Pulls items in one
   *  Postgrest join. Returns null if not found / not theirs. */
  async getMyOrder(
    orderId: string,
  ): Promise<{ order: OrderRow; items: OrderItemRow[] } | null> {
    const { data, error } = await (this.supabase.client as any)
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', orderId)
      .maybeSingle();
    if (error) {
      console.error('[orders] getMyOrder', error);
      return null;
    }
    if (!data) return null;
    const { order_items, ...orderRow } = data as OrderRow & {
      order_items: OrderItemRow[];
    };
    return { order: orderRow as OrderRow, items: order_items ?? [] };
  }

  /** Upload a payment proof to Supabase Storage. Returns the storage path
   *  (relative to the bucket) which `attachPaymentProof` then writes onto
   *  the order row. */
  async uploadPaymentProof(
    orderId: string,
    file: File,
  ): Promise<{ path: string } | { error: string }> {
    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
    const path = `${orderId}/proof.${ext}`;
    const { error } = await this.supabase.client.storage
      .from('payment-proofs')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      console.error('[orders] uploadPaymentProof', error);
      return { error: error.message };
    }
    return { path };
  }

  /** Attach a payment-proof reference (Storage path or WhatsApp sentinel)
   *  to the order. Backed by the attach_payment_proof RPC which verifies
   *  email + status before updating. */
  async attachPaymentProof(
    orderId: string,
    email: string,
    filePath: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const { data, error } = await (this.supabase.client as any).rpc(
      'attach_payment_proof',
      { p_order_id: orderId, p_email: email, p_file_path: filePath },
    );
    if (error) {
      console.error('[orders] attachPaymentProof', error);
      return { ok: false, error: 'RPC_ERROR' };
    }
    return data as { ok: true } | { ok: false; error: string };
  }

  // ---- Admin --------------------------------------------------------------

  /** Admin paginated list. RLS (orders_admin_all) lets the request through
   *  for users where is_admin() returns true; for everyone else the result
   *  is empty. */
  async listOrders(params: AdminOrderListParams = {}): Promise<AdminOrderListResult> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(200, params.pageSize ?? 25));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = (this.supabase.client as any)
      .from('orders')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (params.status && params.status !== 'all') {
      query = query.eq('status', params.status);
    }
    if (params.paymentMethod && params.paymentMethod !== 'all') {
      query = query.eq('payment_method', params.paymentMethod);
    }
    if (params.search) {
      const term = params.search.trim();
      if (term.length > 0) {
        const escaped = term.replace(/[%_]/g, '\\$&');
        const ors = [
          `customer_email.ilike.%${escaped}%`,
          `customer_name.ilike.%${escaped}%`,
        ];
        // Numeric search hits the human order number (typed as "7300" or
        // "#7300"). Strip a leading "#" if present.
        const numeric = term.replace(/^#/, '').trim();
        if (/^\d+$/.test(numeric)) {
          ors.push(`order_number.eq.${numeric}`);
        }
        query = query.or(ors.join(','));
      }
    }

    const { data, error, count } = await query;
    if (error) throw error;
    return {
      rows: (data ?? []) as OrderRow[],
      total: count ?? 0,
      page,
      pageSize,
    };
  }

  /** Admin detail fetch with line items (RLS-bypassed via admin policy). */
  async getOrderForAdmin(
    id: string,
  ): Promise<{ order: OrderRow; items: OrderItemRow[] } | null> {
    const { data, error } = await (this.supabase.client as any)
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      console.error('[orders] getOrderForAdmin', error);
      return null;
    }
    if (!data) return null;
    const { order_items, ...orderRow } = data as OrderRow & {
      order_items: OrderItemRow[];
    };
    return { order: orderRow as OrderRow, items: order_items ?? [] };
  }

  /** Forward status transition (pending → paid → shipped → completed).
   *  No side effects. Cancellation goes through `cancelOrder` so stock can
   *  be restored atomically. */
  async updateOrderStatus(id: string, next: OrderStatus): Promise<OrderRow> {
    if (!ALL_ORDER_STATUSES.includes(next)) {
      throw new Error(`Estado inválido: ${next}`);
    }
    if (next === 'cancelled') {
      throw new Error('Usa cancelOrder() para cancelar — restaura stock.');
    }
    const { data, error } = await (this.supabase.client as any)
      .from('orders')
      .update({ status: next })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as OrderRow;
  }

  async cancelOrder(
    id: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const { data, error } = await (this.supabase.client as any).rpc(
      'cancel_order',
      { p_order_id: id },
    );
    if (error) {
      console.error('[orders] cancelOrder', error);
      return { ok: false, error: 'RPC_ERROR' };
    }
    return data as { ok: true } | { ok: false; error: string };
  }

  /** Returns a signed URL for the proof image / PDF, valid for `expiresIn`
   *  seconds. Returns null for the WhatsApp sentinel (no file to view) or
   *  on storage errors. */
  async getPaymentProofSignedUrl(
    filePath: string | null,
    expiresIn = 3600,
  ): Promise<string | null> {
    if (!filePath || filePath === WHATSAPP_PROOF_SENTINEL) return null;
    const { data, error } = await this.supabase.client.storage
      .from('payment-proofs')
      .createSignedUrl(filePath, expiresIn);
    if (error) {
      console.error('[orders] getPaymentProofSignedUrl', error);
      return null;
    }
    return data?.signedUrl ?? null;
  }

  /** Admin-side proof attach — direct UPDATE on the row. RLS
   *  (`orders_admin_all`) lets admins through; the email/status checks
   *  the customer RPC enforces don't apply here because the admin
   *  receives proofs out-of-band (typically via WhatsApp) and may need
   *  to attach them after the order is already 'paid'. */
  async adminAttachPaymentProof(
    orderId: string,
    filePath: string,
  ): Promise<OrderRow> {
    const { data, error } = await (this.supabase.client as any)
      .from('orders')
      .update({ payment_proof_url: filePath })
      .eq('id', orderId)
      .select('*')
      .single();
    if (error) throw error;
    return data as OrderRow;
  }

  /** Cheap count for the admin dashboard pending widget. */
  async countPendingOrders(): Promise<number> {
    const { count, error } = await (this.supabase.client as any)
      .from('orders')
      .select('id', { head: true, count: 'exact' })
      .eq('status', 'pending');
    if (error) {
      console.error('[orders] countPendingOrders', error);
      return 0;
    }
    return count ?? 0;
  }
}
