import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  ProductInsert,
  ProductRow,
  ProductSearchRow,
  ProductUpdate,
  SortKey,
} from './catalog.types';

export interface ProductListParams {
  search?: string;
  categoryId?: string;
  setId?: string;
  includeInactive?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ProductListResult {
  rows: ProductRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProductSearchParams {
  q: string;
  sort: SortKey;
  page?: number;
  pageSize?: number;
}

export interface ProductSearchResult {
  rows: ProductSearchRow[];
  page: number;
  pageSize: number;
}

@Injectable({ providedIn: 'root' })
export class ProductsService {
  private readonly supabase = inject(SupabaseService);

  async list(params: ProductListParams = {}): Promise<ProductListResult> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(200, params.pageSize ?? 25));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = (this.supabase.client as any)
      .from('products')
      .select('*', { count: 'exact' })
      .order('last_restocked_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (!params.includeInactive) {
      query = query.eq('active', true);
    }
    if (params.categoryId) {
      query = query.eq('category_id', params.categoryId);
    }
    if (params.setId) {
      query = query.eq('set_id', params.setId);
    }
    if (params.search) {
      const term = params.search.trim();
      if (term.length > 0) {
        const escaped = term.replace(/[%_]/g, '\\$&');
        query = query.or(
          `name.ilike.%${escaped}%,pokemon_name.ilike.%${escaped}%,slug.ilike.%${escaped}%`,
        );
      }
    }

    const { data, error, count } = await query;
    if (error) throw error;
    return {
      rows: (data ?? []) as ProductRow[],
      total: count ?? 0,
      page,
      pageSize,
    };
  }

  async get(id: string): Promise<ProductRow | null> {
    const { data, error } = await (this.supabase.client as any)
      .from('products')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data as ProductRow | null) ?? null;
  }

  async getBySlug(slug: string): Promise<ProductRow | null> {
    const { data, error } = await (this.supabase.client as any)
      .from('products')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();
    if (error) throw error;
    return (data as ProductRow | null) ?? null;
  }

  async create(input: ProductInsert): Promise<ProductRow> {
    const { data, error } = await (this.supabase.client as any)
      .from('products')
      .insert(input)
      .select('*')
      .single();
    if (error) throw error;
    return data as ProductRow;
  }

  async update(id: string, patch: ProductUpdate): Promise<ProductRow> {
    const { data, error } = await (this.supabase.client as any)
      .from('products')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as ProductRow;
  }

  async setActive(id: string, active: boolean): Promise<ProductRow> {
    return this.update(id, { active });
  }

  /**
   * Customer-facing search. Calls the `search_products` RPC which encapsulates
   * the four sort modes (relevance, price-asc, price-desc, recent) and the
   * substring ILIKE against the `products_search` view's `search_text` column.
   * RLS still applies (function is `security invoker`), so anon clients only
   * see active in-stock priced rows.
   */
  async search(params: ProductSearchParams): Promise<ProductSearchResult> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(200, params.pageSize ?? 60));
    const { data, error } = await (this.supabase.client as any).rpc('search_products', {
      q: params.q,
      sort: params.sort,
      limit_n: pageSize,
      offset_n: (page - 1) * pageSize,
    });
    if (error) throw error;
    return { rows: (data ?? []) as ProductSearchRow[], page, pageSize };
  }

  async slugInUse(slug: string, exceptId?: string): Promise<boolean> {
    let query = (this.supabase.client as any)
      .from('products')
      .select('id', { head: true, count: 'exact' })
      .eq('slug', slug);
    if (exceptId) query = query.neq('id', exceptId);
    const { error, count } = await query;
    if (error) throw error;
    return (count ?? 0) > 0;
  }

  async getCardTypeIds(productId: string): Promise<string[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('product_card_types')
      .select('card_type_id')
      .eq('product_id', productId);
    if (error) throw error;
    return ((data ?? []) as { card_type_id: string }[]).map((r) => r.card_type_id);
  }

  /**
   * Replace the full set of card_type assignments for a product.
   * Implemented as delete-then-insert. Admin-only writes happen one product at
   * a time, so the brief gap between delete and insert is not a concern.
   */
  async setCardTypes(productId: string, cardTypeIds: string[]): Promise<void> {
    const { error: delErr } = await (this.supabase.client as any)
      .from('product_card_types')
      .delete()
      .eq('product_id', productId);
    if (delErr) throw delErr;
    if (cardTypeIds.length === 0) return;
    const rows = cardTypeIds.map((card_type_id) => ({
      product_id: productId,
      card_type_id,
    }));
    const { error: insErr } = await (this.supabase.client as any)
      .from('product_card_types')
      .insert(rows);
    if (insErr) throw insErr;
  }
}
