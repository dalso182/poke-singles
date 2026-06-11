import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthService } from './auth.service';
import type { ProfileRow, ProfileUpdate } from '../catalog/catalog.types';

/**
 * Thin wrapper for the `profiles` table plus a reactive, session-scoped cache of
 * the current user's profile. AuthService still owns the session / user-state
 * signals; this service exposes the application-level profile (display name,
 * phone, default shipping address, avatar) as a signal so chrome like the header
 * and the /account page stay in sync without each re-fetching. RLS enforces
 * self-only access, so reads/writes never pass the user id explicitly.
 */
@Injectable({ providedIn: 'root' })
export class ProfilesService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  private readonly profileSig = signal<ProfileRow | null>(null);
  /** Reactive current-user profile. null = signed out or not loaded yet. */
  readonly profile = this.profileSig.asReadonly();
  /** The chosen avatar Pokémon (national-dex number), reactive. */
  readonly avatarPokemonNumber = computed(
    () => this.profileSig()?.avatar_pokemon_number ?? null,
  );

  /** auth.users id the cached profile belongs to — guards a stale cache when
   *  the signed-in user switches. */
  private loadedUserId: string | null = null;
  private inflight: Promise<ProfileRow | null> | null = null;

  constructor() {
    // Track the session: clear the cache on sign-out, (re)load when a user
    // appears or the signed-in user changes.
    effect(() => {
      const user = this.auth.currentUser();
      if (user === undefined) return; // initial hydration still in flight
      if (!user) {
        this.setProfile(null, null);
        return;
      }
      if (this.loadedUserId !== user.id) void this.ensureLoaded();
    });
  }

  /** Load the profile into the signal unless it's already cached for the
   *  current user. Cheap to call from any consumer (header, account, checkout). */
  async ensureLoaded(): Promise<ProfileRow | null> {
    if (this.profileSig() && this.loadedUserId) return this.profileSig();
    return this.getMine();
  }

  async getMine(): Promise<ProfileRow | null> {
    if (this.inflight) return this.inflight;
    this.inflight = this.fetchMine();
    try {
      return await this.inflight;
    } finally {
      this.inflight = null;
    }
  }

  private async fetchMine(): Promise<ProfileRow | null> {
    const {
      data: { user },
    } = await this.supabase.client.auth.getUser();
    if (!user) {
      this.setProfile(null, null);
      return null;
    }

    // Explicit id filter is more robust than relying on RLS-only scoping
    // (avoids 406s from .single() when a stray row from another auth.users
    // shadows the lookup). maybeSingle returns null cleanly if no row.
    const { data, error } = await (this.supabase.client as any)
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      this.setProfile(data as ProfileRow, user.id);
      return data as ProfileRow;
    }

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
    this.setProfile(created as ProfileRow, user.id);
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
    this.setProfile(data as ProfileRow, user.id);
    return data as ProfileRow;
  }

  private setProfile(row: ProfileRow | null, userId: string | null): void {
    this.profileSig.set(row);
    this.loadedUserId = userId;
  }
}
