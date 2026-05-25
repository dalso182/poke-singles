import {
  Component,
  ElementRef,
  HostListener,
  OnInit,
  Signal,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../core/auth/auth.service';
import { ProductsService } from '../../core/catalog/products.service';
import { SetsService } from '../../core/catalog/sets.service';
import { CouponsService } from '../../core/catalog/coupons.service';
import { RafflesService } from '../../core/catalog/raffles.service';
import { OrdersService } from '../../core/orders/orders.service';

interface AdminNavItem {
  readonly label: string;
  readonly icon: string;
  readonly path: string;
  readonly exact?: boolean;
  /** Live count badge source. Renders only once it resolves (non-null). */
  readonly count?: Signal<number | null>;
  /** `amber` = actionable backlog (Pedidos). Default neutral = informational. */
  readonly badgeTone?: 'neutral' | 'amber';
}

@Component({
  selector: 'app-admin-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    DecimalPipe,
    MatToolbarModule,
    MatSidenavModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
  ],
  templateUrl: './admin-shell.html',
  styleUrl: './admin-shell.scss',
})
export class AdminShell implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly products = inject(ProductsService);
  private readonly sets = inject(SetsService);
  private readonly coupons = inject(CouponsService);
  private readonly raffles = inject(RafflesService);
  private readonly orders = inject(OrdersService);

  protected readonly sidenavOpen = signal(true);
  protected readonly currentUser = this.auth.currentUser;
  protected readonly isSignedIn = this.auth.isSignedIn;
  protected readonly isAdmin = this.auth.isAdmin;

  private readonly searchInput =
    viewChild<ElementRef<HTMLInputElement>>('searchInput');

  // Nav badge counts — null until their fetch resolves, so no badge flashes
  // a zero on first paint.
  protected readonly productCount = signal<number | null>(null);
  protected readonly raffleCount = signal<number | null>(null);
  protected readonly couponCount = signal<number | null>(null);
  protected readonly setCount = signal<number | null>(null);
  protected readonly pendingOrderCount = signal<number | null>(null);

  // Top-bar notifications. No notification feed exists yet, so this stays 0
  // (no badge) until one is wired.
  protected readonly unreadNotifications = signal(0);

  // "Tienda en línea" status card. Live visitor/cart metrics need an
  // analytics/realtime source that doesn't exist yet; until then both stay
  // null and the card shows a link to the live storefront instead of fake
  // numbers. Wire these to flip the card to the metrics line automatically.
  protected readonly onlineVisitors = signal<number | null>(null);
  protected readonly cartsActive = signal<number | null>(null);

  protected readonly items: readonly AdminNavItem[] = [
    { label: 'Dashboard', icon: 'dashboard', path: '/admin', exact: true },
    { label: 'Agregar producto', icon: 'add_box', path: '/admin/products/new', exact: true },
    { label: 'Productos', icon: 'sell', path: '/admin/products', exact: true, count: this.productCount },
    { label: 'Rifas', icon: 'confirmation_number', path: '/admin/raffles', count: this.raffleCount },
    { label: 'Categorías', icon: 'category', path: '/admin/categories' },
    { label: 'Filtros', icon: 'tune', path: '/admin/filters' },
    { label: 'Cupones', icon: 'local_offer', path: '/admin/coupons', count: this.couponCount },
    { label: 'Métodos de envío', icon: 'local_shipping', path: '/admin/shipping-methods' },
    { label: 'Sets', icon: 'collections_bookmark', path: '/admin/sets', count: this.setCount },
    { label: 'Pedidos', icon: 'receipt_long', path: '/admin/orders', count: this.pendingOrderCount, badgeTone: 'amber' },
    { label: 'Clientes', icon: 'groups', path: '/admin/customers' },
    { label: 'Reportes', icon: 'analytics', path: '/admin/reports' },
    { label: 'Páginas', icon: 'description', path: '/admin/pages' },
    { label: 'Library', icon: 'palette', path: '/library', exact: true },
    { label: 'Configuración', icon: 'settings', path: '/admin/config' },
  ];

  ngOnInit(): void {
    // Cheap, parallel count fetches for the nav badges. Each is best-effort —
    // a failure just leaves its badge hidden rather than blocking the shell.
    void this.products
      .list({ page: 1, pageSize: 1 })
      .then((r) => this.productCount.set(r.total))
      .catch(() => {});
    void this.sets
      .list()
      .then((rows) => this.setCount.set(rows.length))
      .catch(() => {});
    void this.coupons
      .list()
      .then((rows) => this.couponCount.set(rows.length))
      .catch(() => {});
    void this.raffles
      .listSummary()
      .then((rows) =>
        this.raffleCount.set(rows.filter((r) => r.status === 'scheduled').length),
      )
      .catch(() => {});
    void this.orders
      .countPendingOrders()
      .then((n) => this.pendingOrderCount.set(n))
      .catch(() => {});
  }

  protected toggleSidenav(): void {
    this.sidenavOpen.update((open) => !open);
  }

  /** Cmd/Ctrl + K focuses the global search. Routed through Angular's event
   *  manager (no direct document access), so it stays SSR-safe. */
  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.searchInput()?.nativeElement.focus();
    }
  }

  protected notificationsAriaLabel(): string {
    const n = this.unreadNotifications();
    return n > 0 ? `Notificaciones (${n} sin leer)` : 'Notificaciones';
  }

  protected openNotifications(): void {
    // No notification feed yet — stubbed per the nav handoff.
    this.snack.open('Notificaciones — próximamente', 'OK', { duration: 2500 });
  }

  protected async openLogin(): Promise<void> {
    const { LoginDialog } = await import('../../auth/login-dialog/login-dialog');
    this.dialog.open(LoginDialog, {
      panelClass: 'login-dialog-panel',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });
  }

  protected async signOut(): Promise<void> {
    const { error } = await this.auth.signOut();
    if (error) {
      this.snack.open(error, 'OK', { duration: 4000 });
    } else {
      this.snack.open('Sesión cerrada', 'OK', { duration: 2500 });
    }
  }

  protected userDisplayName(): string {
    const user = this.currentUser();
    if (!user) return '';
    return (
      (user.user_metadata?.['full_name'] as string | undefined) ||
      user.email ||
      'Usuario'
    );
  }
}
