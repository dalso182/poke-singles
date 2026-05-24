import { Injectable, inject, signal } from '@angular/core';
import type { Card, Set as TcgdexSet, SetResume } from '@tcgdex/sdk';
import { SupabaseService } from '../supabase/supabase.service';
import { TcgdexService } from '../tcgdex/tcgdex.service';
import type { SetInsert, SetRow, SetUpdate } from './catalog.types';

// TCGdex series we never sell as physical singles. Filtered at sync time so
// they never enter the `sets` table.
const EXCLUDED_SERIES = new Set<string>(['Pokémon TCG Pocket']);

@Injectable({ providedIn: 'root' })
export class SetsService {
  private readonly supabase = inject(SupabaseService);
  private readonly tcgdex = inject(TcgdexService);

  // Process-lifetime cache. The sets list is small (~250 rows) and changes only
  // when an admin runs the TCGdex sync or edits a set, so a single signal is
  // enough — mutating methods call `invalidate()` so subsequent reads refetch.
  private readonly cache = signal<SetRow[] | null>(null);
  private inflight: Promise<SetRow[]> | null = null;

  // Per-set in-stock product counts, cached for the session. Refresh on
  // explicit invalidate() (admins rarely flip product availability).
  private readonly countsCache = signal<Map<string, number> | null>(null);
  private countsInflight: Promise<Map<string, number>> | null = null;

  async list(options: { refresh?: boolean } = {}): Promise<SetRow[]> {
    if (!options.refresh) {
      const cached = this.cache();
      if (cached) return cached;
      if (this.inflight) return this.inflight;
    }
    this.inflight = this.fetch();
    try {
      const rows = await this.inflight;
      this.cache.set(rows);
      return rows;
    } finally {
      this.inflight = null;
    }
  }

  invalidate(): void {
    this.cache.set(null);
    this.countsCache.set(null);
  }

  /** Per-set in-stock product counts. Returns a Map keyed by set_id;
   *  sets with zero in-stock products are absent from the map. */
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

  private async fetchCounts(): Promise<Map<string, number>> {
    const { data, error } = await (this.supabase.client as any).rpc('set_product_counts');
    if (error) throw error;
    return new Map<string, number>(
      ((data ?? []) as { set_id: string; in_stock_count: number | string }[]).map((r) => [
        r.set_id,
        Number(r.in_stock_count),
      ]),
    );
  }

  /** Per-set counts of products matching a customer search query. Used by
   *  the /buscar Set filter so the counts reflect only what's in the
   *  current result set (faceted search). Not cached — the query changes
   *  with every keystroke / sort change. Pass `onSaleOnly` to scope the
   *  counts to discounted products (the /ofertas facet). */
  async countsForQuery(
    q: string,
    opts: { onSaleOnly?: boolean } = {},
  ): Promise<Map<string, number>> {
    const { data, error } = await (this.supabase.client as any).rpc('search_set_counts', {
      q,
      p_on_sale_only: opts.onSaleOnly ?? false,
    });
    if (error) throw error;
    return new Map<string, number>(
      ((data ?? []) as { set_id: string; in_stock_count: number | string }[]).map((r) => [
        r.set_id,
        Number(r.in_stock_count),
      ]),
    );
  }

  private async fetch(): Promise<SetRow[]> {
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
    this.invalidate();
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
    this.invalidate();
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
    this.invalidate();
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

    const hydrated = await this.hydrateSetFromTcgdex(resume.id);
    return this.create({
      code: resume.id,
      name: resume.name,
      series: hydrated.series,
      release_date: hydrated.releaseDate,
      symbol_image_url: hydrated.symbolImageUrl,
      printed_total: hydrated.printedTotal,
    });
  }

  /**
   * Pull every set from TCGdex and insert any whose `code` isn't already in
   * the `sets` table. Existing rows are never overwritten — admin-edited
   * names and pre-order entries are preserved. Per-set errors are swallowed
   * so one bad set doesn't abort the batch.
   *
   * Sets whose series matches `EXCLUDED_SERIES` are skipped entirely (they
   * are mobile-game-only and never sold as physical singles).
   */
  async syncFromTcgdex(): Promise<{
    added: number;
    skipped: number;
    failed: number;
    excluded: number;
  }> {
    const [resumes, existing] = await Promise.all([
      this.tcgdex.client.set.list(),
      this.list({ refresh: true }),
    ]);
    const existingCodes = new Set(existing.map((s) => s.code));

    let added = 0;
    let skipped = 0;
    let failed = 0;
    let excluded = 0;
    for (const resume of resumes) {
      if (existingCodes.has(resume.id)) {
        skipped++;
        continue;
      }
      try {
        const hydrated = await this.hydrateSetFromTcgdex(resume.id);
        if (hydrated.series && EXCLUDED_SERIES.has(hydrated.series)) {
          excluded++;
          continue;
        }
        await this.create({
          code: resume.id,
          name: resume.name,
          series: hydrated.series,
          release_date: hydrated.releaseDate,
          symbol_image_url: hydrated.symbolImageUrl,
          printed_total: hydrated.printedTotal,
        });
        added++;
      } catch {
        failed++;
      }
    }
    this.invalidate();
    return { added, skipped, failed, excluded };
  }

  private async hydrateSetFromTcgdex(code: string): Promise<{
    series: string | null;
    releaseDate: string | null;
    symbolImageUrl: string | null;
    printedTotal: number | null;
  }> {
    try {
      const full: TcgdexSet | null = await this.tcgdex.client.set.get(code);
      if (!full) {
        return {
          series: null,
          releaseDate: null,
          symbolImageUrl: null,
          printedTotal: null,
        };
      }
      return {
        series: (full as any).serie?.name ?? null,
        releaseDate: (full as any).releaseDate ?? null,
        symbolImageUrl: full.symbol ? `${full.symbol}.webp` : null,
        printedTotal: (full as any).cardCount?.official ?? null,
      };
    } catch {
      return {
        series: null,
        releaseDate: null,
        symbolImageUrl: null,
        printedTotal: null,
      };
    }
  }
}
