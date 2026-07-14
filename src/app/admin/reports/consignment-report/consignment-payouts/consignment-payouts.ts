import { Component, computed, effect, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { SellerPayoutsService } from '../../../../core/catalog/seller-payouts.service';
import { SellersService } from '../../../../core/catalog/sellers.service';
import type { SellerPayoutRow, SellerRow } from '../../../../core/catalog/catalog.types';
import { FilterBar } from '../../../../shared/table/filter-bar/filter-bar';
import { TableCard } from '../../../../shared/table/table-card/table-card';
import {
  Dropdown,
  type DropdownOption,
} from '../../../../shared/table/controls/outlined-dropdown/outlined-dropdown';
import { Money } from '../../../../shared/table/cells/money-cell/money-cell';
import { Pill } from '../../../../shared/table/cells/pill/pill';
import { Btn } from '../../../../shared/table/controls/btn/btn';
import { PaginationFooter } from '../../../../shared/table/pagination-footer/pagination-footer';

/** Pagos: payout-batch history (the seller_payouts ledger). Each row freezes
 *  the sold/fees/payout breakdown at creation time. Deleting a batch reverts
 *  its items to pending; Deshacer re-creates it from the same items. */
@Component({
  selector: 'app-consignment-payouts',
  imports: [
    DatePipe,
    DecimalPipe,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTableModule,
    FilterBar,
    TableCard,
    Dropdown,
    Money,
    Pill,
    Btn,
    PaginationFooter,
  ],
  templateUrl: './consignment-payouts.html',
  styleUrl: './consignment-payouts.scss',
})
export class ConsignmentPayouts {
  private readonly payouts = inject(SellerPayoutsService);
  private readonly sellersService = inject(SellersService);
  private readonly snack = inject(MatSnackBar);

  protected readonly sellerId = signal('');
  protected readonly rows = signal<SellerPayoutRow[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(25);
  protected readonly loading = signal(false);
  protected readonly sellersList = signal<SellerRow[]>([]);

  protected readonly sellerOptions = computed<DropdownOption[]>(() => [
    { value: '', label: 'Todos' },
    ...this.sellersList().map((s) => ({ value: s.id, label: `${s.name} (${s.code})` })),
  ]);

  protected readonly displayedColumns = [
    'date',
    'seller',
    'items',
    'sold',
    'fees',
    'payout',
    'notes',
    'actions',
  ];

  constructor() {
    void this.loadSellers();
    effect(() => {
      this.sellerId();
      this.page.set(1);
      void this.refresh();
    });
  }

  private async loadSellers(): Promise<void> {
    try {
      this.sellersList.set(await this.sellersService.list());
    } catch {
      // Non-fatal: the dropdown just stays on "Todos".
    }
  }

  private async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.payouts.listPayouts({
        sellerId: this.sellerId() || null,
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

  /** Delete = revert the batch's items to pending. Undo re-creates the batch
   *  from the same item ids (captured before the delete). */
  protected async onDelete(row: SellerPayoutRow): Promise<void> {
    try {
      const ids = await this.payouts.payoutItemIds(row.id);
      await this.payouts.deletePayout(row.id);
      await this.refresh();
      this.snack
        .open(`Pago a ${row.seller_name} eliminado — ítems de vuelta a pendientes`, 'Deshacer', {
          duration: 6000,
        })
        .onAction()
        .subscribe(() => void this.restore(ids, row.notes));
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    }
  }

  private async restore(itemIds: string[], notes: string | null): Promise<void> {
    try {
      await this.payouts.createPayout(itemIds, notes);
    } catch {
      // Legit failure window: an order got cancelled or the items were re-paid.
      this.snack.open('No se pudo restaurar el pago', 'OK', { duration: 5000 });
    }
    await this.refresh();
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
