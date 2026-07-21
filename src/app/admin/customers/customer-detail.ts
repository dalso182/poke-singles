import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { CustomersService } from '../../core/customers/customers.service';
import type {
  CustomerDetail as CustomerDetailRow,
  LoyaltyTransactionKind,
  LoyaltyTransactionRow,
  OrderStatus,
} from '../../core/catalog/catalog.types';
import { BackHeader } from '../../shared/forms/back-header/back-header';
import { Pokedex } from '../../user/account/pokedex/pokedex';
import { TableCard } from '../../shared/table/table-card/table-card';
import { Pill } from '../../shared/table/cells/pill/pill';
import { Money } from '../../shared/table/cells/money-cell/money-cell';
import { Btn } from '../../shared/table/controls/btn/btn';

type PillTone = 'neutral' | 'green' | 'amber' | 'red' | 'blue' | 'ink';

@Component({
  selector: 'app-admin-customer-detail',
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTableModule,
    MatTabsModule,
    BackHeader,
    Pokedex,
    TableCard,
    Pill,
    Money,
    Btn,
  ],
  templateUrl: './customer-detail.html',
  styleUrl: './customer-detail.scss',
})
export class CustomerDetail implements OnInit {
  /** Route param (customers/:id) bound via withComponentInputBinding. */
  readonly id = input.required<string>();

  /** ?tab= query param (same input binding). NOTE: arrives undefined on plain
   *  navigations — always resolved through the computed fallback below. */
  readonly tab = input<string | undefined>();

  /** Initial tab: ?tab=pokedex → 2, ?tab=monedas → 1, else Pedidos. One-way
   *  binding — Material keeps managing clicks after init. */
  protected readonly selectedTab = computed(() => {
    switch (this.tab()) {
      case 'pokedex':
        return 2;
      case 'monedas':
        return 1;
      default:
        return 0;
    }
  });

  private readonly customers = inject(CustomersService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  protected readonly customer = signal<CustomerDetailRow | null>(null);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);
  protected readonly togglingBan = signal(false);

  protected readonly orderColumns = ['ref', 'total', 'status', 'date', 'actions'];
  protected readonly loyaltyColumns = ['date', 'description', 'kind', 'amount'];

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    const c = await this.customers.getCustomer(this.id());
    this.customer.set(c);
    this.notFound.set(c === null);
    this.loading.set(false);
  }

  protected goBack(): void {
    void this.router.navigate(['/admin/customers']);
  }

  /** Set/clear the auctions-only ban. Banning offers an optional reason
   *  (stored on the profile, shown here); unbanning just confirms. */
  protected async onToggleBan(): Promise<void> {
    const c = this.customer();
    if (!c || this.togglingBan()) return;
    const banning = c.auction_banned_at === null;
    const name = c.full_name || c.email;
    let reason: string | undefined;
    if (banning) {
      const input = prompt(
        `¿Vetar a ${name} de las subastas? No podrá pujar hasta que se restaure.\n\nMotivo (opcional):`,
      );
      if (input === null) return; // cancelled
      reason = input.trim() || undefined;
    } else if (!confirm(`¿Restaurar a ${name}? Podrá volver a pujar en subastas.`)) {
      return;
    }
    this.togglingBan.set(true);
    try {
      await this.customers.setAuctionBan(c.id, banning, reason);
      this.snack.open(
        banning ? 'Cliente vetado de subastas' : 'Veto de subastas removido',
        'OK',
        { duration: 4000 },
      );
      await this.load();
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Error desconocido';
      this.snack.open(message, 'OK', { duration: 5000 });
    } finally {
      this.togglingBan.set(false);
    }
  }

  protected goToOrder(id: string): void {
    void this.router.navigate(['/admin/orders', id]);
  }

  /** Monogram avatar — initials + a stable hue derived from the name. */
  protected initials(name: string | null | undefined): string {
    const source = (name || '?').trim();
    return (
      source
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0] ?? '')
        .join('')
        .toUpperCase() || '?'
    );
  }
  private hue(name: string | null | undefined): number {
    const s = name || '?';
    let sum = 0;
    for (let i = 0; i < s.length; i++) sum += s.charCodeAt(i);
    return Math.abs(sum) % 360;
  }
  protected avatarBg(name: string | null | undefined): string {
    return `oklch(0.94 0.04 ${this.hue(name)})`;
  }
  protected avatarFg(name: string | null | undefined): string {
    return `oklch(0.40 0.08 ${this.hue(name)})`;
  }

  protected recurringTag(orderCount: number): string {
    return orderCount > 1 ? 'Cliente recurrente' : 'Cliente';
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

  /** Ledger row description — falls back to a kind label when the transaction
   *  has none (same fallbacks the /account "Mis puntos" panel uses). */
  protected txLabel(tx: LoyaltyTransactionRow): string {
    if (tx.description) return tx.description;
    switch (tx.kind) {
      case 'earn':
        return 'Puntos ganados';
      case 'reversal':
        return 'Puntos revertidos';
      case 'adjust':
        return 'Ajuste';
      case 'redeem':
        return 'Poke-Monedas canjeadas';
    }
  }

  protected txKindLabel(kind: LoyaltyTransactionKind): string {
    switch (kind) {
      case 'earn':
        return 'Ganado';
      case 'redeem':
        return 'Canje';
      case 'reversal':
        return 'Reversión';
      case 'adjust':
        return 'Ajuste';
    }
  }

  protected txTone(kind: LoyaltyTransactionKind): PillTone {
    switch (kind) {
      case 'earn':
        return 'green';
      case 'redeem':
        return 'blue';
      case 'reversal':
        return 'red';
      case 'adjust':
        return 'amber';
    }
  }
}
