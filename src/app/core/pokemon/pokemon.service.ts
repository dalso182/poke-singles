import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface Pokemon {
  number: number;
  name: string;
  displayName: string;
  region: string;
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

  /** Static avatar artwork path for a dex number. The PNGs are added
   *  incrementally, so callers must handle a missing image (it may 404). */
  avatarUrl(n: number): string {
    return `assets/images/avatars/${n}.png`;
  }
}
