import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { RafflesService } from '../../core/catalog/raffles.service';
import type { RaffleSummaryRow } from '../../core/catalog/catalog.types';
import { PageHeader } from '../../shared/table/page-header/page-header';
import { TableCard } from '../../shared/table/table-card/table-card';
import { PillTabs, type TabItem } from '../../shared/table/tabs/pill-tabs/pill-tabs';
import { Thumb } from '../../shared/table/cells/thumb-cell/thumb-cell';
import { Pill } from '../../shared/table/cells/pill/pill';
import { Btn } from '../../shared/table/controls/btn/btn';

type RaffleFilter = 'active' | 'completed';
type PillTone = 'neutral' | 'green' | 'amber' | 'red' | 'blue' | 'ink';

@Component({
  selector: 'app-admin-raffles',
  imports: [
    DatePipe,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTableModule,
    PageHeader,
    TableCard,
    PillTabs,
    Thumb,
    Pill,
    Btn,
  ],
  templateUrl: './raffles.html',
  styleUrl: './raffles.scss',
})
export class Raffles {
  private readonly service = inject(RafflesService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  protected readonly rows = signal<RaffleSummaryRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly filter = signal<RaffleFilter>('active');

  protected readonly displayedColumns = ['image', 'name', 'draw', 'entries', 'status', 'winner'];

  protected readonly visibleRows = computed(() => {
    const f = this.filter();
    return this.rows().filter((r) =>
      f === 'active' ? r.status === 'scheduled' : r.status === 'drawn' || r.status === 'void',
    );
  });

  protected readonly filterTabs = computed<TabItem[]>(() => {
    const rows = this.rows();
    return [
      { key: 'active', label: 'Activas', count: rows.filter((r) => r.status === 'scheduled').length },
      {
        key: 'completed',
        label: 'Completadas',
        count: rows.filter((r) => r.status === 'drawn' || r.status === 'void').length,
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
    void this.router.navigate(['/admin/raffles', productId]);
  }

  protected goToNew(): void {
    void this.router.navigate(['/admin/products/new'], { queryParams: { category: 'rifas' } });
  }

  protected statusLabel(status: RaffleSummaryRow['status']): string {
    switch (status) {
      case 'drawn':
        return 'Sorteada';
      case 'void':
        return 'Sin participantes';
      default:
        return 'Programada';
    }
  }

  protected statusTone(status: RaffleSummaryRow['status']): PillTone {
    switch (status) {
      case 'drawn':
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
