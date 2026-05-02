import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CategoriesService } from '../../core/catalog/categories.service';
import { ProductsService } from '../../core/catalog/products.service';
import { SetsService } from '../../core/catalog/sets.service';
import type {
  CategoryRow,
  ProductRow,
  SetRow,
} from '../../core/catalog/catalog.types';

@Component({
  selector: 'app-admin-products-list',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatTableModule,
    MatTooltipModule,
  ],
  templateUrl: './products-list.html',
  styleUrl: './products-list.scss',
})
export class ProductsList {
  private readonly products = inject(ProductsService);
  private readonly categories = inject(CategoriesService);
  private readonly sets = inject(SetsService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  protected readonly searchControl = new FormControl('', { nonNullable: true });
  protected readonly categoryControl = new FormControl<string | ''>('', { nonNullable: true });
  protected readonly setControl = new FormControl<string | ''>('', { nonNullable: true });
  protected readonly includeInactiveControl = new FormControl(false, { nonNullable: true });

  protected readonly categoriesList = signal<CategoryRow[]>([]);
  protected readonly setsList = signal<SetRow[]>([]);
  protected readonly setsById = computed(() => {
    const map = new Map<string, SetRow>();
    for (const s of this.setsList()) map.set(s.id, s);
    return map;
  });
  protected readonly categoriesById = computed(() => {
    const map = new Map<string, CategoryRow>();
    for (const c of this.categoriesList()) map.set(c.id, c);
    return map;
  });

  protected readonly rows = signal<ProductRow[]>([]);
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
    'active',
    'actions',
  ];

  private readonly searchValue = toSignal(
    this.searchControl.valueChanges.pipe(debounceTime(250), distinctUntilChanged()),
    { initialValue: '' },
  );
  private readonly categoryValue = toSignal(this.categoryControl.valueChanges, { initialValue: '' });
  private readonly setValue = toSignal(this.setControl.valueChanges, { initialValue: '' });
  private readonly includeInactiveValue = toSignal(this.includeInactiveControl.valueChanges, {
    initialValue: false,
  });

  constructor() {
    this.bootstrap();
    // Re-fetch when filters change. Reset to page 1 on filter change.
    let firstRun = true;
    effect(() => {
      // Touch each filter signal so the effect tracks them.
      this.searchValue();
      this.categoryValue();
      this.setValue();
      this.includeInactiveValue();
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
      const [cats, sets] = await Promise.all([this.categories.list(), this.sets.list()]);
      this.categoriesList.set(cats);
      this.setsList.set(sets);
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
        categoryId: this.categoryValue() || undefined,
        setId: this.setValue() || undefined,
        includeInactive: this.includeInactiveValue(),
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

  protected onPageChange(event: PageEvent): void {
    this.page.set(event.pageIndex + 1);
    this.pageSize.set(event.pageSize);
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

  protected setLabel(setId: string | null): string {
    if (!setId) return '—';
    return this.setsById().get(setId)?.code ?? '—';
  }

  protected formatPrice(price: number): string {
    return new Intl.NumberFormat('es-CR', {
      style: 'currency',
      currency: 'CRC',
      maximumFractionDigits: 0,
    }).format(price);
  }

  protected formatRestocked(value: string | null): string {
    if (!value) return '—';
    const date = new Date(value);
    const diffMs = Date.now() - date.getTime();
    const days = Math.floor(diffMs / 86400000);
    if (days === 0) return 'Hoy';
    if (days === 1) return 'Ayer';
    if (days < 30) return `hace ${days} d`;
    if (days < 365) return `hace ${Math.floor(days / 30)} m`;
    return `hace ${Math.floor(days / 365)} a`;
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
