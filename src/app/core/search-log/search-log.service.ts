import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

/** Records committed storefront searches for the admin "Búsquedas" report. */
@Injectable({ providedIn: 'root' })
export class SearchLogService {
  private readonly supabase = inject(SupabaseService);

  /** Fire-and-forget log of one search from the search box. First counts the
   *  visible matches in the caller's RLS context (so the number reflects what the
   *  shopper sees), then records the search — keyword + IP + customer are captured
   *  server-side. Best-effort: a failure never blocks navigation. */
  async logSearch(term: string): Promise<void> {
    const q = term.trim();
    if (!q) return;
    try {
      const client = this.supabase.client as any;
      const { data: found } = await client.rpc('count_search_products', { q });
      await client.rpc('log_search', { p_term: q, p_found: found ?? 0 });
    } catch (err) {
      console.error('[search-log] logSearch', err);
    }
  }
}
