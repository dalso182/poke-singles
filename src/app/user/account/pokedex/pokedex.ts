import {
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
  viewChildren,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import {
  POKEDEX_REGIONS,
  PokemonService,
  type Pokemon,
} from '../../../core/pokemon/pokemon.service';
import { ProfilesService } from '../../../core/auth/profiles.service';

/**
 * Customer Pokédex — the full national dex grouped by region, owned Pokémon in
 * colour and not-owned ones greyed out. Rendered inside /account (lazily via
 * @defer) when the rail's "Mi Pokédex" view is active. All ~1025 tiles render at
 * once (the region bar jumps between them); cheap because each <img> is
 * natively lazy and each tile is `content-visibility: auto`, so off-screen tiles
 * skip layout/paint. Ownership is read from the already-loaded profile
 * (caught_pokemon_numbers) — no extra fetch.
 */
@Component({
  selector: 'app-pokedex',
  imports: [MatIconModule, MatProgressBarModule],
  templateUrl: './pokedex.html',
  styleUrl: './pokedex.scss',
})
export class Pokedex implements OnDestroy {
  private readonly pokemon = inject(PokemonService);
  private readonly profiles = inject(ProfilesService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly regionDefs = POKEDEX_REGIONS;
  protected readonly all = signal<Pokemon[]>([]);
  protected readonly loading = signal(true);
  protected readonly activeRegion = signal<string>(POKEDEX_REGIONS[0].key);

  protected readonly total = computed(() => this.all().length);

  /** Pokémon grouped into POKEDEX_REGIONS order; stable after the one-time load. */
  protected readonly regions = computed(() =>
    POKEDEX_REGIONS.map((r) => ({
      ...r,
      list: this.all().filter((p) => p.region === r.key),
    })),
  );

  /** The customer's caught set, reactive to the already-loaded profile. */
  protected readonly caught = computed(
    () => new Set(this.profiles.profile()?.caught_pokemon_numbers ?? []),
  );

  /** Owned totals — overall and per region — derived from the caught set. */
  protected readonly progress = computed(() => {
    const c = this.caught();
    const byRegion = new Map<string, number>();
    let total = 0;
    for (const p of this.all()) {
      if (c.has(p.number)) {
        total++;
        byRegion.set(p.region, (byRegion.get(p.region) ?? 0) + 1);
      }
    }
    return { total, byRegion };
  });

  private readonly sections = viewChildren<ElementRef<HTMLElement>>('regionSection');
  private observer: IntersectionObserver | null = null;

  constructor() {
    void this.load();

    // Scroll-spy: highlight the region nearest the top of the scroll viewport in
    // the jump bar. Guarded per the window/document convention even though the
    // component only renders client-side (it's @defer-loaded).
    effect(() => {
      const els = this.sections();
      if (!els.length || !this.isBrowser || this.observer) return;
      // The page scrolls inside <mat-sidenav-content>; observe against it (falls
      // back to the viewport if the shell markup ever changes).
      const root = this.host.nativeElement.closest(
        'mat-sidenav-content',
      ) as HTMLElement | null;
      this.observer = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            const key = (e.target as HTMLElement).dataset['region'];
            if (e.isIntersecting && key) this.activeRegion.set(key);
          }
        },
        { root, rootMargin: '-20% 0px -70% 0px', threshold: 0 },
      );
      for (const el of els) this.observer.observe(el.nativeElement);
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  private async load(): Promise<void> {
    try {
      this.all.set(await this.pokemon.list());
    } finally {
      this.loading.set(false);
    }
  }

  protected sprite(name: string): string {
    return this.pokemon.spriteUrl(name);
  }

  /** Zero-padded national-dex number, e.g. 7 → "0007". */
  protected dex(n: number): string {
    return String(n).padStart(4, '0');
  }

  protected jumpTo(key: string): void {
    this.activeRegion.set(key);
    if (!this.isBrowser) return;
    const el = this.host.nativeElement.querySelector(
      `#region-${key}`,
    ) as HTMLElement | null;
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** A missing sprite: hide the broken <img> and reveal the dex-number
   *  placeholder rendered beside it (kept display:none until needed so it
   *  doesn't bleed through transparent sprites). */
  protected onImgError(ev: Event): void {
    const img = ev.target as HTMLImageElement;
    img.style.display = 'none';
    const ph = img.previousElementSibling as HTMLElement | null;
    if (ph) ph.style.display = 'flex';
  }
}
