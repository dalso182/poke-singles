import { Component, computed, effect, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { SellerPayoutsService } from '../../../../core/catalog/seller-payouts.service';
import { SellersService } from '../../../../core/catalog/sellers.service';
import type {
  SealedPayoutItemRow,
  SellerPendingTotal,
  SellerRow,
} from '../../../../core/catalog/catalog.types';
import { FilterBar } from '../../../../shared/table/filter-bar/filter-bar';
import { TableCard } from '../../../../shared/table/table-card/table-card';
import { BulkBar } from '../../../../shared/table/bulk-bar/bulk-bar';
import { DateRange } from '../../../../shared/table/controls/date-range/date-range';
import {
  Dropdown,
  type DropdownOption,
} from '../../../../shared/table/controls/outlined-dropdown/outlined-dropdown';
import { LabeledToggle } from '../../../../shared/table/controls/labeled-toggle/labeled-toggle';
import { PlainCheckbox } from '../../../../shared/table/controls/plain-checkbox/plain-checkbox';
import { Money } from '../../../../shared/table/cells/money-cell/money-cell';
import { Pill } from '../../../../shared/table/cells/pill/pill';
import { Thumb } from '../../../../shared/table/cells/thumb-cell/thumb-cell';
import { Btn } from '../../../../shared/table/controls/btn/btn';
import { PaginationFooter } from '../../../../shared/table/pagination-footer/pagination-footer';

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

/** Sellado: sold sealed consignment items with the fee breakdown (vendido,
 *  Cuanto 5%, comisión, pago al vendedor). Selecting items (one seller at a
 *  time) and marking them paid creates a seller_payouts batch. */
@Component({
  selector: 'app-consignment-sealed',
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTableModule,
    FilterBar,
    TableCard,
    BulkBar,
    DateRange,
    Dropdown,
    LabeledToggle,
    PlainCheckbox,
    Money,
    Pill,
    Thumb,
    Btn,
    PaginationFooter,
  ],
  templateUrl: './consignment-sealed.html',
  styleUrl: './consignment-sealed.scss',
})
export class ConsignmentSealed {
  private readonly payouts = inject(SellerPayoutsService);
  private readonly sellersService = inject(SellersService);
  private readonly snack = inject(MatSnackBar);

  /** '' = todos los vendedores; a uuid = that seller (products-list convention.
   *  No 'none' option — house items have no payout). */
  protected readonly sellerId = signal('');
  protected readonly pendingOnly = signal(true);
  protected readonly dateStart = signal<string | null>(null);
  protected readonly dateEnd = signal<string | null>(null);

  protected readonly rows = signal<SealedPayoutItemRow[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(50);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);

  /** All sellers (retired included — they can still be owed money). */
  protected readonly sellersList = signal<SellerRow[]>([]);
  protected readonly pending = signal<SellerPendingTotal[]>([]);

  /** item_id → payout_amount, so the owed sum survives pagination. */
  protected readonly selected = signal<Map<string, number>>(new Map());
  protected readonly notes = signal('');

  protected readonly sellerOptions = computed<DropdownOption[]>(() => [
    { value: '', label: 'Todos' },
    ...this.sellersList().map((s) => ({ value: s.id, label: `${s.name} (${s.code})` })),
  ]);

  protected readonly selectedCount = computed(() => this.selected().size);
  protected readonly selectedPayout = computed(() =>
    [...this.selected().values()].reduce((a, b) => a + b, 0),
  );

  /** Selection only makes sense scoped to one seller's pending items — the
   *  batch RPC enforces same-seller anyway. */
  protected readonly canSelect = computed(
    () => this.sellerId() !== '' && this.pendingOnly(),
  );
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

  /** Pending strip: the filtered seller's totals, or the grand total. */
  protected readonly pendingHeader = computed(() => {
    const id = this.sellerId();
    if (id !== '') {
      return this.pending().find((p) => p.seller_id === id) ?? null;
    }
    return null;
  });
  protected readonly pendingGrandTotal = computed(() =>
    this.pending().reduce((a, p) => a + p.pending_payout, 0),
  );

  protected readonly displayedColumns = computed(() => [
    ...(this.canSelect() ? ['select'] : []),
    'order',
    'product',
    ...(this.sellerId() === '' ? ['seller'] : []),
    'pago',
    'qty',
    'vendido',
    'cuanto',
    'comision',
    'payout',
    'estado',
  ]);

  constructor() {
    void this.loadSellers();
    effect(() => {
      this.sellerId();
      this.pendingOnly();
      this.dateStart();
      this.dateEnd();
      this.selected.set(new Map());
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
      const [items, totals] = await Promise.all([
        this.payouts.listSealedItems({
          sellerId: this.sellerId() || null,
          pendingOnly: this.pendingOnly(),
          dateStart: this.dateStart(),
          dateEnd: this.dateEnd(),
          page: this.page(),
          pageSize: this.pageSize(),
        }),
        this.payouts.sealedPendingTotals(),
      ]);
      this.rows.set(items.rows);
      this.total.set(items.total);
      this.pending.set(totals);
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

  protected filterSeller(id: string): void {
    this.sellerId.set(id);
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

  private errorMessage(err: unknown): string {
    const msg =
      err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : '';
    return PAYOUT_ERRORS[msg] ?? msg ?? 'Error desconocido';
  }
}
