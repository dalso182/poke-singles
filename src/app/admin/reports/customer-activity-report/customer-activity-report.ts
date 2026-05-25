import { Component, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, debounceTime, distinctUntilChanged } from 'rxjs';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { ReportsService } from '../../../core/reports/reports.service';
import type { CustomerActivityRow } from '../../../core/catalog/catalog.types';
import { FilterBar } from '../../../shared/table/filter-bar/filter-bar';
import { TableCard } from '../../../shared/table/table-card/table-card';
import { SearchInput } from '../../../shared/table/controls/search-input/search-input';
import { DateRange } from '../../../shared/table/controls/date-range/date-range';
import { PaginationFooter } from '../../../shared/table/pagination-footer/pagination-footer';

/** "Actividad de clientes" report: a chronological feed of login / order /
 *  registration events with IP, filterable by customer, date range, and IP. */
@Component({
  selector: 'app-customer-activity-report',
  imports: [
    DatePipe,
    RouterLink,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTableModule,
    FilterBar,
    TableCard,
    SearchInput,
    DateRange,
    PaginationFooter,
  ],
  templateUrl: './customer-activity-report.html',
  styleUrl: './customer-activity-report.scss',
})
export class CustomerActivityReport {
  private readonly reports = inject(ReportsService);
  private readonly snack = inject(MatSnackBar);

  protected readonly searchText = signal('');
  protected readonly ipText = signal('');
  protected readonly dateStart = signal<string | null>(null);
  protected readonly dateEnd = signal<string | null>(null);

  protected readonly rows = signal<CustomerActivityRow[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(50);
  protected readonly loading = signal(false);

  protected readonly displayedColumns = ['comment', 'ip', 'date'];

  // Debounce the two free-text filters together; date pickers fire discretely.
  private readonly debouncedText = toSignal(
    combineLatest([toObservable(this.searchText), toObservable(this.ipText)]).pipe(
      debounceTime(250),
      distinctUntilChanged(
        (a, b) => a[0] === b[0] && a[1] === b[1],
      ),
    ),
    { initialValue: ['', ''] as [string, string] },
  );

  constructor() {
    effect(() => {
      this.debouncedText();
      this.dateStart();
      this.dateEnd();
      this.page.set(1);
      void this.refresh();
    });
  }

  private async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const [search, ip] = this.debouncedText();
      const result = await this.reports.listCustomerActivity({
        search: search || undefined,
        ip: ip || undefined,
        dateStart: this.dateStart(),
        dateEnd: this.dateEnd(),
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

  protected displayName(row: CustomerActivityRow): string {
    return row.customer_name || row.customer_email || 'Cliente';
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
