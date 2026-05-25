import { Component, computed, input } from '@angular/core';

/** Stock count with a low/out dot. Out-of-stock uses --danger (not brand red). */
@Component({
  selector: 'app-stock',
  template: `
    <span class="stock" [attr.data-state]="state()">
      @if (state() !== 'ok') {
        <span class="stock__dot"></span>
      }
      {{ value() }}
    </span>
  `,
  styles: [
    `
      .stock {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-family: var(--font-mono);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.4px;
        color: var(--text-primary);
      }
      .stock__dot {
        width: 6px;
        height: 6px;
        border-radius: 999px;
      }
      [data-state='out'] {
        color: var(--danger);
      }
      [data-state='out'] .stock__dot {
        background: var(--danger);
        box-shadow: 0 0 0 3px #fee2e2;
      }
      [data-state='low'] {
        color: var(--amber-text);
      }
      [data-state='low'] .stock__dot {
        background: var(--accent-amber);
        box-shadow: 0 0 0 3px var(--accent-amber-soft);
      }
    `,
  ],
})
export class Stock {
  readonly value = input.required<number>();
  readonly low = input(3);

  protected readonly state = computed<'ok' | 'low' | 'out'>(() => {
    const v = this.value();
    if (v <= 0) return 'out';
    if (v <= this.low()) return 'low';
    return 'ok';
  });
}
