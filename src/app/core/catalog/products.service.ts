import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  ProductInsert,
  ProductListRow,
  ProductRow,
  ProductSearchRow,
  ProductUpdate,
  SortKey,
} from './catalog.types';

export interface ProductListParams {
  search?: string;
  categoryId?: string;
  setId?: string;
  /** Multi-set filter — products whose set_id is in this list. Wins over
   *  `setId` when both are provided. Empty array is ignored. */
  setIds?: string[];
  featured?: boolean;
  includeInactive?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ProductListResult {
  rows: ProductListRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProductSearchParams {
  q: string;
  sort: SortKey;
  /** Multi-set filter — same shape as ProductListParams.setIds, narrows
   *  search to products whose set_id is in this list. Empty / undefined =
   *  no filter. */
  setIds?: string[];
  /** Multi-card-type filter — array-overlap against products_search.card_type_ids.
   *  Empty / undefined = no filter. */
  cardTypeIds?: string[];
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
      .select('*, sets(name, printed_total)', { count: 'exact' })
      .order('last_restocked_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (!params.includeInactive) {
      query = query.eq('active', true);
    }
    if (params.categoryId) {
      query = query.eq('category_id', params.categoryId);
    }
    if (params.setIds && params.setIds.length > 0) {
      query = query.in('set_id', params.setIds);
    } else if (params.setId) {
      query = query.eq('set_id', params.setId);
    }
    if (params.featured !== undefined) {
      query = query.eq('featured', params.featured);
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
    // Flatten the postgrest embed (`sets: { name, printed_total } | null`)
    // into top-level `set_name` / `set_printed_total` so callers stay flat.
    const rows: ProductListRow[] = ((data ?? []) as (ProductRow & {
      sets: { name: string | null; printed_total: number | null } | null;
    })[]).map(({ sets, ...rest }) => ({
      ...rest,
      set_name: sets?.name ?? null,
      set_printed_total: sets?.printed_total ?? null,
    }));
    return { rows, total: count ?? 0, page, pageSize };
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
      set_ids: params.setIds && params.setIds.length > 0 ? params.setIds : null,
      // Param prefixed `p_` in SQL to avoid clashing with the
      // products_search.card_type_ids column of the same name inside the
      // function body.
      p_card_type_ids:
        params.cardTypeIds && params.cardTypeIds.length > 0 ? params.cardTypeIds : null,
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
