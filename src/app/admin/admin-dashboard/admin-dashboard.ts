import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { OrdersService } from '../../core/orders/orders.service';
import { RafflesService } from '../../core/catalog/raffles.service';
import { DashboardService } from '../../core/dashboard/dashboard.service';
import { PresenceService } from '../../core/presence/presence.service';
import { CustomersService } from '../../core/customers/customers.service';
import { Sparkline } from '../../shared/sparkline/sparkline';
import type {
  CustomerRow,
  DashboardStats,
  OrderRow,
  OrderStatus,
  PokedexLeaderboardRow,
  RaffleSummaryRow,
} from '../../core/catalog/catalog.types';

@Component({
  selector: 'app-admin-dashboard',
  imports: [DatePipe, DecimalPipe, RouterLink, MatIconModule, Sparkline],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss',
})
export class AdminDashboard implements OnInit, OnDestroy {
  private readonly orders = inject(OrdersService);
  private readonly raffles = inject(RafflesService);
  private readonly dashboard = inject(DashboardService);
  private readonly presence = inject(PresenceService);
  private readonly customers = inject(CustomersService);

  protected readonly stats = signal<DashboardStats | null>(null);
  protected readonly recentOrders = signal<OrderRow[] | null>(null);
  protected readonly recentCustomers = signal<CustomerRow[] | null>(null);
  protected readonly activeCustomers = signal<CustomerRow[] | null>(null);
  protected readonly raffleRows = signal<RaffleSummaryRow[] | null>(null);
  protected readonly topPokedex = signal<PokedexLeaderboardRow[] | null>(null);

  /** Purchasable singles (active + in stock); null until loaded — tile shows '—'. */
  protected readonly singlesCount = signal<number | null>(null);

  /** Live storefront visitor count (Realtime presence). */
  protected readonly onlineCount = this.presence.watchOnlineCount();

  /** Pending-orders count for the operational tile, from the same stats RPC. */
  protected readonly pendingCount = computed<number | null>(
    () => this.stats()?.pending_orders ?? null,
  );

  // 30-day trend split into the two sparkline series + their period totals.
  protected readonly salesSeries = computed(() =>
    (this.stats()?.series ?? []).map((b) => b.sales),
  );
  protected readonly ordersSeries = computed(() =>
    (this.stats()?.series ?? []).map((b) => b.orders),
  );
  protected readonly salesLast30 = computed(() =>
    (this.stats()?.series ?? []).reduce((sum, b) => sum + b.sales, 0),
  );
  protected readonly ordersLast30 = computed(() =>
    (this.stats()?.series ?? []).reduce((sum, b) => sum + b.orders, 0),
  );

  /** Local (Costa Rica) today as YYYY-MM-DD — compared against draw_at's UTC
   *  date portion, which is the date the admin picked. */
  private readonly todayStr = (() => {
    const n = new Date();
    const m = String(n.getMonth() + 1).padStart(2, '0');
    const d = String(n.getDate()).padStart(2, '0');
    return `${n.getFullYear()}-${m}-${d}`;
  })();

  protected readonly activeRaffles = computed(() =>
    (this.raffleRows() ?? []).filter((r) => r.status === 'scheduled'),
  );
  protected readonly activeCount = computed(() => this.activeRaffles().length);

  /** Soonest active raffle whose draw date is today or later. */
  protected readonly nextRaffle = computed<RaffleSummaryRow | null>(() => {
    const upcoming = this.activeRaffles()
      .filter((r) => !!r.draw_at && r.draw_at.slice(0, 10) >= this.todayStr)
      .sort((a, b) => a.draw_at!.localeCompare(b.draw_at!));
    return upcoming[0] ?? null;
  });

  /** An active raffle drawing today — gets the attention treatment. */
  protected readonly todayRaffle = computed<RaffleSummaryRow | null>(
    () =>
      this.activeRaffles().find((r) => r.draw_at?.slice(0, 10) === this.todayStr) ??
      null,
  );

  ngOnInit(): void {
    void this.dashboard.getStats().then((s) => this.stats.set(s));
    void this.dashboard
      .countAvailableSingles()
      .then((n) => this.singlesCount.set(n))
      .catch((e) => console.error('[dashboard] countAvailableSingles', e));
    void this.orders
      .listOrders({ pageSize: 8 })
      .then((r) => this.recentOrders.set(r.rows))
      .catch(() => this.recentOrders.set([]));
    void this.customers
      .listCustomers({ pageSize: 8 })
      .then((r) => this.recentCustomers.set(r.rows))
      .catch(() => this.recentCustomers.set([]));
    void this.customers
      .listCustomers({ pageSize: 8, sort: 'active' })
      .then((r) => this.activeCustomers.set(r.rows))
      .catch(() => this.activeCustomers.set([]));
    void this.raffles
      .listSummary()
      .then((rows) => this.raffleRows.set(rows))
      .catch(() => this.raffleRows.set([]));
    void this.customers
      .pokedexLeaderboard()
      .then((rows) => this.topPokedex.set(rows))
      .catch(() => this.topPokedex.set([]));
  }

  ngOnDestroy(): void {
    this.presence.teardown();
  }

  /** Abbreviate large headline numbers OpenCart-style (1.2K, 62.6M); exact
   *  below 1,000. Currency tiles prefix ₡ in the template. */
  protected compact(n: number): string {
    if (n >= 1_000_000) return this.trim(n / 1_000_000) + 'M';
    if (n >= 1_000) return this.trim(n / 1_000) + 'K';
    return String(Math.round(n));
  }

  private trim(n: number): string {
    return (Math.round(n * 10) / 10).toString();
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
}
