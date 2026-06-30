import { Component, OnInit, PLATFORM_ID, computed, inject, input, signal } from '@angular/core';
import { DecimalPipe, isPlatformBrowser } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../../core/auth/auth.service';
import { AppSettingsService } from '../../core/settings/app-settings.service';
import { OrdersService, WHATSAPP_PROOF_SENTINEL } from '../../core/orders/orders.service';
import type { AppSettingsRow, OrderItemRow, OrderRow } from '../../core/catalog/catalog.types';

/** Strip a leading Costa Rica country code and hyphens for display:
 *  "+506 6345-2039" → "6345 2039". */
function toLocalNumber(raw: string): string {
  return raw
    .replace(/^\s*\+?506[\s-]*/, '')
    .replace(/-/g, ' ')
    .trim();
}

@Component({
  selector: 'app-order-confirmation',
  imports: [
    RouterLink,
    DecimalPipe,
    MatButtonModule,
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
  protected readonly auth = inject(AuthService);
  private readonly settings = inject(AppSettingsService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly order = signal<OrderRow | null>(null);
  protected readonly items = signal<OrderItemRow[]>([]);
  protected readonly settingsRow = signal<AppSettingsRow | null>(null);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);
  protected readonly uploading = signal(false);
  protected readonly copiedSinpe = signal(false);
  /** Object URL of the just-uploaded proof, for the same-session "Ver" link.
   *  Cleared on reload — the private bucket has no customer read access. */
  protected readonly proofPreviewUrl = signal<string | null>(null);

  protected readonly shortRef = computed<string>(() => {
    const num = this.order()?.order_number;
    return num != null ? `#${num}` : '';
  });

  /** Total cartas across the order (sum of line quantities). */
  protected readonly itemCount = computed<number>(() =>
    this.items().reduce((n, l) => n + l.quantity, 0),
  );

  /** Condition code → traffic-light pill classes (NM green … HP/DMG red).
   *  Mirrors ProductCard.conditionClass so the coloring stays consistent. */
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

  /** Preview of Poke-Monedas this order will earn once payment is validated.
   *  Mirrors the earn trigger: floor((subtotal − discount) / colones-per-point),
   *  gated by the loyalty flag. Guests (no user_id) never earn. */
  protected readonly coinsToEarn = computed<number>(() => {
    const o = this.order();
    const s = this.settingsRow();
    if (!o || !s?.loyalty_enabled || o.user_id == null) return 0;
    const per = Number(s.loyalty_colones_per_point) || 0;
    if (per <= 0) return 0;
    return Math.floor(Math.max(o.subtotal - (o.discount_amount ?? 0), 0) / per);
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

  /** SINPE number for display — local format, no country code or hyphen. */
  protected readonly sinpeDisplay = computed<string>(() =>
    toLocalNumber(this.settingsRow()?.sinpe_phone || '+506 6345-2039'),
  );

  /** WhatsApp number for the "¿Dudas?" help line — local format + plain wa.me link. */
  protected readonly whatsappDisplay = computed<string>(() =>
    toLocalNumber(this.settingsRow()?.whatsapp_number || '+506 6345-2039'),
  );
  protected readonly whatsappContactLink = computed<string>(
    () => `https://wa.me/${(this.settingsRow()?.whatsapp_number ?? '50663452039').replace(/\D/g, '')}`,
  );

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

  /** Copy the SINPE number to the clipboard; flip the button to its "copied"
   *  state for ~1.6s. Best-effort — no-op where the clipboard API is absent. */
  protected async copySinpe(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    const num = this.sinpeDisplay().replace(/\s+/g, '');
    try {
      await navigator.clipboard?.writeText(num);
      this.copiedSinpe.set(true);
      setTimeout(() => this.copiedSinpe.set(false), 1600);
    } catch {
      /* clipboard unavailable — silently ignore */
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
      if (isPlatformBrowser(this.platformId)) {
        const prev = this.proofPreviewUrl();
        if (prev) URL.revokeObjectURL(prev);
        this.proofPreviewUrl.set(URL.createObjectURL(file));
      }
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
