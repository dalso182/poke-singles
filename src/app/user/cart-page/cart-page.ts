import { Component, effect, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CartService } from '../../core/cart/cart.service';
import { CouponField } from '../../shared/coupon-field/coupon-field';
import { EmptyCartPokemon } from '../../shared/empty-cart-pokemon/empty-cart-pokemon';
import { CardConditionsDialogService } from '../../core/preview/card-conditions-dialog.service';
import { LocalStorageService } from '../../core/storage/local-storage.service';
import { mapCouponError } from '../../core/catalog/coupon-errors';
import type { CartLine } from '../../core/catalog/catalog.types';

type CartView = 'list' | 'grid';
const VIEW_STORAGE_KEY = 'cart:view';

@Component({
  selector: 'app-cart-page',
  standalone: true,
  imports: [
    RouterLink,
    DecimalPipe,
    CouponField,
    EmptyCartPokemon,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './cart-page.html',
  styleUrl: './cart-page.scss',
})
export class CartPage {
  private readonly cart = inject(CartService);
  private readonly conditionsDialog = inject(CardConditionsDialogService);

  protected openConditionsInfo(event: MouseEvent): void {
    event.stopPropagation();
    void this.conditionsDialog.open();
  }
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly storage = inject(LocalStorageService);

  protected readonly items = this.cart.items;
  protected readonly subtotal = this.cart.subtotal;
  protected readonly itemCount = this.cart.itemCount;
  protected readonly loading = this.cart.loading;
  protected readonly view = signal<CartView>(this.readView());

  protected readonly appliedCoupon = this.cart.appliedCoupon;
  protected readonly discount = this.cart.discount;
  protected readonly total = this.cart.total;

  constructor() {
    effect(() => this.storage.set(VIEW_STORAGE_KEY, this.view()));
    // Surface auto-drops from cart mutations as a snackbar.
    effect(() => {
      const tick = this.cart.couponDroppedTick();
      if (!tick) return;
      this.snack.open(
        `El cupón ya no aplica: ${mapCouponError(tick.error, tick.gap)}`,
        'OK',
        { duration: 5000 },
      );
    });
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
    void this.router.navigate(['/checkout']);
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

  /** Per-line coupon effect (struck/discounted price, scope flags) or
   *  undefined when no coupon is applied. See CartService.lineCoupon. */
  protected linePricing(line: CartLine) {
    return this.cart.lineCoupon().get(line.product_id);
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
