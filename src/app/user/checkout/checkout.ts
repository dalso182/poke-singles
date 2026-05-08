import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRadioModule } from '@angular/material/radio';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../../core/auth/auth.service';
import { ProfilesService } from '../../core/auth/profiles.service';
import { CartService } from '../../core/cart/cart.service';
import { OrdersService } from '../../core/orders/orders.service';
import { ShippingMethodsService } from '../../core/catalog/shipping-methods.service';
import type {
  PaymentMethod,
  PlaceOrderInput,
  ShippingAddress,
  ShippingMethodRow,
} from '../../core/catalog/catalog.types';

@Component({
  selector: 'app-checkout',
  imports: [
    ReactiveFormsModule,
    DecimalPipe,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatRadioModule,
    MatSnackBarModule,
  ],
  templateUrl: './checkout.html',
  styleUrl: './checkout.scss',
})
export class Checkout implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly auth = inject(AuthService);
  private readonly profiles = inject(ProfilesService);
  private readonly cart = inject(CartService);
  private readonly orders = inject(OrdersService);
  private readonly shippingMethodsService = inject(ShippingMethodsService);

  protected readonly items = this.cart.items;
  protected readonly subtotal = this.cart.subtotal;
  protected readonly appliedCoupon = this.cart.appliedCoupon;
  protected readonly discount = this.cart.discount;

  protected readonly shippingMethods = signal<ShippingMethodRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly placing = signal(false);

  protected readonly form: FormGroup = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    name: ['', Validators.required],
    phone: ['', [Validators.required, Validators.minLength(8)]],
    line1: ['', Validators.required],
    line2: [''],
    city: ['', Validators.required],
    province: ['', Validators.required],
    address_notes: [''],
    shipping_method_id: ['', Validators.required],
    payment_method: ['sinpe_or_transfer' as PaymentMethod, Validators.required],
    customer_notes: [''],
  });

  protected readonly selectedShippingPrice = computed<number>(() => {
    const id = this.form.controls['shipping_method_id'].value;
    if (!id) return 0;
    return this.shippingMethods().find((s) => s.id === id)?.price ?? 0;
  });

  protected readonly total = computed<number>(() =>
    Math.max(0, this.subtotal() - this.discount() + this.selectedShippingPrice()),
  );

  ngOnInit(): void {
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    try {
      const [methods, _] = await Promise.all([
        this.shippingMethodsService.listActive(),
        this.prefillFromProfile(),
      ]);
      this.shippingMethods.set(methods);
      // Default-select the first shipping method.
      if (methods.length > 0 && !this.form.controls['shipping_method_id'].value) {
        this.form.controls['shipping_method_id'].setValue(methods[0].id);
      }
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
  }

  private async prefillFromProfile(): Promise<void> {
    const user = this.auth.currentUser();
    if (!user) return;
    this.form.controls['email'].setValue(user.email ?? '');
    try {
      const profile = await this.profiles.getMine();
      if (!profile) return;
      if (profile.full_name) this.form.controls['name'].setValue(profile.full_name);
      if (profile.phone) this.form.controls['phone'].setValue(profile.phone);
      const addr = profile.default_shipping_address as ShippingAddress | null;
      if (addr) {
        this.form.patchValue({
          line1: addr.line1 ?? '',
          line2: addr.line2 ?? '',
          city: addr.city ?? '',
          province: addr.province ?? '',
          address_notes: addr.notes ?? '',
        });
      }
    } catch {
      // Profile fetch is best-effort; the form is still usable.
    }
  }

  protected async onSubmit(): Promise<void> {
    if (this.form.invalid || this.placing()) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.items().length === 0) {
      this.snack.open('Tu carrito está vacío.', 'OK', { duration: 3000 });
      return;
    }

    this.placing.set(true);
    const raw = this.form.getRawValue();
    const input: PlaceOrderInput = {
      items: this.items().map((l) => ({
        product_id: l.product_id,
        quantity: l.quantity,
      })),
      buyer: {
        email: String(raw.email).trim(),
        name: String(raw.name).trim(),
        phone: String(raw.phone).trim(),
        address: {
          line1: String(raw.line1).trim(),
          line2: raw.line2 ? String(raw.line2).trim() : null,
          city: String(raw.city).trim(),
          province: String(raw.province).trim(),
          notes: raw.address_notes ? String(raw.address_notes).trim() : null,
        },
      },
      shipping_method_id: raw.shipping_method_id,
      payment_method: raw.payment_method,
      coupon_code: this.appliedCoupon()?.code,
      customer_notes: raw.customer_notes ? String(raw.customer_notes).trim() : undefined,
    };

    try {
      const result = await this.orders.placeOrder(input);
      if (!result.ok) {
        this.snack.open(this.mapErrorCode(result.error), 'OK', { duration: 5000 });
        return;
      }
      // Clear local cart state so the post-redirect view doesn't show stale lines.
      await this.cart.clear();
      const url = `/checkout/confirmation/${result.order_id}`;
      const queryParams = { email: input.buyer.email };
      void this.router.navigate([url], { queryParams });
    } finally {
      this.placing.set(false);
    }
  }

  private mapErrorCode(code: string): string {
    switch (code) {
      case 'EMPTY_CART':           return 'Tu carrito está vacío.';
      case 'EMAIL_REQUIRED':       return 'Necesitamos tu correo electrónico.';
      case 'BUYER_INFO_REQUIRED':  return 'Completa tu nombre y teléfono.';
      case 'INVALID_PAYMENT':      return 'Selecciona un método de pago.';
      case 'INVALID_SHIPPING':    return 'Selecciona un método de envío válido.';
      case 'PRODUCT_GONE':
      case 'PRODUCT_UNAVAILABLE':  return 'Una de tus cartas ya no está disponible. Ajusta el carrito.';
      case 'INSUFFICIENT_STOCK':   return 'Una de tus cartas se agotó mientras pagabas. Ajusta el carrito.';
      case 'COUPON_INVALID':
      case 'COUPON_BELOW_MINIMUM':
      case 'COUPON_LIMIT':         return 'Tu cupón ya no es válido. Quítalo y vuelve a intentar.';
      default:                     return 'No se pudo procesar el pedido. Intenta de nuevo.';
    }
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
