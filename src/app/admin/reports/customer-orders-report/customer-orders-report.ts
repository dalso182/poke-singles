import { Component, effect, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { Router } from '@angular/router';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { ReportsService } from '../../../core/reports/reports.service';
import type {
  CustomerOrdersReportParams,
  CustomerOrdersReportRow,
} from '../../../core/catalog/catalog.types';
import { FilterBar } from '../../../shared/table/filter-bar/filter-bar';
import { TableCard } from '../../../shared/table/table-card/table-card';
import { SearchInput } from '../../../shared/table/controls/search-input/search-input';
import { DateRange } from '../../../shared/table/controls/date-range/date-range';
import {
  Dropdown,
  type DropdownOption,
} from '../../../shared/table/controls/outlined-dropdown/outlined-dropdown';
import { Money } from '../../../shared/table/cells/money-cell/money-cell';
import { Btn } from '../../../shared/table/controls/btn/btn';
import { PaginationFooter } from '../../../shared/table/pagination-footer/pagination-footer';

type SortKey = NonNullable<CustomerOrdersReportParams['sort']>;

/** "Pedidos por cliente" report: per-customer order totals, with customer
 *  search + date-range filters, sorted by spend / count / signup. */
@Component({
  selector: 'app-customer-orders-report',
  imports: [
    MatProgressBarModule,
    MatSnackBarModule,
    MatTableModule,
    FilterBar,
    TableCard,
    SearchInput,
    DateRange,
    Dropdown,
    Money,
    Btn,
    PaginationFooter,
  ],
  templateUrl: './customer-orders-report.html',
  styleUrl: './customer-orders-report.scss',
})
export class CustomerOrdersReport {
  private readonly reports = inject(ReportsService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly searchText = signal('');
  protected readonly dateStart = signal<string | null>(null);
  protected readonly dateEnd = signal<string | null>(null);
  protected readonly sort = signal<SortKey>('total');

  protected readonly rows = signal<CustomerOrdersReportRow[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(25);
  protected readonly loading = signal(false);

  protected readonly displayedColumns = ['customer', 'email', 'orders', 'products', 'total', 'actions'];

  protected readonly sortOptions: readonly DropdownOption[] = [
    { value: 'total', label: 'Mayor gasto' },
    { value: 'orders', label: 'Más pedidos' },
    { value: 'created', label: 'Más recientes' },
  ];

  private readonly searchValue = toSignal(
    toObservable(this.searchText).pipe(debounceTime(250), distinctUntilChanged()),
    { initialValue: '' },
  );

  constructor() {
    // Any filter change resets to page 1, then refreshes.
    effect(() => {
      this.searchValue();
      this.dateStart();
      this.dateEnd();
      this.sort();
      this.page.set(1);
      void this.refresh();
    });
  }

  private async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.reports.listCustomerOrders({
        search: this.searchValue() || undefined,
        dateStart: this.dateStart(),
        dateEnd: this.dateEnd(),
        sort: this.sort(),
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
    void this.refresh();
  }

  protected onPerPage(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
    void this.refresh();
  }

  protected goToView(id: string): void {
    this.router.navigate(['/admin/customers', id]);
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
