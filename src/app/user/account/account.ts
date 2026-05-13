import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../../core/auth/auth.service';
import { ProfilesService } from '../../core/auth/profiles.service';
import { OrdersService } from '../../core/orders/orders.service';
import type { OrderRow, ProfileRow, ShippingAddress } from '../../core/catalog/catalog.types';

@Component({
  selector: 'app-account',
  imports: [
    DecimalPipe,
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSnackBarModule,
  ],
  templateUrl: './account.html',
  styleUrl: './account.scss',
})
export class Account implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly profiles = inject(ProfilesService);
  private readonly orders = inject(OrdersService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly profile = signal<ProfileRow | null>(null);
  protected readonly myOrders = signal<OrderRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly email = computed(() => this.auth.currentUser()?.email ?? '');

  protected readonly form: FormGroup = this.fb.nonNullable.group({
    full_name: [''],
    phone: [''],
    line1: [''],
    line2: [''],
    city: [''],
    province: [''],
    address_notes: [''],
  });

  ngOnInit(): void {
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    this.loading.set(true);
    try {
      // Wait for the initial session hydration so RLS-scoped reads don't
      // come back empty on a hard refresh. customerGuard awaits this too,
      // but defensive here in case the page is reached without the guard.
      await this.auth.ready;
      const [profile, orders] = await Promise.all([
        this.profiles.getMine(),
        this.orders.getMyOrders().catch(() => [] as OrderRow[]),
      ]);
      console.debug('[account] profile fetched', profile);
      this.profile.set(profile);
      this.myOrders.set(orders);
      if (profile) {
        const addr = profile.default_shipping_address;
        this.form.patchValue({
          full_name: profile.full_name ?? '',
          phone: profile.phone ?? '',
          line1: addr?.line1 ?? '',
          line2: addr?.line2 ?? '',
          city: addr?.city ?? '',
          province: addr?.province ?? '',
          address_notes: addr?.notes ?? '',
        });
      }
      this.form.markAsPristine();
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
  }

  protected statusLabel(status: OrderRow['status']): string {
    switch (status) {
      case 'pending':   return 'Pendiente de pago';
      case 'paid':      return 'Pagado';
      case 'shipped':   return 'Enviado';
      case 'completed': return 'Completado';
      case 'cancelled': return 'Cancelado';
    }
  }

  protected shortRef(orderNumber: number): string {
    return `#${orderNumber}`;
  }

  protected async onSave(): Promise<void> {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    try {
      const raw = this.form.getRawValue();
      const line1 = raw.line1?.trim() ?? '';
      const city = raw.city?.trim() ?? '';
      const province = raw.province?.trim() ?? '';
      // Persist an address only when the required fields are filled — a
      // partial address (e.g. just a city) isn't useful to anyone and would
      // get rejected at checkout. Empty everything → null on the row.
      const address: ShippingAddress | null =
        line1 && city && province
          ? {
              line1,
              line2: raw.line2?.trim() || null,
              city,
              province,
              notes: raw.address_notes?.trim() || null,
            }
          : null;
      const updated = await this.profiles.updateMine({
        full_name: raw.full_name?.trim() || null,
        phone: raw.phone?.trim() || null,
        default_shipping_address: address,
      });
      this.profile.set(updated);
      this.form.markAsPristine();
      this.snack.open('Cuenta actualizada', 'OK', { duration: 3000 });
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.saving.set(false);
    }
  }

  protected async signOut(): Promise<void> {
    const { error } = await this.auth.signOut();
    if (error) {
      this.snack.open(error, 'OK', { duration: 4000 });
      return;
    }
    this.snack.open('Sesión cerrada', 'OK', { duration: 2500 });
    void this.router.navigate(['/']);
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
