import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { ProfilesService } from '../../core/auth/profiles.service';
import {
  PokemonService,
  DEFAULT_AVATAR_NUMBER,
} from '../../core/pokemon/pokemon.service';

/**
 * Empty-cart mascot: the user's chosen avatar Pokémon wearing the fixed
 * 'Teary-Eyed' portrait (sad about the empty cart). Falls back to the default
 * Pokémon when none is picked or that species has no Teary-Eyed portrait.
 * Rounded like the avatar; the parent sets the size.
 */
@Component({
  selector: 'app-empty-cart-pokemon',
  template: `
    <img
      class="ecp"
      [style.width.px]="size()"
      [style.height.px]="size()"
      [src]="src()"
      alt=""
      referrerpolicy="no-referrer"
      (error)="onError()"
    />
  `,
  styles: `
    .ecp {
      border-radius: 999px;
      object-fit: cover;
      background: #fff;
      border: 1px solid var(--border-subtle);
      box-shadow: 0 10px 22px -12px rgba(0, 0, 0, 0.3);
    }
  `,
})
export class EmptyCartPokemon {
  /** Rendered diameter in px. */
  readonly size = input(96);

  private readonly profiles = inject(ProfilesService);
  private readonly pokemon = inject(PokemonService);

  /** Drops to the default Pokémon if the chosen one has no Teary-Eyed portrait. */
  private readonly fallback = signal(false);

  protected readonly src = computed(() => {
    const chosen = this.profiles.avatarPokemonNumber() ?? DEFAULT_AVATAR_NUMBER;
    const n = this.fallback() ? DEFAULT_AVATAR_NUMBER : chosen;
    return this.pokemon.portraitUrl(n, { emotion: 'Teary-Eyed', shiny: false });
  });

  constructor() {
    // Re-try the chosen species whenever the picked avatar changes.
    effect(() => {
      this.profiles.avatarPokemonNumber();
      this.fallback.set(false);
    });
  }

  protected onError(): void {
    this.fallback.set(true);
  }
}
