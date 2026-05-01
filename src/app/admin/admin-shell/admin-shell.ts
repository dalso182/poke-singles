import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

interface AdminNavItem {
  readonly label: string;
  readonly icon: string;
  readonly path: string;
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
  ],
  templateUrl: './admin-shell.html',
  styleUrl: './admin-shell.scss',
})
export class AdminShell {
  protected readonly sidenavOpen = signal(true);
  protected readonly items: readonly AdminNavItem[] = [
    { label: 'Dashboard', icon: 'dashboard', path: '/admin' },
    { label: 'Productos', icon: 'inventory_2', path: '/admin/products' },
    { label: 'Pedidos', icon: 'receipt_long', path: '/admin/orders' },
    { label: 'Clientes', icon: 'group', path: '/admin/customers' },
  ];

  protected toggleSidenav(): void {
    this.sidenavOpen.update((open) => !open);
  }
}
