import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ProductsService } from '../../core/catalog/products.service';
import { SetsService } from '../../core/catalog/sets.service';
import { CardTypesService } from '../../core/catalog/card-types.service';
import type {
  CardTypeRow,
  ProductSearchRow,
  SetRow,
} from '../../core/catalog/catalog.types';
import { FiltersBar } from '../../shared/filters-bar/filters-bar';
import { SetFilter } from '../../shared/filters-bar/set-filter/set-filter';
import { CardTypeFilter } from '../../shared/filters-bar/card-type-filter/card-type-filter';
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

  constructor() {
    void this.bootstrapMeta();

    // Refetch whenever either filter selection changes (initial render
    // included).
    effect(() => {
      const setIds = this.selectedSetIds();
      const cardTypeIds = this.selectedCardTypeIds();
      void this.fetchProducts(setIds, cardTypeIds);
    });
  }

  private async bootstrapMeta(): Promise<void> {
    try {
      const [sets, setCounts, cardTypes, cardTypeCounts] = await Promise.all([
        this.setsService.list(),
        this.setsService.counts(),
        this.cardTypesService.list({ activeOnly: true }),
        this.cardTypesService.counts(),
      ]);
      this.allSets.set(sets);
      this.setCounts.set(setCounts);
      this.allCardTypes.set(cardTypes);
      this.cardTypeCounts.set(cardTypeCounts);
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    }
  }

  private async fetchProducts(setIds: string[], cardTypeIds: string[]): Promise<void> {
    this.loading.set(true);
    try {
      // Route through the search RPC even with q='' so we get one row
      // shape + one filter pipeline shared with /buscar.
      const { rows } = await this.products.search({
        q: '',
        sort: 'recent',
        pageSize: 60,
        setIds: setIds.length > 0 ? setIds : undefined,
        cardTypeIds: cardTypeIds.length > 0 ? cardTypeIds : undefined,
      });
      this.cards.set(rows);
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
  }

  protected onSetsChange(ids: string[]): void {
    void this.router.navigate(['/products'], {
      queryParams: { sets: ids.length > 0 ? ids.join(',') : null },
      queryParamsHandling: 'merge',
    });
  }

  protected onCardTypesChange(ids: string[]): void {
    void this.router.navigate(['/products'], {
      queryParams: { types: ids.length > 0 ? ids.join(',') : null },
      queryParamsHandling: 'merge',
    });
  }

  protected onClearAllFilters(): void {
    void this.router.navigate(['/products'], {
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
