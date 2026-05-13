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
    const {
      data: { user },
    } = await this.supabase.client.auth.getUser();
    if (!user) return null;

    // Explicit id filter is more robust than relying on RLS-only scoping
    // (avoids 406s from .single() when a stray row from another auth.users
    // shadows the lookup). maybeSingle returns null cleanly if no row.
    const { data, error } = await (this.supabase.client as any)
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    if (error) throw error;
    if (data) return data as ProfileRow;

    // Self-heal: profile row missing for the current auth.users id (e.g. the
    // user pre-dates handle_new_user, or the trigger didn't fire). Create
    // one from session metadata so /account, checkout prefill, and the v3
    // place_order backfill all have something to work with.
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const fullName =
      (typeof meta['full_name'] === 'string' && meta['full_name'].trim()) ||
      (typeof meta['name'] === 'string' && (meta['name'] as string).trim()) ||
      null;
    const { data: created, error: createErr } = await (this.supabase.client as any)
      .from('profiles')
      .insert({ id: user.id, full_name: fullName })
      .select('*')
      .single();
    if (createErr) {
      console.error('[profiles] self-heal failed', createErr);
      return null;
    }
    return created as ProfileRow;
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
