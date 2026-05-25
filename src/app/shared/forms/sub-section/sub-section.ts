import { Component, input } from '@angular/core';

/** Inner group within an app-form-section. Optional mono kicker + hairline divider. */
@Component({
  selector: 'app-sub-section',
  template: `
    <div class="ss" [class.ss--divider]="divider()">
      @if (kicker()) {
        <div class="ss__kicker">{{ kicker() }}</div>
      }
      <ng-content />
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .ss--divider {
        margin-top: 22px;
        padding-top: 22px;
        border-top: 1px solid var(--border-subtle);
      }
      .ss__kicker {
        margin-bottom: 14px;
        font-family: var(--font-mono);
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 1.6px;
        text-transform: uppercase;
        color: var(--text-tertiary);
      }
    `,
  ],
})
export class SubSection {
  readonly kicker = input<string | null>(null);
  readonly divider = input(false);
}
