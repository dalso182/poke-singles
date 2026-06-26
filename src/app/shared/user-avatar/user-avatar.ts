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

  // Avatar candidates, in priority order: the chosen Pokémon's mood portrait
  // (with emotion fallbacks — a missing Joyous/shiny keeps the species on a
  // safer face) → Google photo → initials. `step` points at the current one
  // and advances on each load error.
  private readonly pokemonSources = computed<string[]>(() => {
    const n = this.avatarNumber();
    return n != null ? this.pokemon.portraitUrlChain(n, this.mood()) : [];
  });

  private readonly sources = computed<string[]>(() => {
    const out = [...this.pokemonSources()];
    const google = this.googleUrl();
    if (google) out.push(google);
    return out;
  });

  protected readonly step = signal(0);

  /** True while a chosen-Pokémon portrait (any emotion) is the displayed image. */
  protected readonly showingPokemon = computed(
    () => this.step() < this.pokemonSources().length,
  );

  protected readonly src = computed<string | null>(
    () => this.sources()[this.step()] ?? null,
  );

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
    // Restart from the top candidate when the avatar, the user, or the mood
    // (cart total) changes — so a new emotion portrait is fetched again.
    effect(() => {
      this.avatarNumber();
      this.auth.currentUser();
      this.mood();
      this.step.set(0);
    });
  }

  protected onError(): void {
    this.step.update((s) => s + 1);
  }
}
