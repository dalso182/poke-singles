import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { AuctionsService } from '../../core/catalog/auctions.service';
import type { AuctionSummaryRow } from '../../core/catalog/catalog.types';
import { PageHeader } from '../../shared/table/page-header/page-header';
import { TableCard } from '../../shared/table/table-card/table-card';
import { PillTabs, type TabItem } from '../../shared/table/tabs/pill-tabs/pill-tabs';
import { Thumb } from '../../shared/table/cells/thumb-cell/thumb-cell';
import { Pill } from '../../shared/table/cells/pill/pill';
import { Money } from '../../shared/table/cells/money-cell/money-cell';
import { Btn } from '../../shared/table/controls/btn/btn';

type AuctionFilter = 'active' | 'completed';
type PillTone = 'neutral' | 'green' | 'amber' | 'red' | 'blue' | 'ink';

@Component({
  selector: 'app-admin-auctions',
  imports: [
    DatePipe,
    DecimalPipe,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTableModule,
    PageHeader,
    TableCard,
    PillTabs,
    Thumb,
    Pill,
    Money,
    Btn,
  ],
  templateUrl: './auctions.html',
  styleUrl: './auctions.scss',
})
export class Auctions {
  private readonly service = inject(AuctionsService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  protected readonly rows = signal<AuctionSummaryRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly filter = signal<AuctionFilter>('active');

  protected readonly displayedColumns = ['image', 'name', 'ends', 'bid', 'bids', 'status', 'winner'];

  protected readonly visibleRows = computed(() => {
    const f = this.filter();
    return this.rows().filter((r) =>
      f === 'active' ? r.status === 'active' : r.status === 'ended' || r.status === 'void',
    );
  });

  protected readonly filterTabs = computed<TabItem[]>(() => {
    const rows = this.rows();
    return [
      { key: 'active', label: 'Activas', count: rows.filter((r) => r.status === 'active').length },
      {
        key: 'completed',
        label: 'Finalizadas',
        count: rows.filter((r) => r.status === 'ended' || r.status === 'void').length,
      },
    ];
  });

  constructor() {
    void this.refresh();
  }

  protected async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      this.rows.set(await this.service.listSummary());
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
  }

  protected onFilterChange(next: string): void {
    if (next === 'active' || next === 'completed') this.filter.set(next);
  }

  protected goTo(productId: string): void {
    void this.router.navigate(['/admin/auctions', productId]);
  }

  protected goToNew(): void {
    void this.router.navigate(['/admin/products/new'], { queryParams: { category: 'subastas' } });
  }

  protected statusLabel(status: AuctionSummaryRow['status']): string {
    switch (status) {
      case 'ended':
        return 'Vendida';
      case 'void':
        return 'Sin pujas';
      default:
        return 'Activa';
    }
  }

  protected statusTone(status: AuctionSummaryRow['status']): PillTone {
    switch (status) {
      case 'ended':
        return 'green';
      case 'void':
        return 'neutral';
      default:
        return 'blue';
    }
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
