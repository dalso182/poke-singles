import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ProductsService } from '../../core/catalog/products.service';
import type { RaffleCardItem } from '../../core/catalog/catalog.types';
import { RaffleCard } from '../../shared/raffle-card/raffle-card';

@Component({
  selector: 'app-rifas',
  imports: [
    RouterLink,
    MatIconModule,
    MatProgressBarModule,
    MatTabsModule,
    MatSnackBarModule,
    RaffleCard,
  ],
  templateUrl: './rifas.html',
  styleUrl: './rifas.scss',
})
export class Rifas {
  private readonly products = inject(ProductsService);
  private readonly snack = inject(MatSnackBar);

  protected readonly raffles = signal<RaffleCardItem[]>([]);
  protected readonly loading = signal(true);

  /** Open raffles you can still buy into. */
  protected readonly activeRaffles = computed(() =>
    this.raffles().filter((r) => r.status === 'scheduled'),
  );
  /** History — drawn (with winner) or closed without participants. */
  protected readonly completedRaffles = computed(() =>
    this.raffles().filter((r) => r.status === 'drawn' || r.status === 'void'),
  );

  constructor() {
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    try {
      this.raffles.set(await this.products.listRaffles());
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
