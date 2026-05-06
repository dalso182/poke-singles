import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { Header } from '../header/header';
import { Navigation } from '../navigation/navigation';
import { Footer } from '../footer/footer';
import { CardPreviewOverlay } from '../../shared/card-preview/card-preview-overlay';
import { CartDrawer } from '../cart-drawer/cart-drawer';
import { CartService } from '../../core/cart/cart.service';

@Component({
  selector: 'app-user-shell',
  imports: [
    RouterOutlet,
    MatSidenavModule,
    Header,
    Navigation,
    Footer,
    CardPreviewOverlay,
    CartDrawer,
  ],
  templateUrl: './user-shell.html',
  styleUrl: './user-shell.scss',
})
export class UserShell {
  private readonly cart = inject(CartService);

  protected readonly sidenavOpen = signal(true);
  protected readonly cartDrawerOpen = this.cart.drawerOpen;

  protected toggleSidenav(): void {
    this.sidenavOpen.update((open) => !open);
  }

  protected onCartDrawerClosed(): void {
    this.cart.closeDrawer();
  }
}
