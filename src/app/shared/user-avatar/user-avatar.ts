import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/auth/auth.service';
import { ProfilesService } from '../../core/auth/profiles.service';
import { CartService } from '../../core/cart/cart.service';
import {
  PokemonService,
  avatarMoodForTotal,
  avatarMoodMessage,
} from '../../core/pokemon/pokemon.service';

/**
 * The signed-in user's avatar, resolved in one place so the header and /account
 * share identical logic:
 *   chosen Pokémon (portrait, mood by cart total) → Google photo → initials.
 * The Pokémon mood reflects the live cart total and shows a hover tooltip; a
 * failed image gracefully demotes to the next source. Presentational only — the
 * parent supplies the circular container (size, background, click behaviour).
 */
@Component({
  selector: 'app-user-avatar',
  imports: [MatTooltipModule],
  templateUrl: './user-avatar.html',
  styleUrl: './user-avatar.scss',
})
export class UserAvatar {
  /** Max initials in the fallback (header 2, account 1). */
  readonly maxInitials = input(2);

  private readonly auth = inject(AuthService);
  private readonly profiles = inject(ProfilesService);
  private readonly pokemon = inject(PokemonService);
  private readonly cart = inject(CartService);

  private readonly avatarNumber = this.profiles.avatarPokemonNumber;
  private readonly mood = computed(() => avatarMoodForTotal(this.cart.total()));

  private readonly googleUrl = computed(() => {
    const meta = this.auth.currentUser()?.user_metadata as
      | { avatar_url?: string; picture?: string }
      | undefined;
    return meta?.avatar_url || meta?.picture || null;
  });

  // Avatar priority: chosen Pokémon (mood portrait) → Google photo → initials.
  // Each `*Broken` flag drops a source that failed to load so the next shows.
  protected readonly pokemonBroken = signal(false);
  protected readonly googleBroken = signal(false);

  /** True while the chosen-Pokémon mood portrait is the displayed image. */
  protected readonly showingPokemon = computed(
    () => this.avatarNumber() != null && !this.pokemonBroken(),
  );

  protected readonly src = computed<string | null>(() => {
    const n = this.avatarNumber();
    if (n != null && !this.pokemonBroken()) return this.pokemon.portraitUrl(n, this.mood());
    if (!this.googleBroken()) return this.googleUrl();
    return null;
  });

  /** Mood message — only while the Pokémon portrait is shown. */
  protected readonly tooltip = computed(() =>
    this.showingPokemon() ? avatarMoodMessage(this.mood()) : '',
  );

  protected readonly initials = computed(() => {
    const user = this.auth.currentUser();
    const name =
      this.profiles.profile()?.full_name?.trim() ||
      (user?.user_metadata?.['full_name'] as string | undefined)?.trim() ||
      user?.email ||
      '';
    const letters = name
      .split(/\s+|@/)
      .filter(Boolean)
      .slice(0, this.maxInitials())
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('');
    return letters || 'U';
  });

  constructor() {
    // Re-attempt every source when the avatar, the user, or the mood (cart
    // total) changes — so a new emotion portrait is fetched again.
    effect(() => {
      this.avatarNumber();
      this.auth.currentUser();
      this.mood();
      this.pokemonBroken.set(false);
      this.googleBroken.set(false);
    });
  }

  protected onError(): void {
    if (this.showingPokemon()) this.pokemonBroken.set(true);
    else this.googleBroken.set(true);
  }
}
