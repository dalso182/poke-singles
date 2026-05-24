import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/auth/auth.service';
import { SocialIcons } from '../../shared/social-icons/social-icons';

interface NavItem {
  readonly label: string;
  readonly icon: string;
  readonly path: string;
  readonly exact?: boolean;
}

@Component({
  selector: 'app-navigation',
  imports: [RouterLink, RouterLinkActive, MatListModule, MatIconModule, SocialIcons],
  templateUrl: './navigation.html',
  styleUrl: './navigation.scss',
})
export class Navigation {
  private readonly auth = inject(AuthService);

  protected readonly items = computed<readonly NavItem[]>(() => {
    const base: NavItem[] = [
      { label: 'Home', icon: 'home', path: '/', exact: true },
      { label: 'Cartas', icon: 'style', path: '/products' },
      { label: 'Rifas', icon: 'confirmation_number', path: '/rifas' },
      { label: 'Carrito', icon: 'shopping_cart', path: '/cart' },
      { label: 'Mi cuenta', icon: 'person', path: '/account' },
    ];
    if (this.auth.isAdmin()) {
      base.push({ label: 'Admin', icon: 'admin_panel_settings', path: '/admin' });
    }
    return base;
  });
}
