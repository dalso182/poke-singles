import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ProductsService } from '../core/catalog/products.service';
import type { ProductListRow, ProductSearchRow } from '../core/catalog/catalog.types';
import { DEFAULT_SORT_NO_QUERY } from '../core/catalog/catalog.types';
import { Marquee } from '../shared/marquee/marquee';
import { ProductCard } from '../shared/product-card/product-card';

@Component({
  selector: 'app-home',
  imports: [
    RouterLink,
    MatProgressBarModule,
    MatSnackBarModule,
    Marquee,
    ProductCard,
  ],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  private readonly products = inject(ProductsService);
  private readonly snack = inject(MatSnackBar);

  protected readonly recent = signal<ProductListRow[]>([]);
  protected readonly featured = signal<ProductListRow[]>([]);
  protected readonly offers = signal<ProductSearchRow[]>([]);
  protected readonly loading = signal(true);

  constructor() {
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    try {
      const [recent, featured, offers] = await Promise.all([
        this.products.list({ pageSize: 12, excludeRaffles: true, excludeAuctions: true, inStockOnly: true }),
        this.products.list({ featured: true, pageSize: 12, excludeRaffles: true, excludeAuctions: true, inStockOnly: true }),
        // Same sort as the /ofertas listing so "Ver todo" continues seamlessly.
        this.products.search({ q: '', sort: DEFAULT_SORT_NO_QUERY, onSaleOnly: true, pageSize: 8 }),
      ]);
      this.recent.set(recent.rows);
      this.featured.set(featured.rows);
      this.offers.set(offers.rows);
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
