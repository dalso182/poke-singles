import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface Pokemon {
  number: number;
  name: string;
  displayName: string;
  region: string;
}

/** Region jump-nav order + display labels for the customer Pokédex. Keys match
 *  the lowercase `region` field on each Pokémon row in pokemon.json. */
export const POKEDEX_REGIONS = [
  { key: 'kanto', label: 'Kanto' },
  { key: 'johto', label: 'Johto' },
  { key: 'hoenn', label: 'Hoenn' },
  { key: 'sinnoh', label: 'Sinnoh' },
  { key: 'unova', label: 'Unova' },
  { key: 'kalos', label: 'Kalos' },
  { key: 'alola', label: 'Alola' },
  { key: 'galar', label: 'Galar' },
  { key: 'paldea', label: 'Paldea' },
] as const;

/** Rare cases where the PokeAPI slug stored in pokemon.json differs from the
 *  pokemondb sprite filename. Base species verified to map cleanly today, so
 *  this is empty — add `pokeApiSlug: pokemondbSlug` entries only if a sprite 404s. */
const SPRITE_NAME_OVERRIDES: Record<string, string> = {};

/** SpriteCollab portrait emotions: Normal/Happy/Joyous drive the cart-total
 *  mood; Teary-Eyed is the fixed empty-cart mascot. */
export type PortraitEmotion = 'Normal' | 'Happy' | 'Joyous' | 'Teary-Eyed';

/** Fallback avatar Pokémon (Charizard) when the user hasn't picked one — or when
 *  the picked species lacks the requested portrait. */
export const DEFAULT_AVATAR_NUMBER = 6;

export interface AvatarMood {
  emotion: PortraitEmotion;
  /** Top spending tier → the shiny portrait (different URL shape). */
  shiny: boolean;
}

/** Map a cart total (CRC) to the avatar's mood. An empty cart (total <= 0) shares
 *  the 'Normal' tier — there's no dedicated sad state. */
export function avatarMoodForTotal(total: number): AvatarMood {
  if (total < 5000) return { emotion: 'Normal', shiny: false };
  if (total < 20000) return { emotion: 'Happy', shiny: false };
  if (total < 50000) return { emotion: 'Joyous', shiny: false };
  return { emotion: 'Joyous', shiny: true };
}

/** Moods to try, in order, before giving up on a species — the requested one
 *  down to the always-present 'Normal'. Keeps the avatar on the user's Pokémon
 *  when a rare emotion (Joyous) or the shiny variant is missing on SpriteCollab,
 *  instead of dropping the species entirely. */
export function portraitMoodChain(mood: AvatarMood): AvatarMood[] {
  const ladder: PortraitEmotion[] = ['Joyous', 'Happy', 'Normal'];
  const i = ladder.indexOf(mood.emotion);
  // Teary-Eyed isn't on the ladder → try itself, then Normal.
  const tail: PortraitEmotion[] = i >= 0 ? ladder.slice(i) : [mood.emotion, 'Normal'];
  const chain: AvatarMood[] = [];
  // Top tier is shiny: keep the ✨ look across every emotion downgrade (shiny
  // Joyous → shiny Happy → shiny Normal) before dropping to non-shiny — a
  // species missing shiny Joyous but with shiny Normal still rewards the tier.
  if (mood.shiny) for (const emotion of tail) chain.push({ emotion, shiny: true });
  for (const emotion of tail) chain.push({ emotion, shiny: false });
  return chain;
}

/** Playful Spanish line shown on avatar hover for each mood. */
export function avatarMoodMessage(mood: AvatarMood): string {
  if (mood.shiny) return '¡Este carrito brilla como yo, mae! ✨';
  switch (mood.emotion) {
    case 'Normal':
      return '¡Pura vida! ¿Armamos el carrito?';
    case 'Happy':
      return '¡Qué chiva lo que llevás!';
    case 'Joyous':
      return 'Uffff!!, carrito de miedo 🔥';
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

  /** De-duplicated, ordered portrait URLs to try for a dex number at a mood —
   *  the requested emotion first, then safer fallbacks down to 'Normal'. When
   *  the mood is already non-shiny 'Normal' the chain is a single URL. */
  portraitUrlChain(n: number, mood: AvatarMood): string[] {
    return [...new Set(portraitMoodChain(mood).map((m) => this.portraitUrl(n, m)))];
  }

  /** Pokémon HOME sprite (AVIF, 2x) for the Pokédex grid, keyed by the lowercase
   *  PokeAPI name slug. Remote CDN (pokemondb) — fine for reference sprites,
   *  unlike product imagery which is self-hosted. */
  spriteUrl(name: string): string {
    const slug = SPRITE_NAME_OVERRIDES[name] ?? name;
    return `https://img.pokemondb.net/sprites/home/normal/2x/avif/${slug}.avif`;
  }
}
