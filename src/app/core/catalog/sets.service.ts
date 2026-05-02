import { Injectable, inject } from '@angular/core';
import type { Card, Set as TcgdexSet, SetResume } from '@tcgdex/sdk';
import { SupabaseService } from '../supabase/supabase.service';
import { TcgdexService } from '../tcgdex/tcgdex.service';
import type { SetInsert, SetRow, SetUpdate } from './catalog.types';

@Injectable({ providedIn: 'root' })
export class SetsService {
  private readonly supabase = inject(SupabaseService);
  private readonly tcgdex = inject(TcgdexService);

  async list(): Promise<SetRow[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('sets')
      .select('*')
      .order('release_date', { ascending: false, nullsFirst: false })
      .order('name', { ascending: true });
    if (error) throw error;
    return (data ?? []) as SetRow[];
  }

  async get(id: string): Promise<SetRow | null> {
    const { data, error } = await (this.supabase.client as any)
      .from('sets')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data as SetRow | null) ?? null;
  }

  async findByCode(code: string): Promise<SetRow | null> {
    const { data, error } = await (this.supabase.client as any)
      .from('sets')
      .select('*')
      .eq('code', code)
      .maybeSingle();
    if (error) throw error;
    return (data as SetRow | null) ?? null;
  }

  async create(input: SetInsert): Promise<SetRow> {
    const { data, error } = await (this.supabase.client as any)
      .from('sets')
      .insert(input)
      .select('*')
      .single();
    if (error) throw error;
    return data as SetRow;
  }

  async update(id: string, patch: SetUpdate): Promise<SetRow> {
    const { data, error } = await (this.supabase.client as any)
      .from('sets')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as SetRow;
  }

  async deleteIfEmpty(id: string): Promise<{ deleted: boolean; productCount: number }> {
    const { count, error: countErr } = await (this.supabase.client as any)
      .from('products')
      .select('id', { head: true, count: 'exact' })
      .eq('set_id', id);
    if (countErr) throw countErr;
    if ((count ?? 0) > 0) {
      return { deleted: false, productCount: count ?? 0 };
    }
    const { error } = await (this.supabase.client as any)
      .from('sets')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return { deleted: true, productCount: 0 };
  }

  /**
   * Look up the set by code; if missing, hydrate from TCGdex and insert.
   * `card.set` is a SetResume — enough for the code/name; we fetch the full
   * set only on cache miss to populate series/release_date/symbol.
   */
  async findOrCreateFromTcgdex(card: Card): Promise<SetRow> {
    const resume: SetResume = card.set;
    const existing = await this.findByCode(resume.id);
    if (existing) return existing;

    let series: string | null = null;
    let releaseDate: string | null = null;
    let symbolImageUrl: string | null = null;
    try {
      const full: TcgdexSet | null = await this.tcgdex.client.set.get(resume.id);
      if (full) {
        series = (full as any).serie?.name ?? null;
        releaseDate = (full as any).releaseDate ?? null;
        symbolImageUrl = full.symbol ? `${full.symbol}.webp` : null;
      }
    } catch {
      // TCGdex hydration is best-effort; fall back to the resume fields.
    }

    return this.create({
      code: resume.id,
      name: resume.name,
      series,
      release_date: releaseDate,
      symbol_image_url: symbolImageUrl,
    });
  }
}
