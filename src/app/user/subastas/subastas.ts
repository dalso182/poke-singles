import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ProductsService } from '../../core/catalog/products.service';
import type { AuctionListingItem } from '../../core/catalog/catalog.types';
import { AuctionCard } from '../../shared/auction-card/auction-card';

@Component({
  selector: 'app-subastas',
  imports: [
    RouterLink,
    MatIconModule,
    MatProgressBarModule,
    MatTabsModule,
    MatSnackBarModule,
    AuctionCard,
  ],
  templateUrl: './subastas.html',
  styleUrl: './subastas.scss',
})
export class Subastas {
  private readonly products = inject(ProductsService);
  private readonly snack = inject(MatSnackBar);

  protected readonly auctions = signal<AuctionListingItem[]>([]);
  protected readonly loading = signal(true);

  /** Open auctions you can still bid on. */
  protected readonly activeAuctions = computed(() =>
    this.auctions().filter((a) => a.status === 'active'),
  );
  /** History — sold to the highest bidder or closed without bids. */
  protected readonly completedAuctions = computed(() =>
    this.auctions().filter((a) => a.status === 'ended' || a.status === 'void'),
  );

  constructor() {
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    try {
      this.auctions.set(await this.products.listAuctions());
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
