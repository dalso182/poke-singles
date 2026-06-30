import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
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
import { CouponField } from '../../shared/coupon-field/coupon-field';
import { OrdersService } from '../../core/orders/orders.service';
import { ShippingMethodsService } from '../../core/catalog/shipping-methods.service';
import type {
  PaymentMethod,
  PlaceOrderInput,
  ProfileRow,
  ShippingAddress,
  ShippingMethodRow,
} from '../../core/catalog/catalog.types';

@Component({
  selector: 'app-checkout',
  imports: [
    ReactiveFormsModule,
    DecimalPipe,
    CouponField,
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
  protected readonly itemCount = this.cart.itemCount;
  protected readonly subtotal = this.cart.subtotal;
  protected readonly appliedCoupon = this.cart.appliedCoupon;
  protected readonly discount = this.cart.discount;

  protected readonly shippingMethods = signal<ShippingMethodRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly placing = signal(false);

  /** Distinct category_ids across the current cart — drives which shipping
   *  methods are offered. Empty until cart hydrates. */
  protected readonly cartCategoryIds = computed<string[]>(() => {
    const seen = new Set<string>();
    for (const line of this.items()) {
      if (line.category_id) seen.add(line.category_id);
    }
    return Array.from(seen);
  });

  /** Shipping methods filtered by the current cart's categories. A method is
   *  offered when its `allowed_category_ids` is empty (unrestricted) or every
   *  distinct cart category appears in it. */
  protected readonly visibleShippingMethods = computed<ShippingMethodRow[]>(() => {
    const cartCats = this.cartCategoryIds();
    return this.shippingMethods().filter((m) => {
      const allowed = m.allowed_category_ids ?? [];
      if (allowed.length === 0) return true;
      return cartCats.every((c) => allowed.includes(c));
    });
  });

  /** Tracks the radio-group value so computed signals react to changes
   *  (form `valueChanges` is hooked in the constructor below). */
  protected readonly selectedShippingMethodId = signal<string>('');

  /** Mirrors the payment radio-group value into a signal so the active
   *  radio-card styling reacts (FormControl.value isn't reactive). */
  protected readonly selectedPaymentMethod = signal<PaymentMethod>('sinpe_or_transfer');

  /** Profile snapshot used to render the "Enviar a:" summary. Set by
   *  prefillFromProfile after the auth session is ready. */
  protected readonly savedProfile = signal<ProfileRow | null>(null);

  /** 'saved' = render the profile address as read-only summary;
   *  'custom' = show the editable address form. Forced to 'custom' when
   *  no saved address exists. */
  protected readonly addressMode = signal<'saved' | 'custom'>('saved');

  /** True once the email control is bound to (and locked to) the signed-in
   *  account email. Guests leave it false and keep an editable field. */
  protected readonly emailLocked = signal(false);

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
    const id = this.selectedShippingMethodId();
    if (!id) return 0;
    return this.shippingMethods().find((s) => s.id === id)?.price ?? 0;
  });

  /** Name of the selected method — suffixes the "Envío" totals row. */
  protected readonly selectedShippingMethodName = computed<string>(() => {
    const id = this.selectedShippingMethodId();
    if (!id) return '';
    return this.shippingMethods().find((s) => s.id === id)?.name ?? '';
  });

  /** Human-readable label for the selected payment method. */
  protected readonly selectedPaymentLabel = computed<string>(() =>
    this.selectedPaymentMethod() === 'payment_link'
      ? 'Pago por enlace'
      : 'SINPE Móvil / Transferencia bancaria',
  );

  protected readonly selectedMethodRequiresAddress = computed<boolean>(() => {
    const id = this.selectedShippingMethodId();
    const m = this.shippingMethods().find((x) => x.id === id);
    // Default to required when the selection is unknown — fail-safe.
    return m?.requires_address ?? true;
  });

  protected readonly hasSavedAddress = computed<boolean>(() => {
    const addr = this.savedProfile()?.default_shipping_address;
    return !!addr?.line1?.trim();
  });

  protected readonly total = computed<number>(() =>
    Math.max(0, this.subtotal() - this.discount() + this.selectedShippingPrice()),
  );

  constructor() {
    // Mirror the radio-group value into a signal so the computeds above
    // react to user changes (FormControl.value alone isn't reactive).
    this.form.controls['shipping_method_id'].valueChanges.subscribe((v) => {
      this.selectedShippingMethodId.set(typeof v === 'string' ? v : '');
    });

    // Mirror the payment value so the active radio-card style reacts too.
    this.form.controls['payment_method'].valueChanges.subscribe((v) => {
      this.selectedPaymentMethod.set(v as PaymentMethod);
    });

    // Keep the selected shipping method consistent with the filtered list:
    // when a cart edit hides the current selection, fall back to the first
    // visible method (or clear it if none remain). Also lets the initial
    // bootstrap below seed a valid default once items + methods have loaded.
    effect(() => {
      const visible = this.visibleShippingMethods();
      const current = this.selectedShippingMethodId();
      if (current && visible.some((m) => m.id === current)) return;
      const next = visible[0]?.id ?? '';
      if (next !== current) {
        this.form.controls['shipping_method_id'].setValue(next);
      }
    });

    // Toggle address-field validators based on whether the editable form
    // is actually rendered. The form is shown when either (a) the user
    // explicitly switched to 'custom' mode, or (b) they have no saved
    // address to display in the read-only summary. In 'saved' mode the
    // form is hidden and its values came from the profile, so validators
    // aren't needed.
    effect(() => {
      const required = this.selectedMethodRequiresAddress();
      const showingForm = this.addressMode() === 'custom' || !this.hasSavedAddress();
      const fields = ['line1', 'city', 'province'] as const;
      const validators = required && showingForm ? Validators.required : null;
      for (const f of fields) {
        const ctrl = this.form.controls[f];
        ctrl.setValidators(validators);
        ctrl.updateValueAndValidity({ emitEvent: false });
      }
    });
  }

  ngOnInit(): void {
    void this.bootstrap();
  }

  /** Maps a condition grade to its traffic-light pill class — mirrors the
   *  shared product-card helper so the summary pill matches the catalog. */
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

  /** Re-patches the address controls from the saved profile so toggling
   *  back to 'saved' mode discards any in-progress edits cleanly. */
  protected resetAddressFromProfile(): void {
    const addr = this.savedProfile()?.default_shipping_address;
    this.form.patchValue({
      line1: addr?.line1 ?? '',
      line2: addr?.line2 ?? '',
      city: addr?.city ?? '',
      province: addr?.province ?? '',
      address_notes: addr?.notes ?? '',
    });
  }

  private async bootstrap(): Promise<void> {
    try {
      const [methods, _] = await Promise.all([
        this.shippingMethodsService.listActive(),
        this.prefillFromProfile(),
      ]);
      this.shippingMethods.set(methods);
      // Default-selection is handled by the effect in the constructor, which
      // picks the first method visible given the current cart contents.
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
  }

  private async prefillFromProfile(): Promise<void> {
    // Wait for the initial session hydration so a hard refresh doesn't see
    // currentUser() as undefined and skip the prefill.
    await this.auth.ready;
    const user = this.auth.currentUser();
    if (!user) return;
    // Signed-in checkout: the order email must always be the account email.
    // Lock it so it can't be edited (guests, who reach this without a user,
    // keep an editable field). getRawValue() in onSubmit still carries the
    // disabled control's value, so the buyer email flows through unchanged.
    this.form.controls['email'].setValue(user.email ?? '');
    this.form.controls['email'].disable({ emitEvent: false });
    this.emailLocked.set(true);
    try {
      const profile = await this.profiles.getMine();
      if (!profile) return;
      this.savedProfile.set(profile);
      if (profile.full_name) this.form.controls['name'].setValue(profile.full_name);
      if (profile.phone) this.form.controls['phone'].setValue(profile.phone);
      const addr = profile.default_shipping_address;
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
    // Pickup-style methods don't collect an address — pass null so the
    // RPC stores no phantom address and the order detail UI doesn't
    // render a half-empty shipping block.
    const address: ShippingAddress | null = this.selectedMethodRequiresAddress()
      ? {
          line1: String(raw.line1).trim(),
          line2: raw.line2 ? String(raw.line2).trim() : null,
          city: String(raw.city).trim(),
          province: String(raw.province).trim(),
          notes: raw.address_notes ? String(raw.address_notes).trim() : null,
        }
      : null;
    const input: PlaceOrderInput = {
      items: this.items().map((l) => ({
        product_id: l.product_id,
        quantity: l.quantity,
      })),
      buyer: {
        email: String(raw.email).trim(),
        name: String(raw.name).trim(),
        phone: String(raw.phone).trim(),
        address,
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
      case 'ADDRESS_REQUIRED':     return 'Necesitamos tu dirección de envío.';
      case 'INVALID_PAYMENT':      return 'Selecciona un método de pago.';
      case 'INVALID_SHIPPING':    return 'Selecciona un método de envío válido.';
      case 'SHIPPING_NOT_ALLOWED_FOR_CART':
        return 'El método de envío elegido no es válido para los productos en tu carrito. Selecciona otro.';
      case 'PRODUCT_GONE':
      case 'PRODUCT_UNAVAILABLE':  return 'Una de tus cartas ya no está disponible. Ajusta el carrito.';
      case 'INSUFFICIENT_STOCK':   return 'Una de tus cartas se agotó mientras pagabas. Ajusta el carrito.';
      case 'COUPON_INVALID':
      case 'COUPON_BELOW_MINIMUM':
      case 'COUPON_NO_ELIGIBLE':
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
