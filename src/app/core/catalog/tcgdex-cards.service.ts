import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import type { TcgdexCardRow } from './catalog.types';

/**
 * Cache layer for the rich card-data payload, deduplicated by `card_ref`
 * so multiple variant/condition/language SKUs of the same card share one row.
 * Populated whenever an admin picks a card via the add-product typeahead;
 * read by the public detail page for attacks/abilities/etc. The table/column
 * are deliberately source-neutral so network traffic doesn't reveal the origin.
 */
@Injectable({ providedIn: 'root' })
export class TcgdexCardsService {
  private readonly supabase = inject(SupabaseService);

  async get(cardRef: string): Promise<TcgdexCardRow | null> {
    const { data, error } = await (this.supabase.client as any)
      .from('card_details')
      .select('*')
      .eq('card_ref', cardRef)
      .maybeSingle();
    if (error) throw error;
    return (data as TcgdexCardRow | null) ?? null;
  }

  /** Insert if missing, refresh `data` + `fetched_at` if present. */
  async upsert(cardRef: string, data: unknown): Promise<TcgdexCardRow> {
    const { data: row, error } = await (this.supabase.client as any)
      .from('card_details')
      .upsert({
        card_ref: cardRef,
        data,
        fetched_at: new Date().toISOString(),
      })
      .select('*')
      .single();
    if (error) throw error;
    return row as TcgdexCardRow;
  }
}
