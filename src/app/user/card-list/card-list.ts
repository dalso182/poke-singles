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

@Component({
  selector: 'app-card-list',
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
  ],
  templateUrl: './card-list.html',
  styleUrl: './card-list.scss',
})
export class CardList {
  /** URL-bound via withComponentInputBinding(). Comma-separated set ids. */
  readonly sets = input<string | undefined>(undefined);
  /** Comma-separated card-type ids. */
  readonly types = input<string | undefined>(undefined);
  /** URL `sort` param. No query here, so 'relevance' is never offered. */
  readonly sort = input<string>('recent');
  /** Route-data bound. When true the grid lists only discounted products and
   *  the page presents as /ofertas. Default false = the full /products grid. */
  readonly onSaleOnly = input<boolean>(false);
  /** Route-data bound. Base path used for filter/sort navigation so the same
   *  component keeps you on /products or /ofertas as appropriate. */
  readonly basePath = input<string>('/products');

  private readonly products = inject(ProductsService);
  private readonly setsService = inject(SetsService);
  private readonly cardTypesService = inject(CardTypesService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly cards = signal<ProductSearchRow[]>([]);
  protected readonly allSets = signal<SetRow[]>([]);
  protected readonly setCounts = signal<Map<string, number>>(new Map());
  protected readonly allCardTypes = signal<CardTypeRow[]>([]);
  protected readonly cardTypeCounts = signal<Map<string, number>>(new Map());
  protected readonly loading = signal(true);

  protected readonly selectedSetIds = computed<string[]>(() =>
    parseIdList(this.sets()),
  );
  protected readonly selectedCardTypeIds = computed<string[]>(() =>
    parseIdList(this.types()),
  );

  protected readonly anyFilterActive = computed<boolean>(
    () => this.selectedSetIds().length > 0 || this.selectedCardTypeIds().length > 0,
  );

  protected readonly normalizedSort = computed<SortKey>(() =>
    normalizeSort(this.sort(), false),
  );

  // Page chrome switches between the full catalog grid and the offers grid.
  protected readonly pageTitle = computed(() => (this.onSaleOnly() ? 'Ofertas' : 'Cartas'));
  protected readonly pageLead = computed(() =>
    this.onSaleOnly()
      ? 'Cartas con precio rebajado. Stock limitado — aprovecha antes de que se agoten.'
      : 'Singles auténticas, condición verificada, envío seguro a todo Costa Rica.',
  );
  protected readonly emptyText = computed(() =>
    this.onSaleOnly()
      ? 'No hay ofertas en este momento. Vuelve pronto.'
      : 'Aún no hay cartas en stock. Vuelve pronto.',
  );

  constructor() {
    void this.bootstrapMeta();

    // Refetch whenever the filter selection or sort changes (initial render
    // included).
    effect(() => {
      const setIds = this.selectedSetIds();
      const cardTypeIds = this.selectedCardTypeIds();
      const sort = this.normalizedSort();
      void this.fetchProducts(setIds, cardTypeIds, sort);
    });
  }

  private async bootstrapMeta(): Promise<void> {
    try {
      // Offers mode scopes the facet counts to discounted products via the
      // query-aware count fns (q=''); the full grid uses the cached globals.
      const onSale = this.onSaleOnly();
      const [sets, setCounts, cardTypes, cardTypeCounts] = await Promise.all([
        this.setsService.list(),
        onSale ? this.setsService.countsForQuery('', { onSaleOnly: true }) : this.setsService.counts(),
        this.cardTypesService.list({ activeOnly: true }),
        onSale
          ? this.cardTypesService.countsForQuery('', { onSaleOnly: true })
          : this.cardTypesService.counts(),
      ]);
      this.allSets.set(sets);
      this.setCounts.set(setCounts);
      this.allCardTypes.set(cardTypes);
      this.cardTypeCounts.set(cardTypeCounts);
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    }
  }

  private async fetchProducts(
    setIds: string[],
    cardTypeIds: string[],
    sort: SortKey,
  ): Promise<void> {
    this.loading.set(true);
    try {
      // Route through the search RPC even with q='' so we get one row
      // shape + one filter pipeline shared with /buscar.
      const { rows } = await this.products.search({
        q: '',
        sort,
        pageSize: 60,
        setIds: setIds.length > 0 ? setIds : undefined,
        cardTypeIds: cardTypeIds.length > 0 ? cardTypeIds : undefined,
        onSaleOnly: this.onSaleOnly(),
      });
      this.cards.set(rows);
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
  }

  protected onSortChange(next: SortKey): void {
    void this.router.navigate([this.basePath()], {
      queryParams: { sort: next },
      queryParamsHandling: 'merge',
    });
  }

  protected onSetsChange(ids: string[]): void {
    void this.router.navigate([this.basePath()], {
      queryParams: { sets: ids.length > 0 ? ids.join(',') : null },
      queryParamsHandling: 'merge',
    });
  }

  protected onCardTypesChange(ids: string[]): void {
    void this.router.navigate([this.basePath()], {
      queryParams: { types: ids.length > 0 ? ids.join(',') : null },
      queryParamsHandling: 'merge',
    });
  }

  protected onClearAllFilters(): void {
    void this.router.navigate([this.basePath()], {
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

function parseIdList(raw: string | undefined): string[] {
  const s = (raw ?? '').trim();
  if (!s) return [];
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}
