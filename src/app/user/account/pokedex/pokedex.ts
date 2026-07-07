import {
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChildren,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
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
 *
 * Also reused by the admin customer detail (/admin/customers/:id, Pokédex tab):
 * passing `caughtNumbers` switches the component to viewing SOMEONE ELSE'S dex —
 * ownership comes from the input instead of the signed-in profile and the
 * Pokéball capture CTA is hidden (it would spend the viewer's own coins).
 * `tileSize` shrinks the sprites there (75px vs the storefront's 100px default).
 */
@Component({
  selector: 'app-pokedex',
  imports: [MatIconModule, MatProgressBarModule],
  templateUrl: './pokedex.html',
  styleUrl: './pokedex.scss',
  host: { '[style.--pdx-tile.px]': 'tileSize()' },
})
export class Pokedex implements OnDestroy {
  private readonly pokemon = inject(PokemonService);
  private readonly profiles = inject(ProfilesService);
  private readonly dialog = inject(MatDialog);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Emitted after the Pokéball modal closes having opened ≥1 ball, so the
   *  account page can refresh its Poke-Monedas history list. */
  readonly coinsSpent = output<void>();

  /** External ownership override (admin viewing a customer's dex). null (the
   *  default) = self mode, reading the signed-in profile. */
  readonly caughtNumbers = input<number[] | null>(null);
  /** Header title — the storefront keeps the default. */
  readonly title = input('Mi Pokédex');
  /** Sprite square in px; bound to --pdx-tile on the host. */
  readonly tileSize = input(100);

  /** Viewing someone else's dex → read-only (no capture CTA). */
  protected readonly external = computed(() => this.caughtNumbers() !== null);

  protected readonly regionDefs = POKEDEX_REGIONS;
  protected readonly all = signal<Pokemon[]>([]);
  protected readonly loading = signal(true);
  protected readonly activeRegion = signal<string>(POKEDEX_REGIONS[0].key);
  /** Ownership filter: everything, only caught, or only still-missing. */
  protected readonly filter = signal<'all' | 'owned' | 'missing'>('all');
  /** Back-to-top FAB visibility (shown after scrolling down a bit). */
  protected readonly showTop = signal(false);

  protected readonly total = computed(() => this.all().length);

  /** Pokémon grouped into POKEDEX_REGIONS order, narrowed by the ownership
   *  filter. Regions left empty by the filter are dropped (no bare headers). */
  protected readonly regions = computed(() => {
    const f = this.filter();
    const c = this.caught();
    return POKEDEX_REGIONS.map((r) => ({
      ...r,
      list: this.all().filter(
        (p) =>
          p.region === r.key &&
          (f === 'all' || (f === 'owned') === c.has(p.number)),
      ),
    })).filter((r) => r.list.length > 0 || f === 'all');
  });

  /** The caught set — the input override when viewing another user's dex,
   *  else reactive to the signed-in user's already-loaded profile. */
  protected readonly caught = computed(() => {
    const external = this.caughtNumbers();
    return new Set(
      external ?? this.profiles.profile()?.caught_pokemon_numbers ?? [],
    );
  });

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
  /** The scrolling container (<mat-sidenav-content>); null → viewport. */
  private scrollRoot: HTMLElement | null = null;
  private scrollBound = false;
  private readonly onScroll = (): void => {
    const top = this.scrollRoot
      ? this.scrollRoot.scrollTop
      : (document.scrollingElement?.scrollTop ?? 0);
    this.showTop.set(top > 600);
  };

  constructor() {
    void this.load();

    // Scroll-spy: highlight the region nearest the top of the scroll viewport in
    // the jump bar. Guarded per the window/document convention even though the
    // component only renders client-side (it's @defer-loaded). Re-created every
    // time the section list changes (the ownership filter adds/removes regions).
    effect(() => {
      const els = this.sections();
      if (!els.length || !this.isBrowser) return;
      // The page scrolls inside <mat-sidenav-content>; observe against it (falls
      // back to the viewport if the shell markup ever changes).
      const root = this.host.nativeElement.closest(
        'mat-sidenav-content',
      ) as HTMLElement | null;
      this.observer?.disconnect();
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

      // One-time: watch scroll depth for the back-to-top FAB.
      if (!this.scrollBound) {
        this.scrollBound = true;
        this.scrollRoot = root;
        (root ?? window).addEventListener('scroll', this.onScroll, {
          passive: true,
        });
      }
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    if (this.scrollBound) {
      (this.scrollRoot ?? window).removeEventListener('scroll', this.onScroll);
    }
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

  /** Back-to-top FAB: smooth-scroll the container back to the start. */
  protected scrollToTop(): void {
    if (!this.isBrowser) return;
    (this.scrollRoot ?? window).scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** Open the Pokéball redemption modal (lazy-imported — most Pokédex visits
   *  don't open it). Dialog resolves `true` when at least one ball was opened;
   *  the dialog itself already refreshed the profile + balance signals. */
  protected async openCapture(): Promise<void> {
    const { PokeballDialog } = await import('./pokeball-dialog/pokeball-dialog');
    const ref = this.dialog.open(PokeballDialog, {
      width: '720px',
      maxWidth: '95vw',
      maxHeight: '85vh',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });
    ref.afterClosed().subscribe((opened?: boolean) => {
      if (opened) this.coinsSpent.emit();
    });
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
