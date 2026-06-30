import { Injectable, PLATFORM_ID, effect, inject, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../../core/auth/auth.service';
import { ProfilesService } from '../../../core/auth/profiles.service';
import { AvatarPickerDialog, type AvatarPickerData } from './avatar-picker-dialog';

/**
 * Owns the favorite-Pokémon (avatar) picker dialog: opening it + persisting the
 * choice (shared by `/account`), plus the post-login onboarding prompt that
 * auto-opens it once for a freshly signed-in customer who hasn't picked a
 * favorite yet.
 *
 * Activated from `UserShell` so the prompt is scoped to the storefront (never
 * the admin shell). Root-provided, so its per-session dedupe state survives the
 * shell remounting as the user moves in and out of `/admin`.
 */
@Injectable({ providedIn: 'root' })
export class AvatarPickerService {
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly profiles = inject(ProfilesService);
  private readonly auth = inject(AuthService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Last SIGNED_IN tick fully resolved (i.e. the profile had loaded). */
  private lastHandledTick = 0;
  /** Users already nudged this app session — stops a re-pop on the token-refresh
   *  SIGNED_IN events that share the same user id. */
  private readonly promptedUsers = new Set<string>();

  constructor() {
    if (!this.isBrowser) return;
    // Auto-open the picker once right after a fresh login when the user has no
    // favorite yet. Keys off `signedInTick` (the SIGNED_IN event — which also
    // covers magic-link / OAuth redirect callbacks) rather than `currentUser()`,
    // which can't distinguish a redirect-login from a plain page reload.
    effect(() => {
      const tick = this.auth.signedInTick();
      const user = this.auth.currentUser();
      const profile = this.profiles.profile();

      if (tick === 0 || tick === this.lastHandledTick) return; // no new login
      if (!user) return;
      if (!profile || profile.id !== user.id) return; // wait for THIS user's profile

      this.lastHandledTick = tick; // resolved this login — handle it exactly once
      if (this.auth.isAdmin()) return; // don't nag the store owner
      if (profile.avatar_pokemon_number != null) return; // already chose one
      if (this.promptedUsers.has(user.id)) return; // already nudged this session
      this.promptedUsers.add(user.id);
      // Open outside the reactive read phase; the save below mutates the profile
      // signal, which re-runs this effect (then short-circuits on lastHandledTick).
      untracked(() => this.openAndSave(null));
    });
  }

  /** Open the picker (highlighting `current`) and persist a new selection.
   *  Shared by the `/account` "Cambiar Pokémon" button and the login prompt. */
  openAndSave(current: number | null): void {
    const ref = this.dialog.open<AvatarPickerDialog, AvatarPickerData, number | null>(
      AvatarPickerDialog,
      {
        width: '720px',
        maxWidth: '95vw',
        maxHeight: '85vh',
        autoFocus: 'first-tabbable',
        data: { current },
      },
    );
    ref.afterClosed().subscribe((picked) => {
      if (picked == null || picked === this.profiles.avatarPokemonNumber()) return;
      void this.save(picked);
    });
  }

  private async save(n: number): Promise<void> {
    try {
      await this.profiles.updateMine({ avatar_pokemon_number: n });
      this.snack.open('Avatar actualizado', 'OK', { duration: 3000 });
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    }
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
