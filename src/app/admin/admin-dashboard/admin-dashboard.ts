import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { OrdersService } from '../../core/orders/orders.service';
import { RafflesService } from '../../core/catalog/raffles.service';
import type { RaffleSummaryRow } from '../../core/catalog/catalog.types';

@Component({
  selector: 'app-admin-dashboard',
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss',
})
export class AdminDashboard implements OnInit {
  private readonly orders = inject(OrdersService);
  private readonly raffles = inject(RafflesService);

  protected readonly pendingCount = signal<number | null>(null);
  protected readonly raffleRows = signal<RaffleSummaryRow[] | null>(null);

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
    void this.orders.countPendingOrders().then((n) => this.pendingCount.set(n));
    void this.raffles
      .listSummary()
      .then((rows) => this.raffleRows.set(rows))
      .catch(() => this.raffleRows.set([]));
  }
}
