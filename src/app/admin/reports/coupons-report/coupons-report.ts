import { Component, effect, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { Router } from '@angular/router';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { ReportsService } from '../../../core/reports/reports.service';
import type { CouponReportParams, CouponReportRow } from '../../../core/catalog/catalog.types';
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

type SortKey = NonNullable<CouponReportParams['sort']>;

/** "Cupones" report: per-coupon usage — # orders, total discount given, and
 *  total order revenue — with code/name search + date-range filters. */
@Component({
  selector: 'app-coupons-report',
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
  templateUrl: './coupons-report.html',
  styleUrl: './coupons-report.scss',
})
export class CouponsReport {
  private readonly reports = inject(ReportsService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly searchText = signal('');
  protected readonly dateStart = signal<string | null>(null);
  protected readonly dateEnd = signal<string | null>(null);
  protected readonly sort = signal<SortKey>('discount');

  protected readonly rows = signal<CouponReportRow[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(50);
  protected readonly loading = signal(false);

  protected readonly displayedColumns = ['name', 'code', 'orders', 'discount', 'revenue', 'actions'];

  protected readonly sortOptions: readonly DropdownOption[] = [
    { value: 'discount', label: 'Mayor descuento' },
    { value: 'revenue', label: 'Mayores ingresos' },
    { value: 'orders', label: 'Más pedidos' },
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
      const result = await this.reports.listCoupons({
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

  protected goToEdit(id: string): void {
    this.router.navigate(['/admin/coupons', id, 'edit']);
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
