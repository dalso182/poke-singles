import { Component, computed, effect, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { CategoriesService } from '../../core/catalog/categories.service';
import { ProductsService } from '../../core/catalog/products.service';
import { SellersService } from '../../core/catalog/sellers.service';
import { SetsService } from '../../core/catalog/sets.service';
import type {
  CategoryRow,
  ProductListRow,
  ProductRow,
  SellerRow,
  SetRow,
} from '../../core/catalog/catalog.types';
import { PageHeader } from '../../shared/table/page-header/page-header';
import { FilterBar } from '../../shared/table/filter-bar/filter-bar';
import { TableCard } from '../../shared/table/table-card/table-card';
import { SearchInput } from '../../shared/table/controls/search-input/search-input';
import { Dropdown, type DropdownOption } from '../../shared/table/controls/outlined-dropdown/outlined-dropdown';
import { LabeledToggle } from '../../shared/table/controls/labeled-toggle/labeled-toggle';
import { Thumb } from '../../shared/table/cells/thumb-cell/thumb-cell';
import { Pill } from '../../shared/table/cells/pill/pill';
import { Money } from '../../shared/table/cells/money-cell/money-cell';
import { Stock } from '../../shared/table/cells/stock-cell/stock-cell';
import { PlainCheckbox } from '../../shared/table/controls/plain-checkbox/plain-checkbox';
import { ToggleSwitch } from '../../shared/table/controls/toggle-switch/toggle-switch';
import { IconBtn } from '../../shared/table/controls/icon-btn/icon-btn';
import { Btn } from '../../shared/table/controls/btn/btn';
import { PaginationFooter } from '../../shared/table/pagination-footer/pagination-footer';

@Component({
  selector: 'app-admin-products-list',
  imports: [
    MatIconModule,
    MatProgressBarModule,
    MatTableModule,
    PageHeader,
    FilterBar,
    TableCard,
    SearchInput,
    Dropdown,
    LabeledToggle,
    Thumb,
    Pill,
    Money,
    Stock,
    PlainCheckbox,
    ToggleSwitch,
    IconBtn,
    Btn,
    PaginationFooter,
  ],
  templateUrl: './products-list.html',
  styleUrl: './products-list.scss',
})
export class ProductsList {
  private readonly products = inject(ProductsService);
  private readonly categories = inject(CategoriesService);
  private readonly sellersService = inject(SellersService);
  private readonly sets = inject(SetsService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  // Filter state (signals; search is debounced before it hits the server).
  protected readonly searchText = signal('');
  protected readonly category = signal('');
  protected readonly setId = signal('');
  /** '' = todas, 'none' = house only (seller_id IS NULL), uuid = that seller. */
  protected readonly seller = signal('');
  protected readonly includeInactive = signal(false);
  protected readonly featuredOnly = signal(false);

  protected readonly categoriesList = signal<CategoryRow[]>([]);
  protected readonly sellersList = signal<SellerRow[]>([]);
  protected readonly setsList = signal<SetRow[]>([]);
  private readonly setsById = computed(() => {
    const map = new Map<string, SetRow>();
    for (const s of this.setsList()) map.set(s.id, s);
    return map;
  });

  protected readonly categoryOptions = computed<DropdownOption[]>(() => [
    { value: '', label: 'Todas' },
    ...this.categoriesList().map((c) => ({ value: c.id, label: c.name })),
  ]);
  protected readonly setOptions = computed<DropdownOption[]>(() => [
    { value: '', label: 'Todos' },
    ...this.setsList().map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` })),
  ]);
  protected readonly sellerOptions = computed<DropdownOption[]>(() => [
    { value: '', label: 'Todos' },
    { value: 'none', label: 'Poke-Singles (sin vendedor)' },
    ...this.sellersList().map((s) => ({ value: s.id, label: `${s.name} (${s.code})` })),
  ]);

  protected readonly rows = signal<ProductListRow[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(25);
  protected readonly loading = signal(false);
  protected readonly displayedColumns = [
    'image',
    'name',
    'set',
    'condition',
    'language',
    'price',
    'quantity',
    'restocked',
    'featured',
    'active',
    'actions',
  ];

  private readonly searchValue = toSignal(
    toObservable(this.searchText).pipe(debounceTime(250), distinctUntilChanged()),
    { initialValue: '' },
  );

  constructor() {
    this.bootstrap();
    // Re-fetch when filters change; reset to page 1 on filter change.
    let firstRun = true;
    effect(() => {
      this.searchValue();
      this.category();
      this.setId();
      this.seller();
      this.includeInactive();
      this.featuredOnly();
      if (firstRun) {
        firstRun = false;
        return;
      }
      this.page.set(1);
      this.refresh();
    });
  }

  private async bootstrap(): Promise<void> {
    try {
      const [cats, sets, sellers] = await Promise.all([
        this.categories.list(),
        this.sets.list(),
        this.sellersService.list(),
      ]);
      this.categoriesList.set(cats);
      this.setsList.set(sets);
      this.sellersList.set(sellers);
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    }
    await this.refresh();
  }

  protected async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.products.list({
        search: this.searchValue() || undefined,
        categoryId: this.category() || undefined,
        setId: this.setId() || undefined,
        sellerId:
          this.seller() === '' ? undefined : this.seller() === 'none' ? null : this.seller(),
        includeInactive: this.includeInactive(),
        featured: this.featuredOnly() || undefined,
        page: this.page(),
        pageSize: this.pageSize(),
      });
      this.rows.set(result.rows);
      this.total.set(result.total);
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
  }

  protected onPage(page: number): void {
    this.page.set(page);
    this.refresh();
  }

  protected onPerPage(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
    this.refresh();
  }

  protected async onToggleActive(row: ProductRow, active: boolean): Promise<void> {
    try {
      await this.products.setActive(row.id, active);
      const ref = this.snack.open(
        active ? 'Producto reactivado' : 'Producto desactivado',
        'Deshacer',
        { duration: 5000 },
      );
      ref.onAction().subscribe(() => {
        this.products.setActive(row.id, !active).then(() => this.refresh());
      });
      await this.refresh();
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    }
  }

  protected async onToggleFeatured(row: ProductRow, featured: boolean): Promise<void> {
    try {
      await this.products.setFeatured(row.id, featured);
      const ref = this.snack.open(
        featured ? 'Producto destacado' : 'Destacado quitado',
        'Deshacer',
        { duration: 5000 },
      );
      ref.onAction().subscribe(() => {
        this.products.setFeatured(row.id, !featured).then(() => this.refresh());
      });
      await this.refresh();
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    }
  }

  protected setLabel(setId: string | null): string {
    if (!setId) return '—';
    return this.setsById().get(setId)?.code ?? '—';
  }

  /** When discounted, the sale price is what the cell shows (amber). */
  protected isSale(row: ProductRow): boolean {
    return row.sale_price != null && row.sale_price < row.price;
  }
  protected priceValue(row: ProductRow): number {
    return this.isSale(row) ? row.sale_price! : row.price;
  }
  protected priceOriginal(row: ProductRow): number | null {
    return this.isSale(row) ? row.price : null;
  }

  protected formatRestocked(value: string | null): string {
    if (!value) return '—';
    const date = new Date(value);
    const days = Math.floor((Date.now() - date.getTime()) / 86400000);
    if (days === 0) return 'Hoy';
    if (days === 1) return 'Ayer';
    if (days < 30) return `hace ${days} d`;
    if (days < 365) return `hace ${Math.floor(days / 30)} m`;
    return `hace ${Math.floor(days / 365)} a`;
  }

  protected goToNew(): void {
    this.router.navigate(['/admin/products/new']);
  }

  protected goToEdit(id: string): void {
    this.router.navigate(['/admin/products', id, 'edit']);
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
