import { Component, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, debounceTime, distinctUntilChanged } from 'rxjs';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { ReportsService } from '../../../core/reports/reports.service';
import type {
  CustomerSearchRow,
  SearchCustomerType,
} from '../../../core/catalog/catalog.types';
import { FilterBar } from '../../../shared/table/filter-bar/filter-bar';
import { TableCard } from '../../../shared/table/table-card/table-card';
import { SearchInput } from '../../../shared/table/controls/search-input/search-input';
import { DateRange } from '../../../shared/table/controls/date-range/date-range';
import { PillTabs, type TabItem } from '../../../shared/table/tabs/pill-tabs/pill-tabs';
import { PaginationFooter } from '../../../shared/table/pagination-footer/pagination-footer';

/** "Búsquedas" report: every committed storefront search term with its match
 *  count, customer (registered or guest), and IP. Filterable by customer type,
 *  keyword, customer, date range, and IP. */
@Component({
  selector: 'app-customer-searches-report',
  imports: [
    DatePipe,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTableModule,
    FilterBar,
    TableCard,
    SearchInput,
    DateRange,
    PillTabs,
    PaginationFooter,
  ],
  templateUrl: './customer-searches-report.html',
  styleUrl: './customer-searches-report.scss',
})
export class CustomerSearchesReport {
  private readonly reports = inject(ReportsService);
  private readonly snack = inject(MatSnackBar);

  protected readonly keywordText = signal('');
  protected readonly searchText = signal('');
  protected readonly ipText = signal('');
  protected readonly dateStart = signal<string | null>(null);
  protected readonly dateEnd = signal<string | null>(null);
  protected readonly customerType = signal<SearchCustomerType>('all');

  protected readonly rows = signal<CustomerSearchRow[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(50);
  protected readonly loading = signal(false);

  protected readonly displayedColumns = ['keyword', 'found', 'customer', 'ip', 'date'];

  protected readonly typeTabs: readonly TabItem[] = [
    { key: 'all', label: 'Todos' },
    { key: 'registered', label: 'Registrados' },
    { key: 'guest', label: 'Invitados' },
  ];

  // Debounce the three free-text filters together; date pickers + type tab fire
  // discretely.
  private readonly debouncedText = toSignal(
    combineLatest([
      toObservable(this.keywordText),
      toObservable(this.searchText),
      toObservable(this.ipText),
    ]).pipe(
      debounceTime(250),
      distinctUntilChanged((a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2]),
    ),
    { initialValue: ['', '', ''] as [string, string, string] },
  );

  constructor() {
    effect(() => {
      this.debouncedText();
      this.dateStart();
      this.dateEnd();
      this.customerType();
      this.page.set(1);
      void this.refresh();
    });
  }

  private async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const [keyword, search, ip] = this.debouncedText();
      const result = await this.reports.listCustomerSearches({
        keyword: keyword || undefined,
        search: search || undefined,
        ip: ip || undefined,
        dateStart: this.dateStart(),
        dateEnd: this.dateEnd(),
        customerType: this.customerType(),
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

  protected customerLabel(row: CustomerSearchRow): string {
    if (!row.user_id) return 'Invitado';
    return row.customer_name || row.customer_email || 'Cliente';
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
