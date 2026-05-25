import {
  Component,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe, isPlatformBrowser } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ProductsService } from '../../core/catalog/products.service';
import { RafflesService } from '../../core/catalog/raffles.service';
import { OrdersService } from '../../core/orders/orders.service';
import type {
  OrderStatus,
  ProductRow,
  RaffleBuyerRow,
  RaffleRow,
} from '../../core/catalog/catalog.types';
import { Pill } from '../../shared/table/cells/pill/pill';
import { Btn } from '../../shared/table/controls/btn/btn';
import { IconBtn } from '../../shared/table/controls/icon-btn/icon-btn';

type PillTone = 'neutral' | 'green' | 'amber' | 'red' | 'blue' | 'ink';

const PAID_STATUSES: readonly OrderStatus[] = ['paid', 'shipped', 'completed'];

@Component({
  selector: 'app-admin-raffle-detail',
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTableModule,
    MatTooltipModule,
    Pill,
    Btn,
    IconBtn,
  ],
  templateUrl: './raffle-detail.html',
  styleUrl: './raffle-detail.scss',
})
export class RaffleDetail implements OnInit {
  readonly id = input.required<string>();

  private readonly products = inject(ProductsService);
  private readonly raffles = inject(RafflesService);
  private readonly orders = inject(OrdersService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly product = signal<ProductRow | null>(null);
  protected readonly raffle = signal<RaffleRow | null>(null);
  protected readonly buyers = signal<RaffleBuyerRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly drawing = signal(false);
  protected readonly notFound = signal(false);

  protected readonly columns = ['order', 'name', 'contact', 'entries', 'payment'];

  /** Entry orders excluding cancelled (those returned their entries to stock). */
  protected readonly entries = computed(() =>
    this.buyers().filter((b) => b.status !== 'cancelled'),
  );
  protected readonly hasUnpaid = computed(() =>
    this.entries().some((b) => b.status === 'pending'),
  );
  protected readonly soldEntriesTotal = computed(() =>
    this.entries().reduce((sum, b) => sum + b.quantity, 0),
  );
  protected readonly paidEntriesTotal = computed(() =>
    this.entries()
      .filter((b) => PAID_STATUSES.includes(b.status))
      .reduce((sum, b) => sum + b.quantity, 0),
  );
  protected readonly canDraw = computed(() => {
    const r = this.raffle();
    const notDrawn = !r || r.status === 'scheduled';
    return notDrawn && !this.hasUnpaid() && this.paidEntriesTotal() > 0;
  });

  /** Paid names repeated by paid entry count — paste-ready for a wheel site. */
  protected readonly wheelEntries = computed(() =>
    this.entries()
      .filter((b) => PAID_STATUSES.includes(b.status))
      .flatMap((b) => Array<string>(b.quantity).fill(b.customer_name))
      .join(', '),
  );

  ngOnInit(): void {
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    this.loading.set(true);
    try {
      const [product, raffle, buyers] = await Promise.all([
        this.products.get(this.id()),
        this.raffles.get(this.id()),
        this.orders.listRaffleBuyers(this.id()),
      ]);
      if (!product) {
        this.notFound.set(true);
        return;
      }
      this.product.set(product);
      this.raffle.set(raffle);
      this.buyers.set(buyers);
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
  }

  protected isWinnerRow(orderId: string): boolean {
    return this.raffle()?.winner_order_id === orderId;
  }

  protected statusLabel(s: OrderStatus): string {
    switch (s) {
      case 'paid':
        return 'Pagado';
      case 'shipped':
        return 'Enviado';
      case 'completed':
        return 'Completado';
      case 'cancelled':
        return 'Cancelado';
      default:
        return 'Pendiente';
    }
  }

  protected statusTone(s: OrderStatus): PillTone {
    switch (s) {
      case 'paid':
      case 'completed':
        return 'green';
      case 'shipped':
        return 'blue';
      case 'cancelled':
        return 'red';
      default:
        return 'amber';
    }
  }

  protected waLink(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    const full = digits.length === 8 ? `506${digits}` : digits;
    return `https://wa.me/${full}`;
  }

  protected async onDrawWinner(): Promise<void> {
    const p = this.product();
    if (!p || this.drawing() || !this.canDraw()) return;
    if (
      !confirm(
        '¿Sortear el ganador ahora? Se enviará un correo a todos los participantes y no se puede deshacer.',
      )
    ) {
      return;
    }
    this.drawing.set(true);
    try {
      const r = await this.raffles.draw(p.id);
      this.raffle.set(r);
      this.buyers.set(await this.orders.listRaffleBuyers(p.id));
      this.snack.open(
        r.status === 'void'
          ? 'No había participantes pagados; la rifa quedó sin ganador.'
          : `Ganador sorteado: ${r.winner_name}. Se notificará a los participantes.`,
        'OK',
        { duration: 6000 },
      );
    } catch (err) {
      const msg = this.errorMessage(err);
      this.snack.open(
        msg.includes('UNPAID_ENTRIES')
          ? 'Hay entradas sin pagar. Marca los pedidos como pagados (o cancélalos) antes de sortear.'
          : msg,
        'OK',
        { duration: 6000 },
      );
    } finally {
      this.drawing.set(false);
    }
  }

  protected async copyWheelEntries(): Promise<void> {
    const text = this.wheelEntries();
    if (!text || !isPlatformBrowser(this.platformId)) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      this.snack.open('Nombres copiados al portapapeles', 'OK', { duration: 3000 });
    } catch {
      this.snack.open('No se pudo copiar', 'OK', { duration: 4000 });
    }
  }

  protected goBack(): void {
    void this.router.navigate(['/admin/raffles']);
  }

  protected editProduct(id: string): void {
    void this.router.navigate(['/admin/products', id, 'edit']);
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
