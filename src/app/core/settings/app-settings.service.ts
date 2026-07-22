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

  /** Maintenance flag + message + optional image, derived from the cached settings. */
  async getMaintenance(): Promise<{
    on: boolean;
    message: string | null;
    imageUrl: string | null;
  }> {
    const s = await this.load();
    return {
      on: !!s.maintenance_mode,
      message: s.maintenance_message,
      imageUrl: s.maintenance_image_url,
    };
  }

  /** Whether the current session may browse the store while maintenance mode is
   *  on (admins + whitelisted tester emails). Answered by a security-definer RPC
   *  so the whitelist itself stays invisible to non-admins; memoized per user so
   *  the guard doesn't round-trip on every navigation. */
  private bypassCache: { uid: string; allowed: boolean } | null = null;

  async canBypassMaintenance(): Promise<boolean> {
    const { data: sessionData } = await this.supabase.client.auth.getSession();
    const uid = sessionData.session?.user?.id;
    if (!uid) return false;
    if (this.bypassCache?.uid === uid) return this.bypassCache.allowed;
    const { data, error } = await (this.supabase.client as any).rpc(
      'maintenance_bypass_allowed'
    );
    if (error) return false;
    this.bypassCache = { uid, allowed: !!data };
    return this.bypassCache.allowed;
  }

  /** Admin-only: the tester whitelist (emails allowed through maintenance). */
  async getMaintenanceTesters(): Promise<string[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('maintenance_testers')
      .select('email')
      .order('email');
    if (error) throw error;
    return (data as { email: string }[]).map((r) => r.email);
  }

  /** Admin-only: replace the whole tester whitelist. PostgREST deletes need a
   *  filter (pg-safeupdate), hence the catch-all gte. */
  async setMaintenanceTesters(emails: string[]): Promise<void> {
    const normalized = [
      ...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)),
    ];
    const table = (this.supabase.client as any).from('maintenance_testers');
    const { error: delError } = await table.delete().gte('email', '');
    if (delError) throw delError;
    if (normalized.length) {
      const { error } = await (this.supabase.client as any)
        .from('maintenance_testers')
        .insert(normalized.map((email) => ({ email })));
      if (error) throw error;
    }
    this.bypassCache = null;
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
