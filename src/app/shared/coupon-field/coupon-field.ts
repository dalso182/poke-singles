import { Component, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../../core/auth/auth.service';
import { CartService } from '../../core/cart/cart.service';
import { mapCouponError } from '../../core/catalog/coupon-errors';

/**
 * Reusable coupon apply/remove control. Self-contained: it reads and mutates
 * the shared `CartService` coupon state directly, so every surface it's dropped
 * on (cart page, cart drawer, checkout) stays in sync via the `appliedCoupon`
 * signal. Renders only the form / applied-chip — each host keeps printing its
 * own `−₡ discount` line, so the amount is never shown twice.
 */
@Component({
  selector: 'app-coupon-field',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSnackBarModule,
  ],
  templateUrl: './coupon-field.html',
  styleUrl: './coupon-field.scss',
})
export class CouponField {
  /** 'compact' tightens spacing for the cart drawer. */
  readonly variant = input<'default' | 'compact'>('default');

  private readonly cart = inject(CartService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);

  protected readonly appliedCoupon = this.cart.appliedCoupon;
  protected readonly isSignedIn = this.auth.isSignedIn;
  protected readonly applying = signal(false);
  protected readonly error = signal<string>('');

  // FormGroup wrapper so FormGroupDirective binds to the <form> and `(ngSubmit)`
  // fires. Without it a bare ReactiveFormsModule <form> native-submits → reload.
  protected readonly form = new FormGroup({
    code: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(3)],
    }),
  });

  protected async onApply(): Promise<void> {
    if (!this.isSignedIn()) {
      this.error.set(mapCouponError('AUTH_REQUIRED'));
      return;
    }
    if (this.form.invalid || this.applying()) {
      this.form.markAllAsTouched();
      return;
    }
    this.applying.set(true);
    this.error.set('');
    try {
      const result = await this.cart.applyCoupon(this.form.controls.code.value);
      if (result.error) {
        this.error.set(mapCouponError(result.error, result.gap));
        // The code itself is valid (non-empty, ≥3 chars), so without forcing an
        // error state Material would never render <mat-error> and the message
        // would stay invisible. Re-running validators on the next keystroke
        // clears this automatically.
        this.form.controls.code.setErrors({ server: true });
        this.form.controls.code.markAsTouched();
        return;
      }
      this.form.reset();
      this.snack.open('Cupón aplicado', 'OK', { duration: 2500 });
    } finally {
      this.applying.set(false);
    }
  }

  protected async onRemove(): Promise<void> {
    await this.cart.removeCoupon();
  }
}
