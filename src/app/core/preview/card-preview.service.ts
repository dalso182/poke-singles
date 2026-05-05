import { Injectable, signal } from '@angular/core';

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

  show(next: CardPreview): void {
    if (this.pendingTimer !== null) clearTimeout(this.pendingTimer);
    this.pendingTimer = setTimeout(() => {
      this.current.set(next);
      this.pendingTimer = null;
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
