import { Component, input } from '@angular/core';

/** Status pill. `red` tone uses --danger (NOT --brand-red) per the brand rule. */
@Component({
  selector: 'app-pill',
  template: `
    <span class="pill" [attr.data-tone]="tone()">
      @if (dot()) {
        <span class="pill__dot"></span>
      }
      <ng-content />
    </span>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-family: var(--font-mono);
        font-size: 9.5px;
        font-weight: 700;
        letter-spacing: 0.6px;
        text-transform: uppercase;
        white-space: nowrap;
        padding: 3px 8px;
        border-radius: 4px;
        border: 1px solid;
      }
      .pill__dot {
        width: 5px;
        height: 5px;
        border-radius: 999px;
        background: currentColor;
      }
      [data-tone='neutral'] {
        background: var(--surface-tonal);
        color: var(--text-secondary);
        border-color: var(--border-subtle);
      }
      [data-tone='green'] {
        background: var(--green-soft);
        color: var(--success);
        border-color: var(--green-edge);
      }
      [data-tone='amber'] {
        background: var(--accent-amber-soft);
        color: var(--amber-text);
        border-color: var(--amber-edge);
      }
      [data-tone='red'] {
        background: #fee2e2;
        color: var(--danger);
        border-color: #f3c7c7;
      }
      [data-tone='blue'] {
        background: var(--brand-blue-soft);
        color: var(--brand-blue);
        border-color: var(--brand-blue-edge);
      }
      [data-tone='ink'] {
        background: var(--text-primary);
        color: #fff;
        border-color: var(--text-primary);
      }
    `,
  ],
})
export class Pill {
  readonly tone = input<'neutral' | 'green' | 'amber' | 'red' | 'blue' | 'ink'>('neutral');
  readonly dot = input(false);
}
