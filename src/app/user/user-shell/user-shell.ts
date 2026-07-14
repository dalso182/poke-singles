import {
  Component,
  DestroyRef,
  HostListener,
  NgZone,
  PLATFORM_ID,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, RouterOutlet, Scroll } from '@angular/router';
import { filter, map } from 'rxjs';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';
import {
  MatSidenavContainer,
  MatSidenavContent,
  MatSidenavModule,
} from '@angular/material/sidenav';
import { Header } from '../header/header';
import { Navigation } from '../navigation/navigation';
import { Footer } from '../footer/footer';
import { CardPreviewOverlay } from '../../shared/card-preview/card-preview-overlay';
import { CartDrawer } from '../cart-drawer/cart-drawer';
import { CartService } from '../../core/cart/cart.service';
import { LocalStorageService } from '../../core/storage/local-storage.service';
import { AnnouncementModalService } from '../../core/announcements/announcement-modal.service';
import { PresenceService } from '../../core/presence/presence.service';
import { AvatarPickerService } from '../account/avatar-picker/avatar-picker.service';

/** Below this width the rail is dropped for a slide-over drawer. */
const HANDSET_QUERY = '(max-width: 719.98px)';
/** Persisted desktop rail state (expanded panel vs icon rail). */
const NAV_EXPANDED_KEY = 'pokesingles.nav.expanded';

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
  private readonly storage = inject(LocalStorageService);
  private readonly zone = inject(NgZone);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Handset = nav becomes an `over` drawer (no rail). */
  protected readonly isHandset = toSignal(
    inject(BreakpointObserver)
      .observe(HANDSET_QUERY)
      .pipe(map((r) => r.matches)),
    { initialValue: false },
  );

  /** Desktop rail: expanded (264px) vs collapsed (76px). Persisted; default collapsed. */
  private readonly railExpanded = signal(this.storage.get(NAV_EXPANDED_KEY) === '1');
  /** Handset overlay open/closed. */
  private readonly mobileOpen = signal(false);

  protected readonly navMode = computed(() => (this.isHandset() ? 'over' : 'side'));
  // Desktop rail is always visible (it changes width); on handset it opens/closes.
  protected readonly navOpened = computed(() =>
    this.isHandset() ? this.mobileOpen() : true,
  );
  // The mobile drawer always shows the full labeled panel.
  protected readonly navExpanded = computed(() =>
    this.isHandset() ? true : this.railExpanded(),
  );

  protected readonly cartDrawerOpen = this.cart.drawerOpen;

  // The actual scroll region lives inside <mat-sidenav-content> (the user-shell
  // is height-locked to 100vh - header). Angular's withInMemoryScrolling only
  // touches the document scroller, so we manually reset this nested one on
  // forward navigation. Anchor scrolling and back/forward restoration aren't
  // wired here — they can be added later if needed.
  @ViewChild(MatSidenavContent) private content?: MatSidenavContent;
  @ViewChild(MatSidenavContainer) private sidenavContainer?: MatSidenavContainer;

  constructor() {
    // The rail width is animated by CSS (260ms). Material only recomputes the
    // content's left margin on change detection, which doesn't fire per-frame
    // during a pure CSS transition — so the content would lag/overlap. Drive
    // `updateContentMargins()` every frame for the duration so the page reflows
    // in lockstep with the animating rail. Runs whenever the expanded state
    // (toggle or responsive mode switch) changes.
    effect(() => {
      this.navExpanded();
      this.animateContentReflow();
    });

    this.router.events
      .pipe(
        filter((e): e is Scroll => e instanceof Scroll),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((e) => {
        // Close the mobile drawer after navigating (it overlays content).
        if (this.isHandset()) this.mobileOpen.set(false);
        // Only scroll to top on a fresh navigation (no anchor / no
        // back-forward position to restore).
        if (!e.position && !e.anchor) {
          this.content?.getElementRef().nativeElement.scrollTo({ top: 0, left: 0 });
        }
      });

    // Activate the announcement modal (shown once per person; admin-managed
    // at /admin/announcements). The service handles all the gating: active
    // row, per-user DB flag, guest localStorage flag, guest→login sync.
    inject(AnnouncementModalService);

    // Announce this shopper on the presence channel so the admin dashboard's
    // "people online" tile can count them. Browser-guarded inside the service.
    inject(PresenceService).joinAsVisitor();

    // Activate the post-login prompt that auto-opens the favorite-Pokémon picker
    // for a freshly signed-in customer who hasn't chosen one. Instantiating it
    // here scopes the prompt to the storefront (not the admin shell); the service
    // is root-provided so its dedupe state survives this shell remounting.
    inject(AvatarPickerService);
  }

  protected toggleSidenav(): void {
    if (this.isHandset()) {
      this.mobileOpen.update((open) => !open);
    } else {
      this.railExpanded.update((open) => {
        const next = !open;
        this.storage.set(NAV_EXPANDED_KEY, next ? '1' : '0');
        return next;
      });
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.isHandset()) {
      this.mobileOpen.set(false);
    } else if (this.railExpanded()) {
      this.railExpanded.set(false);
      this.storage.set(NAV_EXPANDED_KEY, '0');
    }
  }

  // Keep the signal in sync when Material closes the drawer itself (backdrop
  // tap / Esc in `over` mode). No-op on desktop where the rail is always open.
  protected onNavOpenedChange(open: boolean): void {
    if (this.isHandset()) this.mobileOpen.set(open);
  }

  protected onCartDrawerClosed(): void {
    this.cart.closeDrawer();
  }

  /** Re-measure the content margin each frame while the rail width animates. */
  private animateContentReflow(): void {
    if (!this.isBrowser) return;
    const container = this.sidenavContainer;
    if (!container) return; // not yet rendered (first effect run) — Material sets the initial margin
    this.zone.runOutsideAngular(() => {
      const start = performance.now();
      const step = (now: number): void => {
        container.updateContentMargins();
        if (now - start < 300) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }
}
