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
