import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  CardTypeInsert,
  CardTypeRow,
  CardTypeUpdate,
} from './catalog.types';

@Injectable({ providedIn: 'root' })
export class CardTypesService {
  private readonly supabase = inject(SupabaseService);

  async list(opts: { activeOnly?: boolean } = {}): Promise<CardTypeRow[]> {
    let query = (this.supabase.client as any)
      .from('card_types')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (opts.activeOnly) {
      query = query.eq('active', true);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as CardTypeRow[];
  }

  async create(input: CardTypeInsert): Promise<CardTypeRow> {
    const { data, error } = await (this.supabase.client as any)
      .from('card_types')
      .insert(input)
      .select('*')
      .single();
    if (error) throw error;
    return data as CardTypeRow;
  }

  async update(id: string, patch: CardTypeUpdate): Promise<CardTypeRow> {
    const { data, error } = await (this.supabase.client as any)
      .from('card_types')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as CardTypeRow;
  }

  async setActive(id: string, active: boolean): Promise<CardTypeRow> {
    return this.update(id, { active });
  }
}
