import { Directive, ElementRef, HostListener, inject, input } from '@angular/core';
import { CardPreviewService } from '../../core/preview/card-preview.service';

/**
 * Attach to a card-image host element on listing pages. On mouseenter,
 * triggers the shared `CardPreviewService` to show a hover overlay with
 * the card art at full size. Skipped entirely on touch-only devices via
 * `(hover: hover)` media query.
 */
@Directive({
  selector: '[appCardPreview]',
  standalone: true,
})
export class CardPreviewDirective {
  // Minimal shape. Both ProductRow and ProductSearchRow satisfy this
  // structurally, so consumers don't need to share a row interface.
  readonly appCardPreview = input.required<{
    image_url: string | null;
    name: string;
    illustrator: string | null;
  }>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly service = inject(CardPreviewService);
  private readonly hoverCapable =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover)').matches;

  @HostListener('mouseenter')
  onEnter(): void {
    if (!this.hoverCapable) return;
    const card = this.appCardPreview();
    if (!card.image_url) return;
    this.service.show({
      imageUrl: card.image_url,
      name: card.name,
      illustrator: card.illustrator,
      anchor: this.host.nativeElement.getBoundingClientRect(),
    });
  }

  @HostListener('mouseleave')
  onLeave(): void {
    if (!this.hoverCapable) return;
    this.service.hide();
  }
}
