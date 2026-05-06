import { Component, effect, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CartService } from '../../core/cart/cart.service';
import { LocalStorageService } from '../../core/storage/local-storage.service';
import type { CartLine } from '../../core/catalog/catalog.types';

type CartView = 'list' | 'grid';
const VIEW_STORAGE_KEY = 'cart:view';

@Component({
  selector: 'app-cart-page',
  standalone: true,
  imports: [
    RouterLink,
    DecimalPipe,
    MatButtonModule,
    MatButtonToggleModule,
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
  private readonly storage = inject(LocalStorageService);

  protected readonly items = this.cart.items;
  protected readonly subtotal = this.cart.subtotal;
  protected readonly itemCount = this.cart.itemCount;
  protected readonly loading = this.cart.loading;
  protected readonly view = signal<CartView>(this.readView());

  constructor() {
    effect(() => this.storage.set(VIEW_STORAGE_KEY, this.view()));
  }

  private readView(): CartView {
    const raw = this.storage.get(VIEW_STORAGE_KEY);
    return raw === 'grid' ? 'grid' : 'list';
  }

  protected onViewChange(next: CartView): void {
    if (next !== 'list' && next !== 'grid') return;
    this.view.set(next);
  }

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
