import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  CardTypeInsert,
  CardTypeRow,
  CardTypeUpdate,
} from './catalog.types';

@Injectable({ providedIn: 'root' })
export class CardTypesService {
  private readonly supabase = inject(SupabaseService);

  // Session-cached counts (used by the /products filter facet).
  private readonly countsCache = signal<Map<string, number> | null>(null);
  private countsInflight: Promise<Map<string, number>> | null = null;

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

  /** Per-card-type in-stock product counts. Returns a Map keyed by
   *  card_type_id. Cached for the session. */
  async counts(options: { refresh?: boolean } = {}): Promise<Map<string, number>> {
    if (!options.refresh) {
      const cached = this.countsCache();
      if (cached) return cached;
      if (this.countsInflight) return this.countsInflight;
    }
    this.countsInflight = this.fetchCounts();
    try {
      const map = await this.countsInflight;
      this.countsCache.set(map);
      return map;
    } finally {
      this.countsInflight = null;
    }
  }

  invalidateCounts(): void {
    this.countsCache.set(null);
  }

  private async fetchCounts(): Promise<Map<string, number>> {
    const { data, error } = await (this.supabase.client as any).rpc('card_type_product_counts');
    if (error) throw error;
    return new Map<string, number>(
      ((data ?? []) as { card_type_id: string; in_stock_count: number | string }[]).map((r) => [
        r.card_type_id,
        Number(r.in_stock_count),
      ]),
    );
  }

  /** Query-aware facet counts for /buscar. Uncached. Pass `onSaleOnly` to
   *  scope the counts to discounted products (the /ofertas facet). */
  async countsForQuery(
    q: string,
    opts: { onSaleOnly?: boolean; categorySlug?: string } = {},
  ): Promise<Map<string, number>> {
    const { data, error } = await (this.supabase.client as any).rpc('search_card_type_counts', {
      q,
      p_on_sale_only: opts.onSaleOnly ?? false,
      p_category_slug: opts.categorySlug ?? null,
    });
    if (error) throw error;
    return new Map<string, number>(
      ((data ?? []) as { card_type_id: string; in_stock_count: number | string }[]).map((r) => [
        r.card_type_id,
        Number(r.in_stock_count),
      ]),
    );
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
