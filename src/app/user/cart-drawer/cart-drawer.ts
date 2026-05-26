import { Component, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CartService } from '../../core/cart/cart.service';
import { CouponField } from '../../shared/coupon-field/coupon-field';
import { CardConditionsDialogService } from '../../core/preview/card-conditions-dialog.service';
import type { CartLine } from '../../core/catalog/catalog.types';

@Component({
  selector: 'app-cart-drawer',
  standalone: true,
  imports: [
    RouterLink,
    DecimalPipe,
    CouponField,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './cart-drawer.html',
  styleUrl: './cart-drawer.scss',
})
export class CartDrawer {
  private readonly cart = inject(CartService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly conditionsDialog = inject(CardConditionsDialogService);

  protected openConditionsInfo(event: MouseEvent): void {
    event.stopPropagation();
    void this.conditionsDialog.open();
  }

  protected readonly items = this.cart.items;
  protected readonly subtotal = this.cart.subtotal;
  protected readonly itemCount = this.cart.itemCount;
  protected readonly appliedCoupon = this.cart.appliedCoupon;
  protected readonly discount = this.cart.discount;
  protected readonly total = this.cart.total;

  protected close(): void {
    this.cart.closeDrawer();
  }

  protected goToCart(): void {
    this.cart.closeDrawer();
    void this.router.navigate(['/cart']);
  }

  protected onCheckout(): void {
    this.cart.closeDrawer();
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
