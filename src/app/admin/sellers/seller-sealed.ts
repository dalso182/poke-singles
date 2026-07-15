import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { SellerPayoutsService } from '../../core/catalog/seller-payouts.service';
import type {
  SealedPayoutItemRow,
  SellerPayoutRow,
  SellerPendingTotal,
} from '../../core/catalog/catalog.types';
import { FilterBar } from '../../shared/table/filter-bar/filter-bar';
import { TableCard } from '../../shared/table/table-card/table-card';
import { BulkBar } from '../../shared/table/bulk-bar/bulk-bar';
import { DateRange } from '../../shared/table/controls/date-range/date-range';
import { LabeledToggle } from '../../shared/table/controls/labeled-toggle/labeled-toggle';
import { PlainCheckbox } from '../../shared/table/controls/plain-checkbox/plain-checkbox';
import { Money } from '../../shared/table/cells/money-cell/money-cell';
import { Pill } from '../../shared/table/cells/pill/pill';
import { Thumb } from '../../shared/table/cells/thumb-cell/thumb-cell';
import { Btn } from '../../shared/table/controls/btn/btn';
import { PaginationFooter } from '../../shared/table/pagination-footer/pagination-footer';
import { PayoutItemsDialog } from './payout-items-dialog';

/** RPC error code → admin-facing Spanish. */
const PAYOUT_ERRORS: Record<string, string> = {
  MIXED_SELLERS: 'Los ítems pertenecen a distintos vendedores.',
  ALREADY_PAID: 'Alguno de los ítems ya fue pagado.',
  ORDER_NOT_REALIZED: 'Alguno de los pedidos ya no está pagado.',
  NOT_SEALED: 'Alguno de los ítems no es producto sellado.',
  NOT_FOUND: 'Alguno de los ítems ya no existe.',
  NO_SELLER: 'Alguno de los ítems no tiene vendedor.',
  NO_ITEMS: 'No hay ítems seleccionados.',
  NOT_ADMIN: 'Sesión sin permisos de administrador.',
};

/** Sellado tab of the seller detail: this seller's sold sealed items with the
 *  fee breakdown (vendido, Cuanto, comisión, pago al vendedor), bulk "Marcar
 *  pagado" (creates a seller_payouts batch), and the "Pagos realizados"
 *  history below. One shared refresh() keeps items, pending header, and
 *  history in sync after every mutation. */
@Component({
  selector: 'app-seller-sealed',
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    MatDialogModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTableModule,
    FilterBar,
    TableCard,
    BulkBar,
    DateRange,
    LabeledToggle,
    PlainCheckbox,
    Money,
    Pill,
    Thumb,
    Btn,
    PaginationFooter,
  ],
  templateUrl: './seller-sealed.html',
  styleUrl: './seller-sealed.scss',
})
export class SellerSealed {
  /** The seller this view is scoped to — fixed by the sellers/:id route. */
  readonly sellerId = input.required<string>();

  private readonly payouts = inject(SellerPayoutsService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  protected readonly pendingOnly = signal(true);
  protected readonly dateStart = signal<string | null>(null);
  protected readonly dateEnd = signal<string | null>(null);

  protected readonly rows = signal<SealedPayoutItemRow[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(50);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);

  private readonly pending = signal<SellerPendingTotal[]>([]);

  /** item_id → payout_amount, so the owed sum survives pagination. */
  protected readonly selected = signal<Map<string, number>>(new Map());
  protected readonly notes = signal('');

  // "Pagos realizados" history (this seller's batches).
  protected readonly payoutRows = signal<SellerPayoutRow[]>([]);
  protected readonly payoutsTotal = signal(0);
  protected readonly payoutsPage = signal(1);
  protected readonly payoutsPageSize = signal(10);

  protected readonly selectedCount = computed(() => this.selected().size);
  protected readonly selectedPayout = computed(() =>
    [...this.selected().values()].reduce((a, b) => a + b, 0),
  );

  /** Selection needs the pending view — paid rows aren't selectable anyway. */
  protected readonly canSelect = computed(() => this.pendingOnly());
  private readonly selectableRows = computed(() =>
    this.rows().filter((r) => r.seller_payout_id === null),
  );
  protected readonly allSelected = computed(() => {
    const sel = this.selected();
    const rows = this.selectableRows();
    return rows.length > 0 && rows.every((r) => sel.has(r.item_id));
  });
  protected readonly someSelected = computed(() => {
    const sel = this.selected();
    return !this.allSelected() && this.selectableRows().some((r) => sel.has(r.item_id));
  });

  /** This seller's pending totals for the header line (null = nothing owed). */
  protected readonly pendingHeader = computed(
    () => this.pending().find((p) => p.seller_id === this.sellerId()) ?? null,
  );

  protected readonly displayedColumns = computed(() => [
    ...(this.canSelect() ? ['select'] : []),
    'order',
    'product',
    'pago',
    'qty',
    'vendido',
    'cuanto',
    'comision',
    'payout',
    'estado',
  ]);

  protected readonly payoutColumns = [
    'date',
    'items',
    'sold',
    'fees',
    'payout',
    'notes',
    'actions',
  ];

  constructor() {
    effect(() => {
      this.sellerId();
      this.pendingOnly();
      this.dateStart();
      this.dateEnd();
      this.selected.set(new Map());
      this.page.set(1);
      this.payoutsPage.set(1);
      void this.refresh();
    });
  }

  private async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const [items, totals, payouts] = await Promise.all([
        this.payouts.listSealedItems({
          sellerId: this.sellerId(),
          pendingOnly: this.pendingOnly(),
          dateStart: this.dateStart(),
          dateEnd: this.dateEnd(),
          page: this.page(),
          pageSize: this.pageSize(),
        }),
        this.payouts.sealedPendingTotals(),
        this.payouts.listPayouts({
          sellerId: this.sellerId(),
          page: this.payoutsPage(),
          pageSize: this.payoutsPageSize(),
        }),
      ]);
      this.rows.set(items.rows);
      this.total.set(items.total);
      this.pending.set(totals);
      this.payoutRows.set(payouts.rows);
      this.payoutsTotal.set(payouts.total);
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

  protected onPayoutsPage(page: number): void {
    this.payoutsPage.set(page);
    void this.refresh();
  }

  protected onPayoutsPerPage(size: number): void {
    this.payoutsPageSize.set(size);
    this.payoutsPage.set(1);
    void this.refresh();
  }

  protected isSelected(row: SealedPayoutItemRow): boolean {
    return this.selected().has(row.item_id);
  }

  protected toggleRow(row: SealedPayoutItemRow, on: boolean): void {
    const next = new Map(this.selected());
    if (on) {
      next.set(row.item_id, row.payout_amount);
    } else {
      next.delete(row.item_id);
    }
    this.selected.set(next);
  }

  /** Header checkbox: (de)selects the current page's unpaid rows; selections
   *  made on other pages are kept. */
  protected toggleAll(on: boolean): void {
    const next = new Map(this.selected());
    for (const row of this.selectableRows()) {
      if (on) {
        next.set(row.item_id, row.payout_amount);
      } else {
        next.delete(row.item_id);
      }
    }
    this.selected.set(next);
  }

  protected clearSelection(): void {
    this.selected.set(new Map());
  }

  protected onNotesInput(event: Event): void {
    this.notes.set((event.target as HTMLInputElement).value);
  }

  protected async markPaid(): Promise<void> {
    if (this.selected().size === 0 || this.saving()) return;
    this.saving.set(true);
    try {
      const res = await this.payouts.createPayout(
        [...this.selected().keys()],
        this.notes() || null,
      );
      this.selected.set(new Map());
      this.notes.set('');
      await this.refresh();
      const total = res.total.toLocaleString('es-CR');
      this.snack
        .open(`Pagado a ${res.seller_name}: ₡${total} (${res.item_count} ítems)`, 'Deshacer', {
          duration: 6000,
        })
        .onAction()
        .subscribe(() => void this.undoPayout(res.payout_id));
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
      await this.refresh();
    } finally {
      this.saving.set(false);
    }
  }

  private async undoPayout(payoutId: string): Promise<void> {
    try {
      await this.payouts.deletePayout(payoutId);
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    }
    await this.refresh();
  }

  /** "What did this payment cover?" — the batch's items in a small modal. */
  protected openPayoutItems(row: SellerPayoutRow): void {
    this.dialog.open(PayoutItemsDialog, {
      data: row,
      width: '640px',
      maxWidth: '95vw',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });
  }

  /** Delete = revert the batch's items to pending. Undo re-creates the batch
   *  from the same item ids (captured before the delete). */
  protected async onDeletePayout(row: SellerPayoutRow): Promise<void> {
    try {
      const ids = await this.payouts.payoutItemIds(row.id);
      await this.payouts.deletePayout(row.id);
      await this.refresh();
      this.snack
        .open('Pago eliminado — ítems de vuelta a pendientes', 'Deshacer', { duration: 6000 })
        .onAction()
        .subscribe(() => void this.restorePayout(ids, row.notes));
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    }
  }

  private async restorePayout(itemIds: string[], notes: string | null): Promise<void> {
    try {
      await this.payouts.createPayout(itemIds, notes);
    } catch {
      // Legit failure window: an order got cancelled or the items were re-paid.
      this.snack.open('No se pudo restaurar el pago', 'OK', { duration: 5000 });
    }
    await this.refresh();
  }

  private errorMessage(err: unknown): string {
    const msg =
      err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : '';
    return PAYOUT_ERRORS[msg] ?? msg ?? 'Error desconocido';
  }
}
