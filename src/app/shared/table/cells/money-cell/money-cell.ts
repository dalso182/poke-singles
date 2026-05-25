import { Component, input } from '@angular/core';

/**
 * Money cell — ₡ + es-CR thousands. When `original` is set the value is the sale
 * price (Amber Glow, per the brand sale-price rule) with the original struck
 * through beside it. This folds Productos' existing sale-price display into the
 * shared primitive rather than leaving it as per-screen CSS.
 */
@Component({
  selector: 'app-money',
  template: `
    <span class="money" [class.money--sale]="original() != null">₡{{ fmt(value()) }}</span>
    @if (original() != null) {
      <span class="money__orig">₡{{ fmt(original()!) }}</span>
    }
  `,
  styles: [
    `
      .money {
        font-family: var(--font-mono);
        font-size: 12.5px;
        font-weight: 700;
        letter-spacing: 0.2px;
        color: var(--text-primary);
      }
      .money--sale {
        color: var(--accent-amber);
      }
      .money__orig {
        margin-left: 6px;
        font-family: var(--font-mono);
        font-size: 10.5px;
        font-weight: 500;
        color: var(--text-tertiary);
        text-decoration: line-through;
      }
    `,
  ],
})
export class Money {
  readonly value = input.required<number>();
  readonly original = input<number | null>(null);

  protected fmt(n: number): string {
    return n.toLocaleString('es-CR');
  }
}
