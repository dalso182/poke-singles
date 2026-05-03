import { Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ProductsService } from '../../core/catalog/products.service';
import { SetsService } from '../../core/catalog/sets.service';
import type { ProductRow, SetRow } from '../../core/catalog/catalog.types';

@Component({
  selector: 'app-card-list',
  imports: [
    RouterLink,
    DecimalPipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
  ],
  templateUrl: './card-list.html',
  styleUrl: './card-list.scss',
})
export class CardList {
  private readonly products = inject(ProductsService);
  private readonly sets = inject(SetsService);
  private readonly snack = inject(MatSnackBar);

  protected readonly cards = signal<ProductRow[]>([]);
  protected readonly setsById = signal<Map<string, SetRow>>(new Map());
  protected readonly loading = signal(true);

  constructor() {
    this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    try {
      // RLS already filters to (active = true and quantity > 0) for the anon
      // client, so we don't need to repeat those constraints here.
      const [{ rows }, sets] = await Promise.all([
        this.products.list({ pageSize: 60 }),
        this.sets.list(),
      ]);
      this.cards.set(rows);
      this.setsById.set(new Map(sets.map((s) => [s.id, s])));
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
  }

  protected setName(setId: string | null): string {
    if (!setId) return '';
    return this.setsById().get(setId)?.name ?? '';
  }

  protected metaLine(card: ProductRow): string {
    const setName = this.setName(card.set_id);
    const parts = [setName, card.rarity ?? '', card.card_number ? `#${card.card_number}` : '']
      .filter((s) => s && s.length > 0);
    return parts.join(', ');
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
