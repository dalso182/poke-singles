import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  ProductInsert,
  ProductRow,
  ProductUpdate,
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
}
