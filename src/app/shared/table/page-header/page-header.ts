import { Component, input } from '@angular/core';

/** Standard list-screen header: amber kicker, big title, sub, projected actions. */
@Component({
  selector: 'app-page-header',
  template: `
    <div class="ph">
      <div class="ph__text">
        @if (kicker()) {
          <div class="ph__kicker">{{ kicker() }}</div>
        }
        <h1 class="ph__title">{{ title() }}</h1>
        @if (sub()) {
          <div class="ph__sub">{{ sub() }}</div>
        }
      </div>
      <div class="ph__actions"><ng-content /></div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .ph {
        display: flex;
        align-items: flex-end;
        gap: 16px;
        margin-bottom: 20px;
      }
      .ph__text {
        flex: 1;
        min-width: 0;
      }
      .ph__kicker {
        font-family: var(--font-mono);
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 1.8px;
        text-transform: uppercase;
        color: var(--accent-amber);
      }
      .ph__title {
        margin: 8px 0 6px;
        font-family: var(--font-brand);
        font-size: 32px;
        font-weight: 800;
        letter-spacing: -1px;
        color: var(--text-primary);
      }
      .ph__sub {
        font-family: var(--font-brand);
        font-size: 13.5px;
        font-weight: 500;
        color: var(--text-secondary);
      }
      .ph__actions {
        display: flex;
        gap: 8px;
      }
    `,
  ],
})
export class PageHeader {
  readonly kicker = input<string | null>(null);
  readonly title = input.required<string>();
  readonly sub = input<string | null>(null);
}
