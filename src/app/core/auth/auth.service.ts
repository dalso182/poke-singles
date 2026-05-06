import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import type { AuthError, User } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';

export interface AuthActionResult {
  error: string | null;
}

/**
 * `undefined` while the initial session is being resolved on app load.
 * `null` once we know the user is signed out.
 */
export type CurrentUser = User | null | undefined;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService);
  private readonly document = inject(DOCUMENT);

  private readonly _currentUser = signal<CurrentUser>(undefined);
  readonly currentUser = this._currentUser.asReadonly();
  readonly isSignedIn = computed(() => this._currentUser() != null);
  readonly isAdmin = computed(() => {
    const u = this._currentUser();
    if (!u) return false;
    const role = (u.app_metadata as { role?: string } | undefined)?.role;
    return role === 'admin';
  });

  /**
   * Resolves once the initial session hydration completes. Guards await this
   * before reading isSignedIn/isAdmin so they don't race the Supabase client.
   */
  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.hydrateInitialSession();
    this.supabase.client.auth.onAuthStateChange((_event, session) => {
      this._currentUser.set(session?.user ?? null);
    });
  }

  async signInWithPassword(email: string, password: string): Promise<AuthActionResult> {
    const { error } = await this.supabase.client.auth.signInWithPassword({ email, password });
    return { error: this.mapError(error) };
  }

  async signUpWithPassword(
    email: string,
    password: string,
    displayName: string,
  ): Promise<AuthActionResult> {
    const { error } = await this.supabase.client.auth.signUp({
      email,
      password,
      options: { data: { full_name: displayName } },
    });
    return { error: this.mapError(error) };
  }

  async signInWithGoogle(): Promise<AuthActionResult> {
    const redirectTo = this.getAppBaseUrl();
    const { error } = await this.supabase.client.auth.signInWithOAuth({
      provider: 'google',
      options: redirectTo ? { redirectTo } : undefined,
    });
    return { error: this.mapError(error) };
  }

  /**
   * Send a passwordless magic-link to the given email. The link doubles as
   * signup for new emails (Supabase's `shouldCreateUser` defaults to true)
   * and as login for returning emails. After the user clicks it, Supabase
   * redirects them back to `emailRedirectTo` with a session in the URL
   * fragment, which the SDK auto-detects on page load.
   */
  async signInWithMagicLink(email: string): Promise<AuthActionResult> {
    const redirectTo = this.getAppBaseUrl();
    const { error } = await this.supabase.client.auth.signInWithOtp({
      email,
      options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
    });
    return { error: this.mapError(error) };
  }

  async signOut(): Promise<AuthActionResult> {
    const { error } = await this.supabase.client.auth.signOut();
    return { error: this.mapError(error) };
  }

  async resetPassword(email: string): Promise<AuthActionResult> {
    const redirectTo = this.getAppBaseUrl();
    const { error } = await this.supabase.client.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    return { error: this.mapError(error) };
  }

  private getAppBaseUrl(): string | undefined {
    return this.document?.baseURI;
  }

  private async hydrateInitialSession(): Promise<void> {
    try {
      const { data } = await this.supabase.client.auth.getSession();
      this._currentUser.set(data.session?.user ?? null);
    } catch {
      this._currentUser.set(null);
    }
  }

  private mapError(error: AuthError | null): string | null {
    if (!error) return null;
    const msg = error.message.toLowerCase();
    if (msg.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
    if (msg.includes('email not confirmed')) return 'Confirma tu correo antes de iniciar sesión.';
    if (msg.includes('user already registered')) return 'Ya existe una cuenta con este correo.';
    if (msg.includes('password should be at least'))
      return 'La contraseña debe tener al menos 6 caracteres.';
    if (msg.includes('rate limit'))
      return 'Demasiados intentos. Espera un momento antes de volver a intentarlo.';
    if (msg.includes('network')) return 'No se pudo conectar. Revisa tu conexión.';
    return 'No fue posible completar la acción. Inténtalo de nuevo.';
  }
}
