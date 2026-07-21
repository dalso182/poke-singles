import { Component, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { Router } from '@angular/router';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { CustomersService } from '../../core/customers/customers.service';
import type { CustomerRow } from '../../core/catalog/catalog.types';
import { PageHeader } from '../../shared/table/page-header/page-header';
import { FilterBar } from '../../shared/table/filter-bar/filter-bar';
import { TableCard } from '../../shared/table/table-card/table-card';
import { SearchInput } from '../../shared/table/controls/search-input/search-input';
import { Money } from '../../shared/table/cells/money-cell/money-cell';
import { Pill } from '../../shared/table/cells/pill/pill';
import { Btn } from '../../shared/table/controls/btn/btn';
import { PaginationFooter } from '../../shared/table/pagination-footer/pagination-footer';

@Component({
  selector: 'app-admin-customers',
  imports: [
    DatePipe,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTableModule,
    PageHeader,
    FilterBar,
    TableCard,
    SearchInput,
    Money,
    Pill,
    Btn,
    PaginationFooter,
  ],
  templateUrl: './customers.html',
  styleUrl: './customers.scss',
})
export class Customers {
  private readonly customers = inject(CustomersService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly searchText = signal('');

  protected readonly rows = signal<CustomerRow[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(25);
  protected readonly loading = signal(false);

  protected readonly displayedColumns = ['customer', 'phone', 'orders', 'spent', 'last', 'actions'];

  private readonly searchValue = toSignal(
    toObservable(this.searchText).pipe(debounceTime(250), distinctUntilChanged()),
    { initialValue: '' },
  );

  constructor() {
    // Reset to page 1 whenever the search changes, then refresh.
    effect(() => {
      this.searchValue();
      this.page.set(1);
      void this.refresh();
    });
  }

  private async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.customers.listCustomers({
        search: this.searchValue() || undefined,
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

  /** Quick auctions-ban toggle from the row, with the snackbar-undo idiom
   *  (mirrors products-list.onToggleActive). Reason-less here — the detail
   *  screen offers an optional reason. */
  protected async onToggleBan(row: CustomerRow): Promise<void> {
    const banning = row.auction_banned_at === null;
    const name = row.full_name || row.email;
    const question = banning
      ? `¿Vetar a ${name} de las subastas? No podrá pujar hasta que se restaure.`
      : `¿Restaurar a ${name}? Podrá volver a pujar en subastas.`;
    if (!confirm(question)) return;
    try {
      await this.customers.setAuctionBan(row.id, banning);
      const ref = this.snack.open(
        banning ? 'Cliente vetado de subastas' : 'Veto de subastas removido',
        'Deshacer',
        { duration: 5000 },
      );
      ref.onAction().subscribe(() => {
        this.customers.setAuctionBan(row.id, !banning).then(() => this.refresh());
      });
      await this.refresh();
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    }
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
