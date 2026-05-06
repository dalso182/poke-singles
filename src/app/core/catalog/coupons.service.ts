import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  CouponInsert,
  CouponRow,
  CouponUpdate,
} from './catalog.types';

export interface CouponListParams {
  /** When true, include soft-deleted rows (deleted_at IS NOT NULL). */
  includeDeleted?: boolean;
  /** Case-insensitive ILIKE on `code`. */
  search?: string;
}

@Injectable({ providedIn: 'root' })
export class CouponsService {
  private readonly supabase = inject(SupabaseService);

  async list(params: CouponListParams = {}): Promise<CouponRow[]> {
    let query = (this.supabase.client as any)
      .from('coupons')
      .select('*')
      .order('created_at', { ascending: false });
    if (!params.includeDeleted) {
      query = query.is('deleted_at', null);
    }
    if (params.search) {
      const term = params.search.trim();
      if (term.length > 0) {
        const escaped = term.replace(/[%_]/g, '\\$&');
        query = query.ilike('code', `%${escaped}%`);
      }
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as CouponRow[];
  }

  async get(id: string): Promise<CouponRow | null> {
    const { data, error } = await (this.supabase.client as any)
      .from('coupons')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data as CouponRow | null) ?? null;
  }

  async create(input: CouponInsert): Promise<CouponRow> {
    const { data, error } = await (this.supabase.client as any)
      .from('coupons')
      .insert(input)
      .select('*')
      .single();
    if (error) throw error;
    return data as CouponRow;
  }

  async update(id: string, patch: CouponUpdate): Promise<CouponRow> {
    const { data, error } = await (this.supabase.client as any)
      .from('coupons')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as CouponRow;
  }

  async setActive(id: string, active: boolean): Promise<CouponRow> {
    return this.update(id, { is_active: active });
  }

  async softDelete(id: string): Promise<void> {
    const { error } = await (this.supabase.client as any)
      .from('coupons')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }

  async restore(id: string): Promise<void> {
    const { error } = await (this.supabase.client as any)
      .from('coupons')
      .update({ deleted_at: null })
      .eq('id', id);
    if (error) throw error;
  }

  /** Pre-flight check before submit. The DB unique constraint is the real
   *  guard; this just lets us show an inline error early. */
  async existsByCode(code: string, exceptId?: string): Promise<boolean> {
    let query = (this.supabase.client as any)
      .from('coupons')
      .select('id', { head: true, count: 'exact' })
      .eq('code', code);
    if (exceptId) query = query.neq('id', exceptId);
    const { error, count } = await query;
    if (error) throw error;
    return (count ?? 0) > 0;
  }
}
