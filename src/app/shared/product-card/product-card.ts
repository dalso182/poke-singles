import { Component, computed, inject, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CartService } from '../../core/cart/cart.service';
import { CardConditionsDialogService } from '../../core/preview/card-conditions-dialog.service';
import { CardPreviewDirective } from '../card-preview/card-preview.directive';
import { VARIANT_OPTIONS } from '../../core/catalog/catalog.types';
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

  protected readonly isOnSale = computed(() => {
    const c = this.card();
    return c.sale_price != null && c.sale_price < c.price;
  });

  private readonly cart = inject(CartService);
  private readonly snack = inject(MatSnackBar);
  private readonly conditionsDialog = inject(CardConditionsDialogService);

  protected metaLine(c: ProductCardItem): string {
    const number = c.card_number
      ? c.set_printed_total
        ? `#${c.card_number}/${c.set_printed_total}`
        : `#${c.card_number}`
      : '';
    // Surface Holo / Reverse Holo next to the number; plain Normal (and the
    // other variants) stays implicit to keep the meta line uncluttered.
    const variant = VARIANT_LABELS.get(c.variant ?? '') ?? '';
    const numberWithVariant = [number, variant].filter(Boolean).join(' · ');
    const parts = [c.set_name ?? '', numberWithVariant].filter(
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

// Only Holo / Reverse Holo are called out on the tile meta line; labels reuse
// the canonical VARIANT_OPTIONS so they can't drift from the rest of the app.
const VARIANT_LABELS = new Map(
  VARIANT_OPTIONS.filter((o) => o.value === 'holo' || o.value === 'reverse').map(
    (o) => [o.value as string, o.label],
  ),
);

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
