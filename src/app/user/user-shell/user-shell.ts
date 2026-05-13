import { Component, DestroyRef, ViewChild, inject, signal } from '@angular/core';
import { Router, RouterOutlet, Scroll } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatSidenavContent, MatSidenavModule } from '@angular/material/sidenav';
import { Header } from '../header/header';
import { Navigation } from '../navigation/navigation';
import { Footer } from '../footer/footer';
import { CardPreviewOverlay } from '../../shared/card-preview/card-preview-overlay';
import { CartDrawer } from '../cart-drawer/cart-drawer';
import { CartService } from '../../core/cart/cart.service';
import { WelcomeDialogService } from '../../core/preview/welcome-dialog.service';

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
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly sidenavOpen = signal(true);
  protected readonly cartDrawerOpen = this.cart.drawerOpen;

  // The actual scroll region lives inside <mat-sidenav-content> (the user-shell
  // is height-locked to 100vh - header). Angular's withInMemoryScrolling only
  // touches the document scroller, so we manually reset this nested one on
  // forward navigation. Anchor scrolling and back/forward restoration aren't
  // wired here — they can be added later if needed.
  @ViewChild(MatSidenavContent) private content?: MatSidenavContent;

  constructor() {
    this.router.events
      .pipe(
        filter(
          (e): e is Scroll => e instanceof Scroll,
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((e) => {
        // Only scroll to top on a fresh navigation (no anchor / no
        // back-forward position to restore).
        if (!e.position && !e.anchor) {
          this.content?.getElementRef().nativeElement.scrollTo({ top: 0, left: 0 });
        }
      });

    // Auto-show the welcome modal on first visit. Service handles all the
    // gating (localStorage flag + page-content check); no-op for repeat
    // visitors and when the admin hasn't written copy yet.
    void inject(WelcomeDialogService).maybeOpen();
  }

  protected toggleSidenav(): void {
    this.sidenavOpen.update((open) => !open);
  }

  protected onCartDrawerClosed(): void {
    this.cart.closeDrawer();
  }
}
