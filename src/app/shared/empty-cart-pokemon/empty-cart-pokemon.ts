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

  /** Portrait candidates: keep the chosen species (Teary-Eyed, then its Normal
   *  face) before falling back to the default Pokémon. `step` advances on each
   *  load error; the last entry repeats so the <img> never goes empty. */
  private readonly teary = { emotion: 'Teary-Eyed', shiny: false } as const;

  private readonly sources = computed<string[]>(() => {
    const chosen = this.profiles.avatarPokemonNumber() ?? DEFAULT_AVATAR_NUMBER;
    return [
      ...this.pokemon.portraitUrlChain(chosen, this.teary),
      ...this.pokemon.portraitUrlChain(DEFAULT_AVATAR_NUMBER, this.teary),
    ];
  });

  private readonly step = signal(0);

  protected readonly src = computed(() => {
    const list = this.sources();
    return list[Math.min(this.step(), list.length - 1)];
  });

  constructor() {
    // Restart from the chosen species whenever the picked avatar changes.
    effect(() => {
      this.profiles.avatarPokemonNumber();
      this.step.set(0);
    });
  }

  protected onError(): void {
    this.step.update((s) => s + 1);
  }
}
