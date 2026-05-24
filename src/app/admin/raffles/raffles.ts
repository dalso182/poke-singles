import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { RafflesService } from '../../core/catalog/raffles.service';
import type { RaffleSummaryRow } from '../../core/catalog/catalog.types';

type RaffleFilter = 'active' | 'completed';

@Component({
  selector: 'app-admin-raffles',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTableModule,
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

  protected onFilterChange(next: RaffleFilter): void {
    if (next === 'active' || next === 'completed') this.filter.set(next);
  }

  protected goTo(productId: string): void {
    void this.router.navigate(['/admin/raffles', productId]);
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

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
