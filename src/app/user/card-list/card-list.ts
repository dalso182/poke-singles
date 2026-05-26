import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ProductsService } from '../../core/catalog/products.service';
import { SetsService } from '../../core/catalog/sets.service';
import { CardTypesService } from '../../core/catalog/card-types.service';
import { CategoriesService } from '../../core/catalog/categories.service';
import { normalizeSort } from '../../core/catalog/catalog.types';
import type {
  CardTypeRow,
  CategoryRow,
  ProductSearchRow,
  SetRow,
  SortKey,
} from '../../core/catalog/catalog.types';
import { FiltersBar } from '../../shared/filters-bar/filters-bar';
import { SetFilter } from '../../shared/filters-bar/set-filter/set-filter';
import { CardTypeFilter } from '../../shared/filters-bar/card-type-filter/card-type-filter';
import { CategoryFilter } from '../../shared/filters-bar/category-filter/category-filter';
import { SortSelect } from '../../shared/sort-select/sort-select';
import { ProductCard } from '../../shared/product-card/product-card';
import { LoadMore } from '../../shared/load-more/load-more';

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
    CategoryFilter,
    SortSelect,
    ProductCard,
    LoadMore,
  ],
  templateUrl: './card-list.html',
  styleUrl: './card-list.scss',
})
export class CardList {
  // URL-bound via withComponentInputBinding(). Query params:
  /** Comma-separated set ids; parsed into selectedSetIds. */
  readonly sets = input<string | undefined>(undefined);
  /** Comma-separated card-type ids — the Rareza filter on singles/graded. */
  readonly types = input<string | undefined>(undefined);
  /** Comma-separated sub-type slugs (clean URLs) — the sub-type filter on
   *  sealed/accesorios, e.g. `?tipo=booster-box`. Resolved to card-type ids
   *  client-side (see subtypeIdBySlug). */
  readonly tipo = input<string | undefined>(undefined);
  /** URL `sort` param. No query here, so 'relevance' is never offered. */
  readonly sort = input<string>('recent');
  /** `?categoria=` facet selection on the all-products page. Ignored on
   *  dedicated category routes — the route param wins in effectiveCategorySlug. */
  readonly categoria = input<string | undefined>(undefined);
  /** Route-data bound. When true the grid lists only discounted products and
   *  the page presents as /ofertas. Default false = the full /products grid. */
  readonly onSaleOnly = input<boolean>(false);
  /** Route-data bound. Base path for filter/sort navigation. NOTE: can arrive
   *  `undefined` despite the default — see effectiveBasePath's guard. */
  readonly basePath = input<string>('/products');
  /** Route-param bound (from `categoria/:categorySlug`). When set, the grid is
   *  scoped to that category and the page presents as the category page. */
  readonly categorySlug = input<string | undefined>(undefined);

  private readonly products = inject(ProductsService);
  private readonly setsService = inject(SetsService);
  private readonly cardTypesService = inject(CardTypesService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly cards = signal<ProductSearchRow[]>([]);
  /** Current page held in the grid (1-based). In-component only — never a URL
   *  param. The reset effect drops it back to 1; loadMore() bumps it. */
  protected readonly page = signal(1);
  /** True while loadMore() is fetching the next page (drives the button spinner). */
  protected readonly loadingMore = signal(false);
  /** Whether another page might exist — set from `rows.length === PAGE_SIZE`
   *  after each fetch. Drives whether the "Cargar más" button is shown. */
  protected readonly hasMore = signal(false);
  protected readonly allSets = signal<SetRow[]>([]);
  protected readonly setCounts = signal<Map<string, number>>(new Map());
  protected readonly allCardTypes = signal<CardTypeRow[]>([]);
  protected readonly cardTypeCounts = signal<Map<string, number>>(new Map());
  protected readonly categories = signal<CategoryRow[]>([]);
  protected readonly categoryCounts = signal<Map<string, number>>(new Map());
  protected readonly loading = signal(true);

  /** Active category: the route param (category page) wins; otherwise the
   *  `?categoria=` facet selection on the all-products page. Drives the grid,
   *  the scoped facet counts, and which filters are shown. */
  protected readonly effectiveCategorySlug = computed<string | undefined>(
    () => this.categorySlug() ?? this.categoria(),
  );

  /** Rareza (card-type variants) only makes sense for singles/graded. */
  protected readonly showRareza = computed<boolean>(() => {
    const slug = this.effectiveCategorySlug();
    return slug === 'singles' || slug === 'graded';
  });

  /** Resolve the active category slug to its id (for scoping card types). */
  protected readonly effectiveCategoryId = computed<string | null>(() => {
    const slug = this.effectiveCategorySlug();
    return slug ? this.categories().find((c) => c.slug === slug)?.id ?? null : null;
  });
  /** Global Rareza tags (category_id NULL) — singles/graded. */
  protected readonly globalCardTypes = computed<CardTypeRow[]>(() =>
    this.allCardTypes().filter((t) => t.category_id === null),
  );
  /** Sub-types scoped to the active category — sealed/accessories. */
  protected readonly subtypeCardTypes = computed<CardTypeRow[]>(() => {
    const id = this.effectiveCategoryId();
    return id ? this.allCardTypes().filter((t) => t.category_id === id) : [];
  });
  /** Clean URL slug ↔ card-type id, within the active category. The clean slug
   *  is the card_type slug minus its category prefix (`sellado-booster-box` →
   *  `booster-box`). Used so the nav children + filter use `?tipo=booster-box`. */
  private readonly subtypeIdBySlug = computed<Map<string, string>>(
    () => new Map(this.subtypeCardTypes().map((t) => [subtypeSlug(t.slug), t.id])),
  );
  private readonly subtypeSlugById = computed<Map<string, string>>(
    () => new Map(this.subtypeCardTypes().map((t) => [t.id, subtypeSlug(t.slug)])),
  );
  /** Sealed/accessories use a sub-type filter (same multi-select facet as Rareza,
   *  scoped to that category's sub-types). */
  protected readonly showSubtypeFilter = computed<boolean>(() => {
    const slug = this.effectiveCategorySlug();
    return (slug === 'sellado' || slug === 'accesorios') && this.subtypeCardTypes().length > 0;
  });
  /** One card-type facet drives both: Rareza for singles/graded, sub-types for
   *  sealed/accessories (they never show together). */
  protected readonly showCardTypeFilter = computed<boolean>(
    () => this.showRareza() || this.showSubtypeFilter(),
  );
  protected readonly cardTypeFilterTypes = computed<CardTypeRow[]>(() =>
    this.showRareza() ? this.globalCardTypes() : this.subtypeCardTypes(),
  );
  protected readonly cardTypeFilterLabel = computed<string>(() =>
    this.showRareza() ? 'Rareza' : 'Tipo',
  );

  /** The Categoría facet appears only on the all-products page. */
  protected readonly showCategoryFilter = computed<boolean>(
    () => !this.categorySlug() && !this.onSaleOnly(),
  );

  /** Active categories for the facet (rifas has its own /rifas page). */
  protected readonly categoriesForFilter = computed<CategoryRow[]>(() =>
    this.categories().filter((c) => c.slug !== 'rifas'),
  );

  /** Display name for the active category (falls back to the raw slug until
   *  the categories list has loaded). Empty when not on a category page. */
  protected readonly categoryName = computed<string>(() => {
    const slug = this.categorySlug();
    if (!slug) return '';
    return this.categories().find((c) => c.slug === slug)?.name ?? slug;
  });

  /** Where filter/sort navigation lands: the category page when scoped,
   *  otherwise the route-data basePath (/products or /ofertas).
   *  NOTE: `basePath()` can be `undefined` even though the input declares a
   *  default — withComponentInputBinding() overrides the default with undefined
   *  on routes (like /products) that don't supply `basePath` in their data. The
   *  `?? '/products'` guard prevents navigate(['undefined', …]) → NG04008, which
   *  was silently breaking every filter on /products. */
  protected readonly effectiveBasePath = computed<string>(() =>
    this.categorySlug() ? '/categoria/' + this.categorySlug() : (this.basePath() ?? '/products'),
  );

  protected readonly selectedSetIds = computed<string[]>(() =>
    parseIdList(this.sets()),
  );
  /** The active card-type selection as ids. On sealed/accesorios it resolves the
   *  `?tipo=` clean slugs; elsewhere it reads `?types=` ids (Rareza). The grid +
   *  search always work in ids. */
  protected readonly selectedCardTypeIds = computed<string[]>(() => {
    if (this.showSubtypeFilter()) {
      const map = this.subtypeIdBySlug();
      return parseIdList(this.tipo())
        .map((slug) => map.get(slug))
        .filter((id): id is string => !!id);
    }
    return parseIdList(this.types());
  });

  protected readonly anyFilterActive = computed<boolean>(
    () =>
      this.selectedSetIds().length > 0 ||
      (this.showCardTypeFilter() && this.selectedCardTypeIds().length > 0) ||
      (this.showCategoryFilter() && !!this.categoria()),
  );

  protected readonly normalizedSort = computed<SortKey>(() =>
    normalizeSort(this.sort(), false),
  );

  // Page chrome switches between the full catalog, a category page, and offers.
  protected readonly pageTitle = computed(() => {
    if (this.categorySlug()) return this.categoryName();
    if (this.onSaleOnly()) return 'Ofertas';
    return 'Productos';
  });
  protected readonly pageLead = computed(() =>
    this.onSaleOnly()
      ? 'Productos con precio rebajado. Stock limitado — aprovecha antes de que se agoten.'
      : 'Productos auténticos, condición verificada, envío seguro a todo Costa Rica.',
  );
  protected readonly emptyText = computed(() => {
    if (this.categorySlug()) return 'No hay productos en esta categoría todavía.';
    if (this.onSaleOnly()) return 'No hay ofertas en este momento. Vuelve pronto.';
    return 'Aún no hay productos en stock. Vuelve pronto.';
  });

  constructor() {
    // Input-independent lists + the (q='') category facet counts: load once.
    void this.loadLists();

    // Facet counts must react to the scope (category + on-sale). The route
    // param / data inputs aren't bound yet in the constructor, so this has to
    // run in an effect rather than a one-shot — otherwise the counts fall back
    // to the global cached values (the bug that showed singles counts on a
    // sealed-category page).
    effect(() => {
      const onSaleOnly = this.onSaleOnly();
      const categorySlug = this.effectiveCategorySlug();
      void this.loadScopedCounts(onSaleOnly, categorySlug);
    });

    // Refetch the grid whenever the selection, sort, or scope changes.
    effect(() => {
      const setIds = this.selectedSetIds();
      // Apply the `types` selection only where a card-type filter is shown
      // (Rareza for singles/graded, sub-types for sealed/accessories).
      const cardTypeIds = this.showCardTypeFilter() ? this.selectedCardTypeIds() : [];
      const sort = this.normalizedSort();
      const onSaleOnly = this.onSaleOnly();
      const categorySlug = this.effectiveCategorySlug();
      void this.fetchProducts({ setIds, cardTypeIds, sort, onSaleOnly, categorySlug });
    });
  }

  /** Filter chrome that doesn't depend on the route scope: the full set /
   *  card-type lists, the category list, and the per-category facet counts. */
  private async loadLists(): Promise<void> {
    try {
      const [categories, sets, cardTypes, categoryCounts] = await Promise.all([
        this.categoriesService.list({ activeOnly: true }),
        this.setsService.list(),
        this.cardTypesService.list({ activeOnly: true }),
        this.categoriesService.countsForQuery('', {}),
      ]);
      this.categories.set(categories);
      this.allSets.set(sets);
      this.allCardTypes.set(cardTypes);
      this.categoryCounts.set(categoryCounts);
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    }
  }

  /** Set / card-type facet counts scoped to the current category + on-sale
   *  view. The unscoped all-products view uses the cached global counts. */
  private async loadScopedCounts(
    onSaleOnly: boolean,
    categorySlug: string | undefined,
  ): Promise<void> {
    try {
      const scoped = onSaleOnly || !!categorySlug;
      const [setCounts, cardTypeCounts] = await Promise.all([
        scoped
          ? this.setsService.countsForQuery('', { onSaleOnly, categorySlug })
          : this.setsService.counts(),
        scoped
          ? this.cardTypesService.countsForQuery('', { onSaleOnly, categorySlug })
          : this.cardTypesService.counts(),
      ]);
      this.setCounts.set(setCounts);
      this.cardTypeCounts.set(cardTypeCounts);
    } catch {
      // Leave the previous counts in place on a transient failure.
    }
  }

  private async fetchProducts(opts: {
    setIds: string[];
    cardTypeIds: string[];
    sort: SortKey;
    onSaleOnly: boolean;
    categorySlug: string | undefined;
  }): Promise<void> {
    this.loading.set(true);
    try {
      // Route through the search RPC even with q='' so we get one row
      // shape + one filter pipeline shared with /buscar.
      const { rows } = await this.products.search({
        q: '',
        sort: opts.sort,
        pageSize: PAGE_SIZE,
        setIds: opts.setIds.length > 0 ? opts.setIds : undefined,
        cardTypeIds: opts.cardTypeIds.length > 0 ? opts.cardTypeIds : undefined,
        onSaleOnly: opts.onSaleOnly,
        categorySlug: opts.categorySlug,
      });
      this.cards.set(rows);
      this.page.set(1);
      this.hasMore.set(rows.length === PAGE_SIZE);
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
  }

  /** Fetch the next page and append it to the grid. The reset effect owns
   *  page 1 + filter changes; this only ever grows the current result set. */
  protected async loadMore(): Promise<void> {
    if (this.loadingMore() || this.loading() || !this.hasMore()) return;
    const next = this.page() + 1;
    this.loadingMore.set(true);
    try {
      const setIds = this.selectedSetIds();
      const cardTypeIds = this.showCardTypeFilter() ? this.selectedCardTypeIds() : [];
      const { rows } = await this.products.search({
        q: '',
        sort: this.normalizedSort(),
        pageSize: PAGE_SIZE,
        page: next,
        setIds: setIds.length > 0 ? setIds : undefined,
        cardTypeIds: cardTypeIds.length > 0 ? cardTypeIds : undefined,
        onSaleOnly: this.onSaleOnly(),
        categorySlug: this.effectiveCategorySlug(),
      });
      // Stale-append guard: if a filter/sort change fired the reset effect while
      // this fetch was in flight, page() is back to 1 and these rows are stale —
      // drop them rather than appending onto the fresh page-1 grid.
      if (this.page() + 1 === next) {
        this.cards.update((prev) => [...prev, ...rows]);
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
    void this.router.navigate([this.effectiveBasePath()], {
      queryParams: { sort: next },
      queryParamsHandling: 'merge',
    });
  }

  protected onSetsChange(ids: string[]): void {
    void this.router.navigate([this.effectiveBasePath()], {
      queryParams: { sets: ids.length > 0 ? ids.join(',') : null },
      queryParamsHandling: 'merge',
    });
  }

  protected onCardTypesChange(ids: string[]): void {
    // Sealed/accesorios write clean `?tipo=` slugs; singles/graded write `?types=` ids.
    if (this.showSubtypeFilter()) {
      const map = this.subtypeSlugById();
      const slugs = ids.map((id) => map.get(id)).filter((s): s is string => !!s);
      void this.router.navigate([this.effectiveBasePath()], {
        queryParams: { tipo: slugs.length > 0 ? slugs.join(',') : null },
        queryParamsHandling: 'merge',
      });
      return;
    }
    void this.router.navigate([this.effectiveBasePath()], {
      queryParams: { types: ids.length > 0 ? ids.join(',') : null },
      queryParamsHandling: 'merge',
    });
  }

  protected onCategoryChange(slug: string | null): void {
    // Switching category invalidates both card-type filters (they're scoped).
    void this.router.navigate([this.effectiveBasePath()], {
      queryParams: { categoria: slug, types: null, tipo: null },
      queryParamsHandling: 'merge',
    });
  }

  protected onClearAllFilters(): void {
    void this.router.navigate([this.effectiveBasePath()], {
      queryParams: { sets: null, types: null, tipo: null, categoria: null },
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
 *  a short page is the end. Keep in sync with SearchResults. */
const PAGE_SIZE = 60;

function parseIdList(raw: string | undefined): string[] {
  const s = (raw ?? '').trim();
  if (!s) return [];
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

/** Clean URL slug for a sub-type: the card_type slug without its category
 *  prefix (`sellado-booster-box` → `booster-box`, `acc-protectores` →
 *  `protectores`). Admin seeds/creates sub-type slugs prefixed, so the first
 *  dash-segment is always the category prefix. */
function subtypeSlug(slug: string): string {
  const dash = slug.indexOf('-');
  return dash === -1 ? slug : slug.slice(dash + 1);
}
