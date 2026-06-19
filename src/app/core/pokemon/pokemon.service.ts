import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface Pokemon {
  number: number;
  name: string;
  displayName: string;
  region: string;
}

/** SpriteCollab portrait emotions: Sad/Normal/Happy/Joyous drive the cart-total
 *  mood; Teary-Eyed is the fixed empty-cart mascot. */
export type PortraitEmotion = 'Sad' | 'Normal' | 'Happy' | 'Joyous' | 'Teary-Eyed';

/** Fallback avatar Pokémon (Charizard) when the user hasn't picked one — or when
 *  the picked species lacks the requested portrait. */
export const DEFAULT_AVATAR_NUMBER = 6;

export interface AvatarMood {
  emotion: PortraitEmotion;
  /** Top spending tier → the shiny portrait (different URL shape). */
  shiny: boolean;
}

/** Map a cart total (CRC) to the avatar's mood. */
export function avatarMoodForTotal(total: number): AvatarMood {
  if (total <= 0) return { emotion: 'Sad', shiny: false };
  if (total < 5000) return { emotion: 'Normal', shiny: false };
  if (total < 20000) return { emotion: 'Happy', shiny: false };
  if (total < 50000) return { emotion: 'Joyous', shiny: false };
  return { emotion: 'Joyous', shiny: true };
}

/** Playful Spanish line shown on avatar hover for each mood. */
export function avatarMoodMessage(mood: AvatarMood): string {
  if (mood.shiny) return 'Ese carrito brilla como yo! ✨';
  switch (mood.emotion) {
    case 'Sad':
      return 'Estoy triste de ver el carrito vacío';
    case 'Normal':
      return 'Buen comienzo… ¿y si agregamos más al carrito?';
    case 'Happy':
      return '¡Muy bien, me gusta lo que veo en el carrito!';
    case 'Joyous':
      return 'Ufff que maravilla de carrito!';
    default:
      return '';
  }
}

/**
 * Client-side Pokémon reference data (the national dex), loaded once from the
 * static asset `assets/data/pokemon.json` (~105 KB, ~1,025 entries). This is
 * pure reference data that never changes and never joins to anything in
 * Postgres, so it stays a static asset rather than a table — the only thing the
 * DB stores is the chosen `avatar_pokemon_number` on the profile. The list is
 * fetched lazily on first use (i.e. when the avatar picker opens) and cached for
 * the session, mirroring the single-signal cache pattern in SetsService.
 */
@Injectable({ providedIn: 'root' })
export class PokemonService {
  private readonly http = inject(HttpClient);

  private readonly cache = signal<Pokemon[] | null>(null);
  private inflight: Promise<Pokemon[]> | null = null;

  /** The full national-dex list, cached after the first load. */
  async list(): Promise<Pokemon[]> {
    const cached = this.cache();
    if (cached) return cached;
    if (this.inflight) return this.inflight;
    this.inflight = firstValueFrom(
      this.http.get<Pokemon[]>('assets/data/pokemon.json'),
    );
    try {
      const rows = await this.inflight;
      this.cache.set(rows);
      return rows;
    } finally {
      this.inflight = null;
    }
  }

  /** Portrait URL for a dex number at a given mood. TEMP: testing remote
   *  PMDCollab SpriteCollab portraits (dex id zero-padded to 4 digits, e.g.
   *  3 → 0003). Shiny inserts `0000/0001/` before the emotion. Revert to
   *  `assets/images/avatars/${n}.png` for self-hosted art. */
  portraitUrl(
    n: number,
    mood: AvatarMood = { emotion: 'Normal', shiny: false },
  ): string {
    const id = String(n).padStart(4, '0');
    const variant = mood.shiny ? '0000/0001/' : '';
    const base = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/portrait';
    return `${base}/${id}/${variant}${mood.emotion}.png`;
  }
}
