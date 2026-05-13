import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../core/auth/auth.service';

interface AdminNavItem {
  readonly label: string;
  readonly icon: string;
  readonly path: string;
  readonly exact?: boolean;
}

@Component({
  selector: 'app-admin-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
  ],
  templateUrl: './admin-shell.html',
  styleUrl: './admin-shell.scss',
})
export class AdminShell {
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  protected readonly sidenavOpen = signal(true);
  protected readonly currentUser = this.auth.currentUser;
  protected readonly isSignedIn = this.auth.isSignedIn;
  protected readonly isAdmin = this.auth.isAdmin;
  protected readonly items: readonly AdminNavItem[] = [
    { label: 'Dashboard',        icon: 'dashboard',            path: '/admin',              exact: true },
    { label: 'Agregar producto', icon: 'add_box',              path: '/admin/products/new', exact: true },
    { label: 'Productos',        icon: 'inventory_2',          path: '/admin/products',     exact: true },
    { label: 'Categorías', icon: 'category', path: '/admin/categories' },
    { label: 'Tipos de carta', icon: 'local_offer', path: '/admin/card-types' },
    { label: 'Cupones', icon: 'redeem', path: '/admin/coupons' },
    { label: 'Métodos de envío', icon: 'local_shipping', path: '/admin/shipping-methods' },
    { label: 'Sets', icon: 'collections_bookmark', path: '/admin/sets' },
    { label: 'Pedidos', icon: 'receipt_long', path: '/admin/orders' },
    { label: 'Clientes', icon: 'group', path: '/admin/customers' },
    { label: 'Páginas', icon: 'article', path: '/admin/pages' },
    { label: 'Configuración', icon: 'settings', path: '/admin/config' },
  ];

  protected toggleSidenav(): void {
    this.sidenavOpen.update((open) => !open);
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
