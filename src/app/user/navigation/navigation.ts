import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';

interface NavItem {
  readonly label: string;
  readonly icon: string;
  readonly path: string;
  readonly exact?: boolean;
}

@Component({
  selector: 'app-navigation',
  imports: [RouterLink, RouterLinkActive, MatListModule, MatIconModule],
  templateUrl: './navigation.html',
  styleUrl: './navigation.scss',
})
export class Navigation {
  protected readonly items: readonly NavItem[] = [
    { label: 'Home', icon: 'home', path: '/', exact: true },
    { label: 'Cartas', icon: 'style', path: '/products' },
    { label: 'Carrito', icon: 'shopping_cart', path: '/cart' },
    { label: 'Mi cuenta', icon: 'person', path: '/account' },
    { label: 'Library', icon: 'palette', path: '/library' },
    { label: 'Admin', icon: 'admin_panel_settings', path: '/admin' },
  ];
}
