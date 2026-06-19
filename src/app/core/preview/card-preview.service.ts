import { inject, Injectable, signal } from '@angular/core';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
} from '@angular/router';

export interface CardPreview {
  imageUrl: string;
  name: string;
  illustrator: string | null;
  /** Bounding rect of the .card-image host that triggered the preview.
   *  Used by the overlay component to position itself next to the card. */
  anchor: DOMRect;
}

/**
 * App-level singleton that holds the currently-previewed card. The hover
 * directive on each card image calls `show()` / `hide()`; one shared overlay
 * component reads `current()` and renders. Debounced so quick mouse passes
 * across many cards don't flicker.
 */
@Injectable({ providedIn: 'root' })
export class CardPreviewService {
  // Long enough to ignore drive-by hovers, short enough to feel responsive.
  private static readonly SHOW_DELAY_MS = 180;

  readonly current = signal<CardPreview | null>(null);
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  // True for the full duration of an in-flight navigation. A hover that begins
  // mid-navigation must not schedule a preview: its source card gets torn down
  // before its `mouseleave` can fire, leaving the overlay stuck on the next
  // page. `NavigationStart` alone can't catch that — it fires once, before the
  // stray hover — so we suppress shows until the navigation settles.
  private navigating = false;

  constructor() {
    // Clicking a card navigates away, tearing down the listing before its
    // `mouseleave` fires — so the overlay (which lives in the persistent
    // UserShell) would otherwise stay on screen. Dismiss on any route change,
    // and gate `show()` for the whole navigation (reset on cancel/error too,
    // or a failed navigation would suppress previews forever).
    inject(Router).events.subscribe((e) => {
      if (e instanceof NavigationStart) {
        this.navigating = true;
        this.hide();
      } else if (
        e instanceof NavigationEnd ||
        e instanceof NavigationCancel ||
        e instanceof NavigationError
      ) {
        this.navigating = false;
      }
    });
  }

  show(next: CardPreview): void {
    if (this.navigating) return;
    if (this.pendingTimer !== null) clearTimeout(this.pendingTimer);
    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = null;
      if (this.navigating) return;
      this.current.set(next);
    }, CardPreviewService.SHOW_DELAY_MS);
  }

  hide(): void {
    if (this.pendingTimer !== null) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    this.current.set(null);
  }
}
