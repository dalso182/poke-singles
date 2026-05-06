import { Component, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CartService } from '../../core/cart/cart.service';
import type { CartLine } from '../../core/catalog/catalog.types';

@Component({
  selector: 'app-cart-page',
  standalone: true,
  imports: [
    RouterLink,
    DecimalPipe,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
  ],
  templateUrl: './cart-page.html',
  styleUrl: './cart-page.scss',
})
export class CartPage {
  private readonly cart = inject(CartService);
  private readonly snack = inject(MatSnackBar);

  protected readonly items = this.cart.items;
  protected readonly subtotal = this.cart.subtotal;
  protected readonly itemCount = this.cart.itemCount;
  protected readonly loading = this.cart.loading;

  protected onCheckout(): void {
    this.snack.open('Checkout disponible próximamente', 'OK', { duration: 3000 });
  }

  protected async onIncrement(line: CartLine): Promise<void> {
    if (line.quantity >= line.stock) return;
    const { error } = await this.cart.setQuantity(line.product_id, line.quantity + 1);
    if (error) this.snack.open(error, 'OK', { duration: 4000 });
  }

  protected async onDecrement(line: CartLine): Promise<void> {
    const { error } = await this.cart.setQuantity(line.product_id, line.quantity - 1);
    if (error) this.snack.open(error, 'OK', { duration: 4000 });
  }

  protected async onRemove(line: CartLine): Promise<void> {
    await this.cart.remove(line.product_id);
  }

  protected async onClear(): Promise<void> {
    if (!confirm('¿Vaciar el carrito?')) return;
    await this.cart.clear();
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
}
