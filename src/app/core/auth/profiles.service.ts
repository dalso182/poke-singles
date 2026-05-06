import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import type { ProfileRow, ProfileUpdate } from '../catalog/catalog.types';

/**
 * Thin wrapper for the `profiles` table. AuthService still owns session /
 * user-state signals; this service just gets/updates application-level
 * profile data (display name, phone, default shipping address). RLS enforces
 * self-only access so we don't need to pass the user id explicitly on read.
 */
@Injectable({ providedIn: 'root' })
export class ProfilesService {
  private readonly supabase = inject(SupabaseService);

  async getMine(): Promise<ProfileRow | null> {
    // RLS scopes the result to the current user's row, so .single() is safe.
    // PGRST116 means "no rows" (e.g. signed out, or backfill missed) — return
    // null rather than throwing so callers can treat it as "no profile yet".
    const { data, error } = await (this.supabase.client as any)
      .from('profiles')
      .select('*')
      .single();
    if (error) {
      if ((error as { code?: string }).code === 'PGRST116') return null;
      throw error;
    }
    return data as ProfileRow;
  }

  async updateMine(patch: ProfileUpdate): Promise<ProfileRow> {
    const {
      data: { user },
    } = await this.supabase.client.auth.getUser();
    if (!user) throw new Error('No hay sesión activa.');
    const { data, error } = await (this.supabase.client as any)
      .from('profiles')
      .update(patch)
      .eq('id', user.id)
      .select('*')
      .single();
    if (error) throw error;
    return data as ProfileRow;
  }
}
