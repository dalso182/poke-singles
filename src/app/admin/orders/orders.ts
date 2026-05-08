import { Component, computed, effect, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { OrdersService, WHATSAPP_PROOF_SENTINEL } from '../../core/orders/orders.service';
import type {
  OrderRow,
  OrderStatus,
  PaymentMethod,
} from '../../core/catalog/catalog.types';

type StatusFilter = OrderStatus | 'all';
type PaymentFilter = PaymentMethod | 'all';

@Component({
  selector: 'app-admin-orders',
  imports: [
    DatePipe,
    DecimalPipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSnackBarModule,
    MatTableModule,
    MatTooltipModule,
  ],
  templateUrl: './orders.html',
  styleUrl: './orders.scss',
})
export class Orders {
  private readonly orders = inject(OrdersService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  protected readonly searchControl = new FormControl('', { nonNullable: true });
  protected readonly statusControl = new FormControl<StatusFilter>('pending', { nonNullable: true });
  protected readonly paymentControl = new FormControl<PaymentFilter>('all', { nonNullable: true });

  protected readonly rows = signal<OrderRow[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(25);
  protected readonly loading = signal(false);

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

  private readonly searchValue = toSignal(
    this.searchControl.valueChanges.pipe(debounceTime(250), distinctUntilChanged()),
    { initialValue: '' },
  );
  private readonly statusValue = toSignal(this.statusControl.valueChanges, {
    initialValue: this.statusControl.value,
  });
  private readonly paymentValue = toSignal(this.paymentControl.valueChanges, {
    initialValue: this.paymentControl.value,
  });

  constructor() {
    // Reset to page 1 whenever any filter changes; refresh always.
    effect(() => {
      this.searchValue();
      this.statusValue();
      this.paymentValue();
      this.page.set(1);
      void this.refresh();
    });
    // Also refresh on page change.
    effect(() => {
      this.page();
      void this.refresh();
    });
  }

  private async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.orders.listOrders({
        status: this.statusControl.value,
        search: this.searchControl.value || undefined,
        paymentMethod: this.paymentControl.value,
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

  protected onPage(event: PageEvent): void {
    this.page.set(event.pageIndex + 1);
    this.pageSize.set(event.pageSize);
  }

  protected shortRef(orderNumber: number): string {
    return `#${orderNumber}`;
  }

  protected paymentLabel(p: OrderRow['payment_method']): string {
    return p === 'sinpe_or_transfer' ? 'SINPE/Transferencia' : 'Enlace';
  }

  protected statusLabel(s: OrderStatus): string {
    switch (s) {
      case 'pending':   return 'Pendiente';
      case 'paid':      return 'Pagado';
      case 'shipped':   return 'Enviado';
      case 'completed': return 'Completado';
      case 'cancelled': return 'Cancelado';
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

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
