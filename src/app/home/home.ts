import { Component, inject, signal } from '@angular/core';
import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ProductsService } from '../core/catalog/products.service';
import { CartService } from '../core/cart/cart.service';
import type { ProductRow } from '../core/catalog/catalog.types';
import { CardPreviewDirective } from '../shared/card-preview/card-preview.directive';

@Component({
  selector: 'app-home',
  imports: [
    RouterLink,
    DecimalPipe,
    NgTemplateOutlet,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    CardPreviewDirective,
  ],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  private readonly products = inject(ProductsService);
  private readonly cart = inject(CartService);
  private readonly snack = inject(MatSnackBar);

  protected readonly recent = signal<ProductRow[]>([]);
  protected readonly featured = signal<ProductRow[]>([]);
  protected readonly loading = signal(true);

  constructor() {
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    try {
      const [recent, featured] = await Promise.all([
        this.products.list({ pageSize: 8 }),
        this.products.list({ featured: true, pageSize: 8 }),
      ]);
      this.recent.set(recent.rows);
      this.featured.set(featured.rows);
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
  }

  protected metaLine(card: ProductRow): string {
    const parts = [
      card.rarity ?? '',
      card.card_number ? `#${card.card_number}` : '',
    ].filter((s) => s && s.length > 0);
    return parts.join(', ');
  }

  protected conditionClass(condition: string | null): string {
    if (!condition) return '';
    const code = condition.toUpperCase();
    let modifier = '';
    if (code === 'NM') modifier = 'condition-pill--nm';
    else if (code === 'LP') modifier = 'condition-pill--lp';
    else if (code === 'MP') modifier = 'condition-pill--mp';
    else if (code === 'HP' || code === 'DMG') modifier = 'condition-pill--hp';
    return `condition-pill ${modifier}`;
  }

  protected typeIconUrl(type: string | null): string | null {
    if (!type) return null;
    const slug = TYPE_ICON_MAP[type];
    return slug ? `assets/images/types/${slug}.png` : null;
  }

  protected async onAddToCart(card: ProductRow, event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    const { error } = await this.cart.add(card.id, 1);
    if (error) this.snack.open(error, 'OK', { duration: 4000 });
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}

const TYPE_ICON_MAP: Record<string, string> = {
  Colorless: 'colorless',
  Darkness: 'dark',
  Dark: 'dark',
  Dragon: 'dragon',
  Lightning: 'electric',
  Electric: 'electric',
  Fairy: 'fairy',
  Fighting: 'fighting',
  Fire: 'fire',
  Grass: 'grass',
  Psychic: 'psychic',
  Metal: 'steel',
  Steel: 'steel',
  Water: 'water',
};
