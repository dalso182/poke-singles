import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ProductsService } from '../core/catalog/products.service';
import type { ProductListRow } from '../core/catalog/catalog.types';
import { Marquee } from '../shared/marquee/marquee';

@Component({
  selector: 'app-home',
  imports: [
    RouterLink,
    MatProgressBarModule,
    MatSnackBarModule,
    Marquee,
  ],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  private readonly products = inject(ProductsService);
  private readonly snack = inject(MatSnackBar);

  protected readonly recent = signal<ProductListRow[]>([]);
  protected readonly featured = signal<ProductListRow[]>([]);
  protected readonly loading = signal(true);

  constructor() {
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    try {
      const [recent, featured] = await Promise.all([
        this.products.list({ pageSize: 8, excludeRaffles: true, inStockOnly: true }),
        this.products.list({ featured: true, pageSize: 8, excludeRaffles: true, inStockOnly: true }),
      ]);
      this.recent.set(recent.rows);
      this.featured.set(featured.rows);
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
