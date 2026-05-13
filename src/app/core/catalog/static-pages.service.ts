import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  StaticPageInsert,
  StaticPageRow,
  StaticPageUpdate,
} from './catalog.types';

@Injectable({ providedIn: 'root' })
export class StaticPagesService {
  private readonly supabase = inject(SupabaseService);

  /** Customer-facing list — only published, non-deleted, ordered for display. */
  async listActive(): Promise<StaticPageRow[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('static_pages')
      .select('*')
      .is('deleted_at', null)
      .eq('is_published', true)
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true });
    if (error) throw error;
    return (data ?? []) as StaticPageRow[];
  }

  /** Admin list — includes unpublished and (optionally) soft-deleted rows. */
  async list(opts: { includeDeleted?: boolean } = {}): Promise<StaticPageRow[]> {
    let query = (this.supabase.client as any)
      .from('static_pages')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true });
    if (!opts.includeDeleted) {
      query = query.is('deleted_at', null);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as StaticPageRow[];
  }

  async getBySlug(slug: string): Promise<StaticPageRow | null> {
    const { data, error } = await (this.supabase.client as any)
      .from('static_pages')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();
    if (error) throw error;
    return (data as StaticPageRow | null) ?? null;
  }

  async getById(id: string): Promise<StaticPageRow | null> {
    const { data, error } = await (this.supabase.client as any)
      .from('static_pages')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data as StaticPageRow | null) ?? null;
  }

  async create(input: StaticPageInsert): Promise<StaticPageRow> {
    const { data, error } = await (this.supabase.client as any)
      .from('static_pages')
      .insert(input)
      .select('*')
      .single();
    if (error) throw error;
    return data as StaticPageRow;
  }

  async update(id: string, patch: StaticPageUpdate): Promise<StaticPageRow> {
    const { data, error } = await (this.supabase.client as any)
      .from('static_pages')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as StaticPageRow;
  }

  async softDelete(id: string): Promise<void> {
    const { error } = await (this.supabase.client as any)
      .from('static_pages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }

  async restore(id: string): Promise<void> {
    const { error } = await (this.supabase.client as any)
      .from('static_pages')
      .update({ deleted_at: null })
      .eq('id', id);
    if (error) throw error;
  }
}
