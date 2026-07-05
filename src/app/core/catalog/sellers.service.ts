import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import type { SellerInsert, SellerRow, SellerUpdate } from './catalog.types';

@Injectable({ providedIn: 'root' })
export class SellersService {
  private readonly supabase = inject(SupabaseService);

  async list(opts: { activeOnly?: boolean } = {}): Promise<SellerRow[]> {
    let query = (this.supabase.client as any)
      .from('sellers')
      .select('*')
      .order('name', { ascending: true });
    if (opts.activeOnly) {
      query = query.eq('active', true);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as SellerRow[];
  }

  async create(input: SellerInsert): Promise<SellerRow> {
    const { data, error } = await (this.supabase.client as any)
      .from('sellers')
      .insert({ ...input, code: input.code.trim().toUpperCase() })
      .select('*')
      .single();
    if (error) throw error;
    return data as SellerRow;
  }

  async update(id: string, patch: SellerUpdate): Promise<SellerRow> {
    const { data, error } = await (this.supabase.client as any)
      .from('sellers')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as SellerRow;
  }

  async setActive(id: string, active: boolean): Promise<SellerRow> {
    return this.update(id, { active });
  }
}
