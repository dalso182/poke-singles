import { Component, computed, inject } from '@angular/core';
import { CardPreviewService } from '../../core/preview/card-preview.service';

const OVERLAY_WIDTH = 336;
const OVERLAY_HEIGHT = 552; // image (~470) + credit line + padding
const ANCHOR_GAP = 12;
const VIEWPORT_PADDING = 8;

interface OverlayPosition {
  left: number;
  top: number;
}

@Component({
  selector: 'app-card-preview-overlay',
  standalone: true,
  imports: [],
  templateUrl: './card-preview-overlay.html',
  styleUrl: './card-preview-overlay.scss',
})
export class CardPreviewOverlay {
  protected readonly preview = inject(CardPreviewService).current;

  /** Computes a viewport-clamped position next to the anchor rect. Default
   *  is to the right; flips left if right would overflow; top is centered
   *  on the anchor and clamped to the viewport. */
  protected readonly position = computed<OverlayPosition | null>(() => {
    const p = this.preview();
    if (!p) return null;

    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;

    const anchor = p.anchor;
    const rightEdge = anchor.right + ANCHOR_GAP + OVERLAY_WIDTH;
    const placeRight = rightEdge <= vw - VIEWPORT_PADDING;

    const left = placeRight
      ? anchor.right + ANCHOR_GAP
      : Math.max(VIEWPORT_PADDING, anchor.left - ANCHOR_GAP - OVERLAY_WIDTH);

    const desiredTop = anchor.top + anchor.height / 2 - OVERLAY_HEIGHT / 2;
    const maxTop = vh - VIEWPORT_PADDING - OVERLAY_HEIGHT;
    const top = Math.max(VIEWPORT_PADDING, Math.min(maxTop, desiredTop));

    return { left, top };
  });
}
