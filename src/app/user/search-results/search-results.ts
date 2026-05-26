import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ProductsService } from '../../core/catalog/products.service';
import { SetsService } from '../../core/catalog/sets.service';
import { CardTypesService } from '../../core/catalog/card-types.service';
import { normalizeSort } from '../../core/catalog/catalog.types';
import type {
  CardTypeRow,
  ProductSearchRow,
  SetRow,
  SortKey,
} from '../../core/catalog/catalog.types';
import { FiltersBar } from '../../shared/filters-bar/filters-bar';
import { SetFilter } from '../../shared/filters-bar/set-filter/set-filter';
import { CardTypeFilter } from '../../shared/filters-bar/card-type-filter/card-type-filter';
import { SortSelect } from '../../shared/sort-select/sort-select';
import { ProductCard } from '../../shared/product-card/product-card';
import { LoadMore } from '../../shared/load-more/load-more';

@Component({
  selector: 'app-search-results',
  imports: [
    RouterLink,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    FiltersBar,
    SetFilter,
    CardTypeFilter,
    SortSelect,
    ProductCard,
    LoadMore,
  ],
  templateUrl: './search-results.html',
  styleUrl: './search-results.scss',
})
export class SearchResults {
  // URL-bound via withComponentInputBinding(). Empty defaults handle the
  // "browse via /buscar with no params" case.
  readonly q = input<string>('');
  readonly sort = input<string>('');
  /** Comma-separated set ids; parsed into selectedSetIds. */
  readonly sets = input<string | undefined>(undefined);
  /** Comma-separated card-type ids; parsed into selectedCardTypeIds. */
  readonly types = input<string | undefined>(undefined);

  private readonly products = inject(ProductsService);
  private readonly setsService = inject(SetsService);
  private readonly cardTypesService = inject(CardTypesService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  protected readonly allSets = signal<SetRow[]>([]);
  protected readonly setCounts = signal<Map<string, number>>(new Map());
  protected readonly allCardTypes = signal<CardTypeRow[]>([]);
  protected readonly cardTypeCounts = signal<Map<string, number>>(new Map());

  protected readonly selectedSetIds = computed<string[]>(() => parseIdList(this.sets()));
  protected readonly selectedCardTypeIds = computed<string[]>(() => parseIdList(this.types()));

  protected readonly anyFilterActive = computed<boolean>(
    () => this.selectedSetIds().length > 0 || this.selectedCardTypeIds().length > 0,
  );

  protected readonly results = signal<ProductSearchRow[]>([]);
  protected readonly loading = signal(false);
  /** Current page held in the grid (1-based). In-component only — never a URL
   *  param. The fetch effect drops it back to 1; loadMore() bumps it. */
  protected readonly page = signal(1);
  /** True while loadMore() is fetching the next page (drives the button spinner). */
  protected readonly loadingMore = signal(false);
  /** Whether another page might exist — set from `rows.length === PAGE_SIZE`
   *  after each fetch. Drives whether the "Cargar más" button is shown. */
  protected readonly hasMore = signal(false);

  /** Resolves the URL's raw `sort` param to a known SortKey, falling back to
   *  the per-context default (relevance with a query, recent without). */
  protected readonly normalizedSort = computed<SortKey>(() =>
    normalizeSort(this.sort(), this.q().trim().length > 0),
  );

  protected readonly hasQuery = computed(() => this.q().trim().length > 0);

  constructor() {
    void this.loadFilterMeta();
    effect(() => {
      const q = this.q().trim();
      const sort = this.normalizedSort();
      const setIds = this.selectedSetIds();
      const cardTypeIds = this.selectedCardTypeIds();
      void this.fetch(q, sort, setIds, cardTypeIds);
      // Refresh facet counts whenever the search query changes — counts
      // exclude the set/card-type filters on purpose so other options
      // remain meaningful when one is already selected.
      void this.refreshCounts(q);
    });
  }

  private async loadFilterMeta(): Promise<void> {
    try {
      const [sets, cardTypes] = await Promise.all([
        this.setsService.list(),
        this.cardTypesService.list({ activeOnly: true }),
      ]);
      this.allSets.set(sets);
      this.allCardTypes.set(cardTypes);
    } catch {
      // Best-effort — the page still works without the filter chrome.
    }
  }

  /** Query-aware facet counts: counts of products matching the current
   *  search query, grouped by set / card_type. */
  private async refreshCounts(q: string): Promise<void> {
    try {
      const [setCounts, cardTypeCounts] = await Promise.all([
        this.setsService.countsForQuery(q),
        this.cardTypesService.countsForQuery(q),
      ]);
      this.setCounts.set(setCounts);
      this.cardTypeCounts.set(cardTypeCounts);
    } catch {
      // Leave previous counts in place if the fetch fails.
    }
  }

  private async fetch(
    q: string,
    sort: SortKey,
    setIds: string[],
    cardTypeIds: string[],
  ): Promise<void> {
    this.loading.set(true);
    try {
      const { rows } = await this.products.search({
        q,
        sort,
        pageSize: PAGE_SIZE,
        setIds: setIds.length > 0 ? setIds : undefined,
        cardTypeIds: cardTypeIds.length > 0 ? cardTypeIds : undefined,
      });
      this.results.set(rows);
      this.page.set(1);
      this.hasMore.set(rows.length === PAGE_SIZE);
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
      this.results.set([]);
      this.hasMore.set(false);
    } finally {
      this.loading.set(false);
    }
  }

  /** Fetch the next page and append it to the results. The fetch effect owns
   *  page 1 + query/filter changes; this only ever grows the current set. */
  protected async loadMore(): Promise<void> {
    if (this.loadingMore() || this.loading() || !this.hasMore()) return;
    const next = this.page() + 1;
    this.loadingMore.set(true);
    try {
      const setIds = this.selectedSetIds();
      const cardTypeIds = this.selectedCardTypeIds();
      const { rows } = await this.products.search({
        q: this.q().trim(),
        sort: this.normalizedSort(),
        pageSize: PAGE_SIZE,
        page: next,
        setIds: setIds.length > 0 ? setIds : undefined,
        cardTypeIds: cardTypeIds.length > 0 ? cardTypeIds : undefined,
      });
      // Stale-append guard: if the query/filters changed mid-load the fetch
      // effect reset page() to 1, so these rows are stale — drop them.
      if (this.page() + 1 === next) {
        this.results.update((prev) => [...prev, ...rows]);
        this.page.set(next);
        this.hasMore.set(rows.length === PAGE_SIZE);
      }
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.loadingMore.set(false);
    }
  }

  protected onSortChange(next: SortKey): void {
    void this.router.navigate(['/buscar'], {
      queryParams: { sort: next },
      queryParamsHandling: 'merge',
    });
  }

  protected onSetsChange(ids: string[]): void {
    void this.router.navigate(['/buscar'], {
      queryParams: { sets: ids.length > 0 ? ids.join(',') : null },
      queryParamsHandling: 'merge',
    });
  }

  protected onCardTypesChange(ids: string[]): void {
    void this.router.navigate(['/buscar'], {
      queryParams: { types: ids.length > 0 ? ids.join(',') : null },
      queryParamsHandling: 'merge',
    });
  }

  protected onClearAllFilters(): void {
    void this.router.navigate(['/buscar'], {
      queryParams: { sets: null, types: null },
      queryParamsHandling: 'merge',
    });
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}

/** Rows fetched per page. A full page means another might exist (hasMore);
 *  a short page is the end. Keep in sync with CardList. */
const PAGE_SIZE = 60;

function parseIdList(raw: string | undefined): string[] {
  const s = (raw ?? '').trim();
  if (!s) return [];
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}
