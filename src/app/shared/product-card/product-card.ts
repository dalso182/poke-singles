import { Component, inject, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CartService } from '../../core/cart/cart.service';
import { CardConditionsDialogService } from '../../core/preview/card-conditions-dialog.service';
import { CardPreviewDirective } from '../card-preview/card-preview.directive';
import type { ProductCardItem } from '../../core/catalog/catalog.types';

@Component({
  selector: 'app-product-card',
  imports: [
    RouterLink,
    DecimalPipe,
    MatButtonModule,
    MatTooltipModule,
    MatSnackBarModule,
    CardPreviewDirective,
  ],
  templateUrl: './product-card.html',
  styleUrl: './product-card.scss',
})
export class ProductCard {
  readonly card = input.required<ProductCardItem>();
  readonly featured = input<boolean>(false);

  private readonly cart = inject(CartService);
  private readonly snack = inject(MatSnackBar);
  private readonly conditionsDialog = inject(CardConditionsDialogService);

  protected metaLine(c: ProductCardItem): string {
    const number = c.card_number
      ? c.set_printed_total
        ? `#${c.card_number}/${c.set_printed_total}`
        : `#${c.card_number}`
      : '';
    const parts = [c.set_name ?? '', number].filter(
      (s) => s && s.length > 0,
    );
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

  protected openConditionsInfo(event: MouseEvent): void {
    event.stopPropagation();
    void this.conditionsDialog.open();
  }

  protected async onAddToCart(event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    const { error } = await this.cart.add(this.card().id, 1);
    if (error) this.snack.open(error, 'OK', { duration: 4000 });
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
