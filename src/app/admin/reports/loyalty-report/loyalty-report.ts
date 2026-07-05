import { Component, effect, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { ReportsService } from '../../../core/reports/reports.service';
import type {
  LoyaltyReportParams,
  LoyaltyReportRow,
  LoyaltyTransactionKind,
} from '../../../core/catalog/catalog.types';
import { FilterBar } from '../../../shared/table/filter-bar/filter-bar';
import { TableCard } from '../../../shared/table/table-card/table-card';
import { SearchInput } from '../../../shared/table/controls/search-input/search-input';
import { DateRange } from '../../../shared/table/controls/date-range/date-range';
import {
  Dropdown,
  type DropdownOption,
} from '../../../shared/table/controls/outlined-dropdown/outlined-dropdown';
import { PaginationFooter } from '../../../shared/table/pagination-footer/pagination-footer';

type SortKey = NonNullable<LoyaltyReportParams['sort']>;

/** "Puntos" report: every loyalty-points ledger entry (earned / reversed), with
 *  customer + source-order context, customer search + date-range filters. */
@Component({
  selector: 'app-loyalty-report',
  imports: [
    DatePipe,
    DecimalPipe,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTableModule,
    FilterBar,
    TableCard,
    SearchInput,
    DateRange,
    Dropdown,
    PaginationFooter,
  ],
  templateUrl: './loyalty-report.html',
  styleUrl: './loyalty-report.scss',
})
export class LoyaltyReport {
  private readonly reports = inject(ReportsService);
  private readonly snack = inject(MatSnackBar);

  protected readonly searchText = signal('');
  protected readonly dateStart = signal<string | null>(null);
  protected readonly dateEnd = signal<string | null>(null);
  protected readonly sort = signal<SortKey>('created');

  protected readonly rows = signal<LoyaltyReportRow[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(50);
  protected readonly loading = signal(false);

  protected readonly displayedColumns = [
    'created',
    'customer',
    'email',
    'kind',
    'amount',
    'order',
  ];

  protected readonly sortOptions: readonly DropdownOption[] = [
    { value: 'created', label: 'Más recientes' },
    { value: 'amount', label: 'Mayor cantidad' },
  ];

  private readonly searchValue = toSignal(
    toObservable(this.searchText).pipe(debounceTime(250), distinctUntilChanged()),
    { initialValue: '' },
  );

  constructor() {
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
      const result = await this.reports.listLoyaltyTransactions({
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

  protected kindLabel(kind: LoyaltyTransactionKind): string {
    switch (kind) {
      case 'earn':     return 'Ganados';
      case 'reversal': return 'Revertidos';
      case 'adjust':   return 'Ajuste';
      case 'redeem':   return 'Canjeados';
    }
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
