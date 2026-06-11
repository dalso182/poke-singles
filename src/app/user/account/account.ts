import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../../core/auth/auth.service';
import { ProfilesService } from '../../core/auth/profiles.service';
import { PokemonService } from '../../core/pokemon/pokemon.service';
import { OrdersService } from '../../core/orders/orders.service';
import { LoyaltyService } from '../../core/loyalty/loyalty.service';
import {
  AvatarPickerDialog,
  type AvatarPickerData,
} from './avatar-picker/avatar-picker-dialog';
import type {
  LoyaltyTransactionRow,
  OrderRow,
  ShippingAddress,
} from '../../core/catalog/catalog.types';

@Component({
  selector: 'app-account',
  imports: [
    DecimalPipe,
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
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
  private readonly pokemon = inject(PokemonService);
  private readonly orders = inject(OrdersService);
  private readonly loyalty = inject(LoyaltyService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  // Single source of truth for the profile lives in ProfilesService so the
  // header avatar and this page stay in sync after an edit.
  protected readonly profile = this.profiles.profile;
  protected readonly myOrders = signal<OrderRow[]>([]);
  protected readonly points = signal(0);
  protected readonly pointsHistory = signal<LoyaltyTransactionRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly email = computed(() => this.auth.currentUser()?.email ?? '');

  /** Rail name: the saved full name, else the email's local part, else a generic label. */
  protected readonly displayName = computed(() => {
    const name = this.profile()?.full_name?.trim();
    if (name) return name;
    return this.email().split('@')[0] || 'Cliente';
  });

  /** Single-letter avatar fallback. */
  protected readonly initial = computed(() => this.displayName().charAt(0).toUpperCase() || 'C');

  /** Chosen avatar Pokémon (dex number) and its artwork path. The image may not
   *  exist yet (artwork is added incrementally), so `avatarBroken` flips on a
   *  load error and the rail falls back to the initial. */
  protected readonly avatarNumber = computed(() => this.profile()?.avatar_pokemon_number ?? null);

  /** Google OAuth photo (avatar_url / picture), if the account signed in with one. */
  private readonly googleAvatarUrl = computed(() => {
    const meta = this.auth.currentUser()?.user_metadata as
      | { avatar_url?: string; picture?: string }
      | undefined;
    return meta?.avatar_url || meta?.picture || null;
  });

  // Avatar source priority: chosen Pokémon → Google photo → initials. Each
  // `*Broken` flag drops a source that failed to load so the next one shows.
  protected readonly pokemonBroken = signal(false);
  protected readonly googleBroken = signal(false);
  protected readonly avatarSrc = computed<string | null>(() => {
    const n = this.avatarNumber();
    if (n != null && !this.pokemonBroken()) return this.pokemon.avatarUrl(n);
    if (!this.googleBroken()) return this.googleAvatarUrl();
    return null;
  });

  /** Which rail nav item is highlighted; driven by clicking a nav link. */
  protected readonly activeSection = signal<'datos' | 'direccion' | 'pedidos' | 'puntos'>('datos');

  constructor() {
    // Re-attempt every source when the chosen avatar or the signed-in user changes.
    effect(() => {
      this.avatarNumber();
      this.auth.currentUser();
      this.pokemonBroken.set(false);
      this.googleBroken.set(false);
    });
  }

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
      const [profile, orders, points, pointsHistory] = await Promise.all([
        this.profiles.ensureLoaded(),
        this.orders.getMyOrders().catch(() => [] as OrderRow[]),
        this.loyalty.getMyBalance().catch(() => 0),
        this.loyalty.getMyHistory().catch(() => [] as LoyaltyTransactionRow[]),
      ]);
      console.debug('[account] profile fetched', profile);
      this.myOrders.set(orders);
      this.points.set(points);
      this.pointsHistory.set(pointsHistory);
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

  /** Rail nav: highlight the target and smooth-scroll its section into view. */
  protected scrollToSection(
    el: HTMLElement,
    key: 'datos' | 'direccion' | 'pedidos' | 'puntos',
  ): void {
    this.activeSection.set(key);
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** Falls back to a kind label when a transaction has no description. */
  protected pointsLabel(tx: LoyaltyTransactionRow): string {
    if (tx.description) return tx.description;
    switch (tx.kind) {
      case 'earn':     return 'Puntos ganados';
      case 'reversal': return 'Puntos revertidos';
      case 'adjust':   return 'Ajuste';
    }
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
      await this.profiles.updateMine({
        full_name: raw.full_name?.trim() || null,
        phone: raw.phone?.trim() || null,
        default_shipping_address: address,
      });
      this.form.markAsPristine();
      this.snack.open('Cuenta actualizada', 'OK', { duration: 3000 });
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.saving.set(false);
    }
  }

  protected onAvatarError(): void {
    const n = this.avatarNumber();
    if (n != null && !this.pokemonBroken()) this.pokemonBroken.set(true);
    else this.googleBroken.set(true);
  }

  /** Open the avatar picker; on a new selection, save it immediately (a
   *  discrete action, kept out of the name/address form's save bar). */
  protected openAvatarPicker(): void {
    const ref = this.dialog.open<AvatarPickerDialog, AvatarPickerData, number | null>(
      AvatarPickerDialog,
      {
        width: '720px',
        maxWidth: '95vw',
        maxHeight: '85vh',
        autoFocus: 'first-tabbable',
        data: { current: this.avatarNumber() },
      },
    );
    ref.afterClosed().subscribe((picked) => {
      if (picked == null || picked === this.avatarNumber()) return;
      void this.saveAvatar(picked);
    });
  }

  private async saveAvatar(n: number): Promise<void> {
    try {
      await this.profiles.updateMine({ avatar_pokemon_number: n });
      this.snack.open('Avatar actualizado', 'OK', { duration: 3000 });
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
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
