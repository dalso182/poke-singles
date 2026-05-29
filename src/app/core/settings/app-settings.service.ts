import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import type { AppSettingsRow, AppSettingsUpdate } from '../catalog/catalog.types';

@Injectable({ providedIn: 'root' })
export class AppSettingsService {
  private readonly supabase = inject(SupabaseService);

  /** Cached singleton row + when it was fetched, so the maintenance guard
   *  doesn't round-trip on every storefront navigation. */
  private cached: AppSettingsRow | null = null;
  private fetchedAt = 0;
  private inFlight: Promise<AppSettingsRow> | null = null;

  /** Always-fresh read (used by the admin config screen). Refreshes the cache. */
  async get(): Promise<AppSettingsRow> {
    return this.fetchAndCache();
  }

  /** Cached read with a short TTL. Returns the cached row if it's younger than
   *  `maxAgeMs`; otherwise re-fetches. Concurrent calls share one request. */
  async load(maxAgeMs = 60_000): Promise<AppSettingsRow> {
    if (this.cached && Date.now() - this.fetchedAt < maxAgeMs) return this.cached;
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.fetchAndCache().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  /** Maintenance flag + message, derived from the cached settings. */
  async getMaintenance(): Promise<{ on: boolean; message: string | null }> {
    const s = await this.load();
    return { on: !!s.maintenance_mode, message: s.maintenance_message };
  }

  async update(patch: AppSettingsUpdate): Promise<AppSettingsRow> {
    const { data, error } = await (this.supabase.client as any)
      .from('app_settings')
      .update(patch)
      .eq('id', true)
      .select('*')
      .single();
    if (error) throw error;
    this.cached = data as AppSettingsRow;
    this.fetchedAt = Date.now();
    return this.cached;
  }

  private async fetchAndCache(): Promise<AppSettingsRow> {
    const { data, error } = await (this.supabase.client as any)
      .from('app_settings')
      .select('*')
      .eq('id', true)
      .single();
    if (error) throw error;
    this.cached = data as AppSettingsRow;
    this.fetchedAt = Date.now();
    return this.cached;
  }
}
