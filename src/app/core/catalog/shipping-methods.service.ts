import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  ShippingMethodInsert,
  ShippingMethodRow,
  ShippingMethodUpdate,
} from './catalog.types';

@Injectable({ providedIn: 'root' })
export class ShippingMethodsService {
  private readonly supabase = inject(SupabaseService);

  /** Customer-facing list — only active, non-deleted, ordered for display. */
  async listActive(): Promise<ShippingMethodRow[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('shipping_methods')
      .select('*')
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw error;
    return (data ?? []) as ShippingMethodRow[];
  }

  /** Admin list — includes inactive and (optionally) soft-deleted rows. */
  async list(opts: { includeDeleted?: boolean } = {}): Promise<ShippingMethodRow[]> {
    let query = (this.supabase.client as any)
      .from('shipping_methods')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (!opts.includeDeleted) {
      query = query.is('deleted_at', null);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as ShippingMethodRow[];
  }

  async get(id: string): Promise<ShippingMethodRow | null> {
    const { data, error } = await (this.supabase.client as any)
      .from('shipping_methods')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data as ShippingMethodRow | null) ?? null;
  }

  async create(input: ShippingMethodInsert): Promise<ShippingMethodRow> {
    const { data, error } = await (this.supabase.client as any)
      .from('shipping_methods')
      .insert(input)
      .select('*')
      .single();
    if (error) throw error;
    return data as ShippingMethodRow;
  }

  async update(id: string, patch: ShippingMethodUpdate): Promise<ShippingMethodRow> {
    const { data, error } = await (this.supabase.client as any)
      .from('shipping_methods')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as ShippingMethodRow;
  }

  async setActive(id: string, active: boolean): Promise<ShippingMethodRow> {
    return this.update(id, { is_active: active });
  }

  async softDelete(id: string): Promise<void> {
    const { error } = await (this.supabase.client as any)
      .from('shipping_methods')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }

  async restore(id: string): Promise<void> {
    const { error } = await (this.supabase.client as any)
      .from('shipping_methods')
      .update({ deleted_at: null })
      .eq('id', id);
    if (error) throw error;
  }
}
