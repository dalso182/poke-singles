import {
  Component,
  ElementRef,
  Injector,
  OnInit,
  PLATFORM_ID,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { DecimalPipe, DatePipe, Location, isPlatformBrowser } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { nameValidator } from '../../shared/validators/name.validator';
import { phoneValidator } from '../../shared/validators/phone.validator';
import { Router, RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../../core/auth/auth.service';
import { ProfilesService } from '../../core/auth/profiles.service';
import { OrdersService } from '../../core/orders/orders.service';
import { LoyaltyService } from '../../core/loyalty/loyalty.service';
import { UserAvatar } from '../../shared/user-avatar/user-avatar';
import { AvatarPickerService } from './avatar-picker/avatar-picker.service';
import { LoadMore } from '../../shared/load-more/load-more';
import { DateRange } from '../../shared/table/controls/date-range/date-range';
import { Pokedex } from './pokedex/pokedex';
import type {
  LoyaltyTransactionRow,
  OrderRow,
  ShippingAddress,
} from '../../core/catalog/catalog.types';

/** The rail's five views — one panel at a time, so the page height stays
 *  constant no matter how long the order / points history grows. */
type AccountView = 'datos' | 'direccion' | 'pedidos' | 'puntos' | 'pokedex';

const ORDERS_PAGE_SIZE = 10;
const POINTS_PAGE_SIZE = 20;

/** app-date-range emits local calendar days (`YYYY-MM-DD`); convert them to
 *  inclusive UTC instants so "hoy" means the customer's day, not UTC's. */
function dayBounds(
  fromIso: string | null,
  toIso: string | null,
): { from?: string; to?: string } {
  const out: { from?: string; to?: string } = {};
  if (fromIso) out.from = new Date(`${fromIso}T00:00:00`).toISOString();
  if (toIso) out.to = new Date(`${toIso}T23:59:59.999`).toISOString();
  return out;
}

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
    MatSelectModule,
    MatProgressBarModule,
    MatSnackBarModule,
    UserAvatar,
    LoadMore,
    DateRange,
    Pokedex,
  ],
  templateUrl: './account.html',
  styleUrl: './account.scss',
})
export class Account implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly profiles = inject(ProfilesService);
  private readonly orders = inject(OrdersService);
  private readonly loyalty = inject(LoyaltyService);
  private readonly snack = inject(MatSnackBar);
  private readonly avatarPicker = inject(AvatarPickerService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly location = inject(Location);

  // Single source of truth for the profile lives in ProfilesService so the
  // header avatar and this page stay in sync after an edit.
  protected readonly profile = this.profiles.profile;

  // Orders ledger, paged: `myOrders` holds the loaded pages, `ordersTotal` the
  // exact DB count (drives the header figure + when "Cargar más" disappears).
  // When a date filter is set, both reflect the filtered set.
  protected readonly myOrders = signal<OrderRow[]>([]);
  protected readonly ordersTotal = signal(0);
  protected readonly ordersLoadingMore = signal(false);
  protected readonly ordersHasMore = computed(
    () => this.myOrders().length < this.ordersTotal(),
  );
  // Date filter (local calendar days, from app-date-range).
  protected readonly ordersFrom = signal<string | null>(null);
  protected readonly ordersTo = signal<string | null>(null);
  protected readonly ordersFiltered = computed(
    () => this.ordersFrom() !== null || this.ordersTo() !== null,
  );

  /** Shared LoyaltyService balance — stays fresh after a Pokéball spend. */
  protected readonly points = computed(() => this.loyalty.balance() ?? 0);
  // Points ledger, paged + date-filtered the same way as orders.
  protected readonly pointsHistory = signal<LoyaltyTransactionRow[]>([]);
  protected readonly pointsTotal = signal(0);
  protected readonly pointsLoadingMore = signal(false);
  protected readonly pointsHasMore = computed(
    () => this.pointsHistory().length < this.pointsTotal(),
  );
  protected readonly pointsFrom = signal<string | null>(null);
  protected readonly pointsTo = signal<string | null>(null);
  protected readonly pointsFiltered = computed(
    () => this.pointsFrom() !== null || this.pointsTo() !== null,
  );

  protected readonly loading = signal(false);
  protected readonly savingPersonal = signal(false);
  protected readonly savingAddress = signal(false);
  protected readonly email = computed(() => this.auth.currentUser()?.email ?? '');

  /** Rail name: the saved full name, else the email's local part, else a generic label. */
  protected readonly displayName = computed(() => {
    const name = this.profile()?.full_name?.trim();
    if (name) return name;
    return this.email().split('@')[0] || 'Cliente';
  });

  /** Route-data input: /account/pedidos, /account/puntos, /account/pokedex …
   *  open their view directly. NOTE: withComponentInputBinding overwrites the
   *  default with undefined on routes without the key — always read with
   *  `?? 'datos'`. */
  readonly initialView = input<AccountView | undefined>();

  /** The active panel — the rail is a real switcher, so only this section
   *  renders. Keeps the page height flat however long the ledgers get. */
  protected readonly view = signal<AccountView>('datos');

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  // On the stacked mobile layout the rail sits above the content, so after a
  // switch the fresh panel can start below the fold — we scroll it into view.
  private readonly contentEl = viewChild<ElementRef<HTMLElement>>('contentEl');

  /** The 7 provinces of Costa Rica, for the shipping-address dropdown. */
  protected readonly provinces = [
    'San José',
    'Alajuela',
    'Cartago',
    'Heredia',
    'Guanacaste',
    'Puntarenas',
    'Limón',
  ] as const;

  // Two independent forms so each section saves on its own — editing the
  // address doesn't dirty the personal-data save, and vice versa.
  protected readonly personalForm: FormGroup = this.fb.nonNullable.group({
    full_name: ['', nameValidator()],
    phone: ['', phoneValidator()],
  });

  protected readonly addressForm: FormGroup = this.fb.nonNullable.group({
    line1: [''],
    line2: [''],
    city: [''],
    province: [''],
    address_notes: [''],
  });

  constructor() {
    // Leave /account the instant the session ends so no signed-out viewer keeps
    // seeing the previous user's data. The page's own "Cerrar sesión" navigates
    // away already, but logout from the header menu or another tab (Supabase
    // broadcasts SIGNED_OUT) does not — and the reactive forms / order signals
    // aren't auth-reactive, so they'd otherwise stay filled. Navigating destroys
    // the component, clearing all loaded PII. (`undefined` = hydrating, skip;
    // `null` = signed out.)
    effect(() => {
      if (this.auth.currentUser() === null) {
        void this.router.navigate(['/']);
      }
    });
  }

  ngOnInit(): void {
    this.view.set(this.initialView() ?? 'datos');
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    this.loading.set(true);
    try {
      // Wait for the initial session hydration so RLS-scoped reads don't
      // come back empty on a hard refresh. customerGuard awaits this too,
      // but defensive here in case the page is reached without the guard.
      await this.auth.ready;
      const emptyOrders = { rows: [] as OrderRow[], total: 0 };
      const emptyHistory = { rows: [] as LoyaltyTransactionRow[], total: 0 };
      const [profile, orders, , pointsHistory] = await Promise.all([
        this.profiles.ensureLoaded(),
        this.orders.getMyOrders({ limit: ORDERS_PAGE_SIZE }).catch(() => emptyOrders),
        this.loyalty.ensureLoaded().catch(() => 0),
        this.loyalty.getMyHistory({ limit: POINTS_PAGE_SIZE }).catch(() => emptyHistory),
      ]);
      console.debug('[account] profile fetched', profile);
      this.myOrders.set(orders.rows);
      this.ordersTotal.set(orders.total);
      this.pointsHistory.set(pointsHistory.rows);
      this.pointsTotal.set(pointsHistory.total);
      if (profile) {
        const addr = profile.default_shipping_address;
        this.personalForm.patchValue({
          full_name: profile.full_name ?? '',
          phone: profile.phone ?? '',
        });
        this.addressForm.patchValue({
          line1: addr?.line1 ?? '',
          line2: addr?.line2 ?? '',
          city: addr?.city ?? '',
          province: addr?.province ?? '',
          address_notes: addr?.notes ?? '',
        });
      }
      this.personalForm.markAsPristine();
      this.addressForm.markAsPristine();
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

  /** Rail nav: switch the content area to the chosen panel. Every panel has a
   *  matching route (refresh/deep-link safe), but switching here only
   *  replaceState()s the URL — a router navigation would recreate the
   *  component and re-fire the bootstrap fetches. */
  protected select(view: AccountView): void {
    this.view.set(view);
    this.location.replaceState(view === 'datos' ? '/account' : `/account/${view}`);
    // Mobile (single-column) only: the rail sits above the content, so bring
    // the freshly rendered panel into view. Deferred to the next render so the
    // new panel exists before we scroll.
    if (this.isBrowser && window.matchMedia('(max-width: 900px)').matches) {
      afterNextRender(
        () =>
          this.contentEl()?.nativeElement.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          }),
        { injector: this.injector },
      );
    }
  }

  /** Current orders date filter as inclusive UTC bounds for the service. */
  private ordersRange(): { from?: string; to?: string } {
    return dayBounds(this.ordersFrom(), this.ordersTo());
  }

  private pointsRange(): { from?: string; to?: string } {
    return dayBounds(this.pointsFrom(), this.pointsTo());
  }

  /** Date filter changed: restart the orders list from page one. */
  protected async reloadOrders(): Promise<void> {
    this.ordersLoadingMore.set(true);
    try {
      const { rows, total } = await this.orders.getMyOrders({
        limit: ORDERS_PAGE_SIZE,
        ...this.ordersRange(),
      });
      this.myOrders.set(rows);
      this.ordersTotal.set(total);
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.ordersLoadingMore.set(false);
    }
  }

  /** "Cargar más" on the orders panel: append the next page. */
  protected async loadMoreOrders(): Promise<void> {
    if (this.ordersLoadingMore() || !this.ordersHasMore()) return;
    this.ordersLoadingMore.set(true);
    try {
      const { rows, total } = await this.orders.getMyOrders({
        limit: ORDERS_PAGE_SIZE,
        offset: this.myOrders().length,
        ...this.ordersRange(),
      });
      this.myOrders.update((cur) => [...cur, ...rows]);
      this.ordersTotal.set(total);
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.ordersLoadingMore.set(false);
    }
  }

  /** Date filter changed: restart the points history from page one. */
  protected async reloadPoints(): Promise<void> {
    this.pointsLoadingMore.set(true);
    try {
      const { rows, total } = await this.loyalty.getMyHistory({
        limit: POINTS_PAGE_SIZE,
        ...this.pointsRange(),
      });
      this.pointsHistory.set(rows);
      this.pointsTotal.set(total);
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.pointsLoadingMore.set(false);
    }
  }

  /** "Cargar más" on the points panel: append the next page. */
  protected async loadMorePoints(): Promise<void> {
    if (this.pointsLoadingMore() || !this.pointsHasMore()) return;
    this.pointsLoadingMore.set(true);
    try {
      const { rows, total } = await this.loyalty.getMyHistory({
        limit: POINTS_PAGE_SIZE,
        offset: this.pointsHistory().length,
        ...this.pointsRange(),
      });
      this.pointsHistory.update((cur) => [...cur, ...rows]);
      this.pointsTotal.set(total);
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.pointsLoadingMore.set(false);
    }
  }

  /** Falls back to a kind label when a transaction has no description. */
  protected pointsLabel(tx: LoyaltyTransactionRow): string {
    if (tx.description) return tx.description;
    switch (tx.kind) {
      case 'earn':     return 'Puntos ganados';
      case 'reversal': return 'Puntos revertidos';
      case 'adjust':   return 'Ajuste';
      case 'redeem':   return 'Poke-Monedas canjeadas';
    }
  }

  /** A Pokéball was opened inside the Pokédex view — the balance signal is
   *  already fresh (LoyaltyService), but the history list needs a re-fetch so
   *  the new 'redeem' row shows when the user switches to the Puntos panel.
   *  Resets to the first page (keeping any active date filter) so the new row
   *  lands on top. */
  protected async onCoinsSpent(): Promise<void> {
    try {
      const { rows, total } = await this.loyalty.getMyHistory({
        limit: POINTS_PAGE_SIZE,
        ...this.pointsRange(),
      });
      this.pointsHistory.set(rows);
      this.pointsTotal.set(total);
    } catch {
      // Non-critical — history refreshes on the next full page load.
    }
  }

  /** Save just the personal-data slice (name + phone). */
  protected async savePersonal(): Promise<void> {
    if (this.personalForm.invalid || this.savingPersonal()) return;
    this.savingPersonal.set(true);
    try {
      const raw = this.personalForm.getRawValue();
      await this.profiles.updateMine({
        full_name: raw.full_name?.trim() || null,
        phone: raw.phone?.trim() || null,
      });
      this.personalForm.markAsPristine();
      this.snack.open('Datos actualizados', 'OK', { duration: 3000 });
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.savingPersonal.set(false);
    }
  }

  /** Save just the shipping-address slice. */
  protected async saveAddress(): Promise<void> {
    if (this.addressForm.invalid || this.savingAddress()) return;
    this.savingAddress.set(true);
    try {
      const raw = this.addressForm.getRawValue();
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
      await this.profiles.updateMine({ default_shipping_address: address });
      this.addressForm.markAsPristine();
      this.snack.open('Dirección actualizada', 'OK', { duration: 3000 });
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.savingAddress.set(false);
    }
  }

  /** Open the avatar picker; on a new selection it's saved immediately (a
   *  discrete action, kept out of the name/address section save buttons). The
   *  open + persist logic lives in AvatarPickerService, shared with the
   *  post-login prompt. */
  protected openAvatarPicker(): void {
    this.avatarPicker.openAndSave(this.profiles.avatarPokemonNumber());
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
