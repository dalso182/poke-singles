import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  CategoryInsert,
  CategoryRow,
  CategoryUpdate,
} from './catalog.types';

@Injectable({ providedIn: 'root' })
export class CategoriesService {
  private readonly supabase = inject(SupabaseService);

  async list(opts: { activeOnly?: boolean } = {}): Promise<CategoryRow[]> {
    let query = (this.supabase.client as any)
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (opts.activeOnly) {
      query = query.eq('active', true);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as CategoryRow[];
  }

  /** Per-category in-stock product counts for the storefront "Categoría" facet.
   *  Returns a Map keyed by category_id. Mirrors SetsService.countsForQuery. */
  async countsForQuery(
    q = '',
    opts: { onSaleOnly?: boolean } = {},
  ): Promise<Map<string, number>> {
    const { data, error } = await (this.supabase.client as any).rpc('search_category_counts', {
      q,
      p_on_sale_only: opts.onSaleOnly ?? false,
    });
    if (error) throw error;
    return new Map<string, number>(
      ((data ?? []) as { category_id: string; in_stock_count: number | string }[]).map((r) => [
        r.category_id,
        Number(r.in_stock_count),
      ]),
    );
  }

  async create(input: CategoryInsert): Promise<CategoryRow> {
    const { data, error } = await (this.supabase.client as any)
      .from('categories')
      .insert(input)
      .select('*')
      .single();
    if (error) throw error;
    return data as CategoryRow;
  }

  async update(id: string, patch: CategoryUpdate): Promise<CategoryRow> {
    const { data, error } = await (this.supabase.client as any)
      .from('categories')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as CategoryRow;
  }

  async setActive(id: string, active: boolean): Promise<CategoryRow> {
    return this.update(id, { active });
  }
}
