import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { OrdersService, WHATSAPP_PROOF_SENTINEL } from '../../core/orders/orders.service';
import { LocalStorageService } from '../../core/storage/local-storage.service';
import type {
  OrderItemRow,
  OrderRow,
  OrderStatus,
} from '../../core/catalog/catalog.types';
import {
  CancelOrderDialog,
  type CancelOrderDialogData,
  type CancelOrderDialogResult,
} from './cancel-order-dialog';
import { Thumb } from '../../shared/table/cells/thumb-cell/thumb-cell';
import { Pill } from '../../shared/table/cells/pill/pill';
import { Money } from '../../shared/table/cells/money-cell/money-cell';

const PICK_STORAGE_PREFIX = 'pick:order:';

// Sequential transitions: pending → paid → completed. Cancellation is a
// separate path that always lives on the cancel button. `shipped` exists in
// the schema for back-compat with older rows but isn't an active state we
// transition into; the type-narrow handles it gracefully if it appears.
const NEXT_STATUS: Partial<Record<OrderStatus, { label: string; next: OrderStatus }>> = {
  pending: { label: 'Marcar como pagado',     next: 'paid' },
  paid:    { label: 'Marcar como completado', next: 'completed' },
};

@Component({
  selector: 'app-admin-order-detail',
  imports: [
    RouterLink,
    DatePipe,
    DecimalPipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTableModule,
    MatTabsModule,
    MatTooltipModule,
    Thumb,
    Pill,
    Money,
  ],
  templateUrl: './order-detail.html',
  styleUrl: './order-detail.scss',
})
export class OrderDetail implements OnInit {
  readonly id = input.required<string>();

  private readonly orders = inject(OrdersService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly storage = inject(LocalStorageService);
  private readonly dialog = inject(MatDialog);

  protected readonly order = signal<OrderRow | null>(null);
  protected readonly items = signal<OrderItemRow[]>([]);
  protected readonly proofUrl = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);
  protected readonly working = signal(false);
  protected readonly uploadingProof = signal(false);

  /** Set of order_item.id values the picker has marked as pulled.
   *  Persisted in localStorage per order so the picker can take a break
   *  and come back to the same checked state. */
  protected readonly pickedIds = signal<Set<string>>(new Set());

  protected readonly displayedColumns = ['image', 'name', 'condition', 'qty', 'unit', 'total'];

  protected readonly shortRef = computed<string>(() => {
    const num = this.order()?.order_number;
    return num != null ? `#${num}` : '';
  });

  protected readonly forwardAction = computed(() => {
    const status = this.order()?.status;
    return status ? NEXT_STATUS[status] ?? null : null;
  });

  protected readonly canCancel = computed<boolean>(() => {
    const status = this.order()?.status;
    return status === 'pending' || status === 'paid';
  });

  protected readonly proofKind = computed<'file' | 'whatsapp' | 'none'>(() => {
    const url = this.order()?.payment_proof_url;
    if (!url) return 'none';
    if (url === WHATSAPP_PROOF_SENTINEL) return 'whatsapp';
    return 'file';
  });

  ngOnInit(): void {
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.orders.getOrderForAdmin(this.id());
      if (!result) {
        this.notFound.set(true);
        return;
      }
      this.order.set(result.order);
      this.items.set(result.items);
      this.pickedIds.set(this.readPicked(result.order.id));
      if (result.order.payment_proof_url && result.order.payment_proof_url !== WHATSAPP_PROOF_SENTINEL) {
        const url = await this.orders.getPaymentProofSignedUrl(result.order.payment_proof_url);
        this.proofUrl.set(url);
      }
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
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

  protected paymentLabel(p: OrderRow['payment_method']): string {
    return p === 'sinpe_or_transfer' ? 'SINPE / Transferencia' : 'Pago por enlace';
  }

  protected async onForward(): Promise<void> {
    const action = this.forwardAction();
    const order = this.order();
    if (!action || !order || this.working()) return;
    this.working.set(true);
    try {
      const updated = await this.orders.updateOrderStatus(order.id, action.next);
      this.order.set(updated);
      this.snack.open(`Pedido ${this.statusLabel(updated.status).toLowerCase()}`, 'OK', { duration: 3000 });
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.working.set(false);
    }
  }

  protected async onCancel(): Promise<void> {
    const order = this.order();
    if (!order || this.working()) return;

    const ref = this.dialog.open<
      CancelOrderDialog,
      CancelOrderDialogData,
      CancelOrderDialogResult
    >(CancelOrderDialog, {
      data: { shortRef: this.shortRef() },
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });
    const notes = await new Promise<CancelOrderDialogResult | undefined>((resolve) =>
      ref.afterClosed().subscribe(resolve),
    );
    // Null = dismissed via "Volver" or backdrop. Empty string = confirmed
    // with no note (sent through as null to the RPC).
    if (notes === null || notes === undefined) return;

    this.working.set(true);
    try {
      const result = await this.orders.cancelOrder(order.id, notes || null);
      if (!result.ok) {
        this.snack.open(this.cancelErrorCopy(result.error), 'OK', { duration: 5000 });
        return;
      }
      this.snack.open('Pedido cancelado y stock restaurado.', 'OK', { duration: 4000 });
      // Refresh from DB so the UI reflects the new status + notes.
      const refreshed = await this.orders.getOrderForAdmin(order.id);
      if (refreshed) {
        this.order.set(refreshed.order);
        this.items.set(refreshed.items);
      }
    } finally {
      this.working.set(false);
    }
  }

  private cancelErrorCopy(code: string): string {
    switch (code) {
      case 'NOT_ADMIN':         return 'Necesitas permisos de administrador.';
      case 'NOT_FOUND':         return 'No encontramos el pedido.';
      case 'ALREADY_TERMINAL':  return 'El pedido ya está cancelado o completado.';
      default:                  return 'No se pudo cancelar el pedido.';
    }
  }

  protected goBack(): void {
    this.router.navigate(['/admin/orders']);
  }

  protected async onAdminUploadProof(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const order = this.order();
    if (!file || !order || this.uploadingProof()) return;

    if (file.size > 5 * 1024 * 1024) {
      this.snack.open('El archivo supera los 5 MB.', 'OK', { duration: 4000 });
      return;
    }

    this.uploadingProof.set(true);
    try {
      const upload = await this.orders.uploadPaymentProof(order.id, file);
      if ('error' in upload) {
        this.snack.open(`No se pudo subir: ${upload.error}`, 'OK', { duration: 5000 });
        return;
      }
      const updated = await this.orders.adminAttachPaymentProof(order.id, upload.path);
      this.order.set(updated);
      const url = await this.orders.getPaymentProofSignedUrl(upload.path);
      this.proofUrl.set(url);
      this.snack.open('Comprobante adjuntado.', 'OK', { duration: 3000 });
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.uploadingProof.set(false);
    }
  }

  protected isPicked(itemId: string): boolean {
    return this.pickedIds().has(itemId);
  }

  protected togglePick(itemId: string): void {
    const next = new Set(this.pickedIds());
    if (next.has(itemId)) next.delete(itemId);
    else next.add(itemId);
    this.pickedIds.set(next);
    const orderId = this.order()?.id;
    if (orderId) this.writePicked(orderId, next);
  }

  private readPicked(orderId: string): Set<string> {
    const raw = this.storage.get(PICK_STORAGE_PREFIX + orderId);
    if (!raw) return new Set();
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? new Set(parsed.filter((s) => typeof s === 'string')) : new Set();
    } catch {
      return new Set();
    }
  }

  private writePicked(orderId: string, picked: Set<string>): void {
    const key = PICK_STORAGE_PREFIX + orderId;
    if (picked.size === 0) {
      this.storage.set(key, null);
    } else {
      this.storage.set(key, JSON.stringify([...picked]));
    }
  }

  /** Composed "Set name · #card_number" label for the picking grid.
   *  Either piece can be null — falls back to whatever's available, or
   *  empty string if both are missing. */
  protected setLabel(item: OrderItemRow): string {
    const parts: string[] = [];
    if (item.product_set_name) parts.push(item.product_set_name);
    if (item.product_card_number) parts.push(`#${item.product_card_number}`);
    return parts.join(' · ');
  }

  protected conditionClass(condition: string | null): string {
    if (!condition) return '';
    const code = condition.toUpperCase();
    let modifier = '';
    if (code === 'NM') modifier = 'condition-pill--nm';
    else if (code === 'LP') modifier = 'condition-pill--lp';
    else if (code === 'MP') modifier = 'condition-pill--mp';
    else if (code === 'HP' || code === 'DMG') modifier = 'condition-pill--hp';
    return `condition-pill ${modifier}`;
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
