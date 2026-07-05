import { Component, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  OrdersService,
  WHATSAPP_PROOF_SENTINEL,
  type AdminOrderListRow,
  type OrderStatusCounts,
} from '../../core/orders/orders.service';
import type { OrderRow, OrderStatus, PaymentMethod } from '../../core/catalog/catalog.types';
import { PageHeader } from '../../shared/table/page-header/page-header';
import { FilterBar } from '../../shared/table/filter-bar/filter-bar';
import { TableCard } from '../../shared/table/table-card/table-card';
import { PillTabs, type TabItem } from '../../shared/table/tabs/pill-tabs/pill-tabs';
import { SearchInput } from '../../shared/table/controls/search-input/search-input';
import { Dropdown, type DropdownOption } from '../../shared/table/controls/outlined-dropdown/outlined-dropdown';
import { Pill } from '../../shared/table/cells/pill/pill';
import { Money } from '../../shared/table/cells/money-cell/money-cell';
import { Btn } from '../../shared/table/controls/btn/btn';
import { PaginationFooter } from '../../shared/table/pagination-footer/pagination-footer';

type StatusFilter = OrderStatus | 'all';
type PaymentFilter = PaymentMethod | 'all';
type PillTone = 'neutral' | 'green' | 'amber' | 'red' | 'blue' | 'ink';

@Component({
  selector: 'app-admin-orders',
  imports: [
    DatePipe,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTableModule,
    MatTooltipModule,
    PageHeader,
    FilterBar,
    TableCard,
    PillTabs,
    SearchInput,
    Dropdown,
    Pill,
    Money,
    Btn,
    PaginationFooter,
  ],
  templateUrl: './orders.html',
  styleUrl: './orders.scss',
})
export class Orders {
  private readonly orders = inject(OrdersService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  protected readonly searchText = signal('');
  protected readonly status = signal<string>('pending');
  protected readonly payment = signal<string>('all');

  protected readonly rows = signal<AdminOrderListRow[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(25);
  protected readonly loading = signal(false);
  protected readonly counts = signal<OrderStatusCounts>({
    all: 0,
    pending: 0,
    paid: 0,
    completed: 0,
    cancelled: 0,
  });

  protected readonly displayedColumns = [
    'ref',
    'customer',
    'total',
    'payment',
    'proof',
    'status',
    'date',
    'actions',
  ];

  protected readonly statusTabs = computed<TabItem[]>(() => {
    const c = this.counts();
    return [
      { key: 'all', label: 'Todos', count: c.all },
      { key: 'pending', label: 'Pendientes', count: c.pending },
      { key: 'paid', label: 'Pagados', count: c.paid },
      { key: 'completed', label: 'Completados', count: c.completed },
      { key: 'cancelled', label: 'Cancelados', count: c.cancelled },
    ];
  });

  protected readonly paymentOptions: DropdownOption[] = [
    { value: 'all', label: 'Todos' },
    { value: 'sinpe_or_transfer', label: 'SINPE / Transferencia' },
    { value: 'payment_link', label: 'Enlace de pago' },
  ];

  private readonly searchValue = toSignal(
    toObservable(this.searchText).pipe(debounceTime(250), distinctUntilChanged()),
    { initialValue: '' },
  );

  constructor() {
    void this.loadCounts();
    // Reset to page 1 whenever a filter changes, then refresh.
    effect(() => {
      this.searchValue();
      this.status();
      this.payment();
      this.page.set(1);
      void this.refresh();
    });
  }

  private async loadCounts(): Promise<void> {
    try {
      this.counts.set(await this.orders.countByStatus());
    } catch {
      // Counts are decorative; leave them at zero on failure.
    }
  }

  private async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.orders.listOrders({
        status: this.status() as StatusFilter,
        search: this.searchValue() || undefined,
        paymentMethod: this.payment() as PaymentFilter,
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

  protected shortRef(orderNumber: number): string {
    return `${orderNumber}`;
  }

  protected paymentLabel(p: OrderRow['payment_method']): string {
    return p === 'sinpe_or_transfer' ? 'SINPE/Transferencia' : 'Enlace';
  }

  protected statusLabel(s: OrderStatus): string {
    switch (s) {
      case 'pending':
        return 'Pendiente';
      case 'paid':
        return 'Pagado';
      case 'shipped':
        return 'Enviado';
      case 'completed':
        return 'Completado';
      case 'cancelled':
        return 'Cancelado';
    }
  }

  protected statusTone(s: OrderStatus): PillTone {
    switch (s) {
      case 'pending':
        return 'amber';
      case 'paid':
      case 'completed':
        return 'green';
      case 'shipped':
        return 'blue';
      case 'cancelled':
        return 'red';
    }
  }

  protected proofKind(url: string | null): 'file' | 'whatsapp' | 'none' {
    if (!url) return 'none';
    if (url === WHATSAPP_PROOF_SENTINEL) return 'whatsapp';
    return 'file';
  }

  /** Open the proof image in a new tab via a freshly-signed URL. */
  protected async openProof(order: OrderRow): Promise<void> {
    const url = await this.orders.getPaymentProofSignedUrl(order.payment_proof_url);
    if (!url) {
      this.snack.open('No se pudo abrir el comprobante.', 'OK', { duration: 4000 });
      return;
    }
    window.open(url, '_blank', 'noopener');
  }

  protected goToView(id: string): void {
    this.router.navigate(['/admin/orders', id]);
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
