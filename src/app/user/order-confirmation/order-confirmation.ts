import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../../core/auth/auth.service';
import { AppSettingsService } from '../../core/settings/app-settings.service';
import { OrdersService, WHATSAPP_PROOF_SENTINEL } from '../../core/orders/orders.service';
import type { AppSettingsRow, OrderItemRow, OrderRow } from '../../core/catalog/catalog.types';

@Component({
  selector: 'app-order-confirmation',
  imports: [
    RouterLink,
    DecimalPipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
  ],
  templateUrl: './order-confirmation.html',
  styleUrl: './order-confirmation.scss',
})
export class OrderConfirmation implements OnInit {
  readonly id = input.required<string>();
  readonly email = input<string>('');

  private readonly orders = inject(OrdersService);
  private readonly auth = inject(AuthService);
  private readonly settings = inject(AppSettingsService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly order = signal<OrderRow | null>(null);
  protected readonly items = signal<OrderItemRow[]>([]);
  protected readonly settingsRow = signal<AppSettingsRow | null>(null);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);
  protected readonly uploading = signal(false);

  protected readonly shortRef = computed<string>(() => {
    const num = this.order()?.order_number;
    return num != null ? `#${num}` : '';
  });

  protected readonly proofUploaded = computed<boolean>(() => {
    const url = this.order()?.payment_proof_url;
    return !!url && url !== WHATSAPP_PROOF_SENTINEL;
  });
  protected readonly whatsappAcknowledged = computed<boolean>(
    () => this.order()?.payment_proof_url === WHATSAPP_PROOF_SENTINEL,
  );

  protected readonly whatsappLink = computed<string>(() => {
    const num = (this.settingsRow()?.whatsapp_number ?? '50663452039').replace(/\D/g, '');
    const ref = this.shortRef();
    const total = this.order()?.total ?? 0;
    const text = encodeURIComponent(
      `Hola, envío comprobante del pedido ${ref} (₡${total.toLocaleString('es-CR')}).`,
    );
    return `https://wa.me/${num}?text=${text}`;
  });

  ngOnInit(): void {
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    this.loading.set(true);
    try {
      const orderId = this.id();
      let result: { order: OrderRow; items: OrderItemRow[] } | null = null;
      if (this.auth.isSignedIn()) {
        result = await this.orders.getMyOrder(orderId);
      }
      // Fall back (or primary path for guests) to the email-gated RPC.
      if (!result && this.email()) {
        result = await this.orders.getGuestOrder(orderId, this.email());
      }
      if (!result) {
        this.notFound.set(true);
        return;
      }
      this.order.set(result.order);
      this.items.set(result.items);
      this.settingsRow.set(await this.settings.get());
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
  }

  protected async onProofSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const order = this.order();
    if (!order) return;
    this.uploading.set(true);
    try {
      const upload = await this.orders.uploadPaymentProof(order.id, file);
      if ('error' in upload) {
        this.snack.open(`No se pudo subir: ${upload.error}`, 'OK', { duration: 5000 });
        return;
      }
      const attach = await this.orders.attachPaymentProof(
        order.id,
        order.customer_email,
        upload.path,
      );
      if (!attach.ok) {
        this.snack.open('No se pudo registrar el comprobante. Avísanos por WhatsApp.', 'OK', { duration: 6000 });
        return;
      }
      this.order.set({ ...order, payment_proof_url: upload.path });
      this.snack.open('Comprobante recibido', 'OK', { duration: 3000 });
    } finally {
      this.uploading.set(false);
      input.value = '';
    }
  }

  /** "Ya envié por WhatsApp" — mark order as having a non-upload proof so
   *  admin can filter on it. Doesn't navigate; just flips the order state. */
  protected async onMarkSentByWhatsApp(): Promise<void> {
    const order = this.order();
    if (!order) return;
    const attach = await this.orders.attachPaymentProof(
      order.id,
      order.customer_email,
      WHATSAPP_PROOF_SENTINEL,
    );
    if (!attach.ok) {
      this.snack.open('No se pudo registrar. Intenta de nuevo.', 'OK', { duration: 4000 });
      return;
    }
    this.order.set({ ...order, payment_proof_url: WHATSAPP_PROOF_SENTINEL });
    this.snack.open('Marcamos tu pedido como enviado por WhatsApp.', 'OK', { duration: 3000 });
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
