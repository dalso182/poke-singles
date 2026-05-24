import { Component, computed, inject, input, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CartService } from '../../core/cart/cart.service';
import type { RaffleCardItem } from '../../core/catalog/catalog.types';

/**
 * Raffle tile for /rifas. A raffle is a product whose category is "Rifas":
 * `quantity` = entries remaining, `price` = per-entry price, the name carries
 * the entry count, `description` carries the notes. Unlike <app-product-card>
 * it shows the draw date + a quantity stepper (buy several numbers at once) and
 * links nowhere — raffles have no detail page.
 */
@Component({
  selector: 'app-raffle-card',
  imports: [
    DatePipe,
    DecimalPipe,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
  ],
  templateUrl: './raffle-card.html',
  styleUrl: './raffle-card.scss',
})
export class RaffleCard {
  readonly raffle = input.required<RaffleCardItem>();

  private readonly cart = inject(CartService);
  private readonly snack = inject(MatSnackBar);

  /** How many numbers the user wants to add at once. Clamped to [1, quantity]. */
  protected readonly qty = signal(1);

  protected readonly isOnSale = computed(() => {
    const r = this.raffle();
    return r.sale_price != null && r.sale_price < r.price;
  });

  protected readonly soldOut = computed(() => this.raffle().quantity === 0);

  /** Card identity line: "Set name, #123/198" (mirrors the product card). */
  protected readonly metaLine = computed(() => {
    const r = this.raffle();
    const number = r.card_number
      ? r.set_printed_total
        ? `#${r.card_number}/${r.set_printed_total}`
        : `#${r.card_number}`
      : '';
    return [r.set_name ?? '', number].filter((s) => s && s.length > 0).join(', ');
  });

  /** Original number of ticket spaces = remaining + already sold. */
  protected readonly totalSpaces = computed(
    () => this.raffle().quantity + this.raffle().entries_sold,
  );

  /** Days until the draw. `soon` (< 3 days, incl. today) gets the gold
   *  "coming soon" treatment. null when there's no date or it already passed. */
  protected readonly countdown = computed<{ label: string; soon: boolean } | null>(() => {
    const drawAt = this.raffle().draw_at;
    if (!drawAt) return null;
    const draw = Date.parse(`${drawAt.slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(draw)) return null;
    const now = new Date();
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.round((draw - today) / 86_400_000);
    if (days < 0) return null;
    const label = days === 0 ? '¡Hoy!' : days === 1 ? 'en 1 día' : `en ${days} días`;
    return { label, soon: days < 3 };
  });

  protected step(delta: number): void {
    const max = Math.max(1, this.raffle().quantity);
    this.qty.update((q) => Math.min(max, Math.max(1, q + delta)));
  }

  protected async onAddToCart(): Promise<void> {
    const { error } = await this.cart.add(this.raffle().id, this.qty());
    if (error) this.snack.open(error, 'OK', { duration: 4000 });
    else this.qty.set(1);
  }
}
