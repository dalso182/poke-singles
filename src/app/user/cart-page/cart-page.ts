import { Component, effect, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../../core/auth/auth.service';
import { CartService } from '../../core/cart/cart.service';
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
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSnackBarModule,
  ],
  templateUrl: './cart-page.html',
  styleUrl: './cart-page.scss',
})
export class CartPage {
  private readonly cart = inject(CartService);
  private readonly auth = inject(AuthService);
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
  protected readonly isSignedIn = this.auth.isSignedIn;

  protected readonly couponControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(3)],
  });
  protected readonly couponError = signal<string>('');
  protected readonly applyingCoupon = signal(false);

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
    this.snack.open('Checkout disponible próximamente', 'OK', { duration: 3000 });
  }

  protected async onApplyCoupon(): Promise<void> {
    if (!this.isSignedIn()) {
      this.couponError.set(mapCouponError('AUTH_REQUIRED'));
      return;
    }
    if (this.couponControl.invalid || this.applyingCoupon()) {
      this.couponControl.markAsTouched();
      return;
    }
    this.applyingCoupon.set(true);
    this.couponError.set('');
    try {
      const result = await this.cart.applyCoupon(this.couponControl.value);
      if (result.error) {
        this.couponError.set(mapCouponError(result.error, result.gap));
        return;
      }
      this.couponControl.reset('');
      this.snack.open('Cupón aplicado', 'OK', { duration: 2500 });
    } finally {
      this.applyingCoupon.set(false);
    }
  }

  protected async onRemoveCoupon(): Promise<void> {
    await this.cart.removeCoupon();
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
