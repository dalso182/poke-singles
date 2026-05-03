import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import type { TcgdexCardRow } from './catalog.types';

/**
 * Cache layer for the rich TCGdex Card payload, deduplicated by `tcgdex_id`
 * so multiple variant/condition/language SKUs of the same card share one row.
 * Populated whenever an admin picks a card via the add-product typeahead;
 * read by the public detail page (eventually) for attacks/abilities/etc.
 */
@Injectable({ providedIn: 'root' })
export class TcgdexCardsService {
  private readonly supabase = inject(SupabaseService);

  async get(tcgdexId: string): Promise<TcgdexCardRow | null> {
    const { data, error } = await (this.supabase.client as any)
      .from('tcgdex_cards')
      .select('*')
      .eq('tcgdex_id', tcgdexId)
      .maybeSingle();
    if (error) throw error;
    return (data as TcgdexCardRow | null) ?? null;
  }

  /** Insert if missing, refresh `data` + `fetched_at` if present. */
  async upsert(tcgdexId: string, data: unknown): Promise<TcgdexCardRow> {
    const { data: row, error } = await (this.supabase.client as any)
      .from('tcgdex_cards')
      .upsert({
        tcgdex_id: tcgdexId,
        data,
        fetched_at: new Date().toISOString(),
      })
      .select('*')
      .single();
    if (error) throw error;
    return row as TcgdexCardRow;
  }
}
