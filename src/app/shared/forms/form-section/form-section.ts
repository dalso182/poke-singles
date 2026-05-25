import { Component, input } from '@angular/core';

/** Card wrapping one section of a form (optional kicker/title/subtitle + body). */
@Component({
  selector: 'app-form-section',
  template: `
    <section class="fs" [style.padding.px]="padding()">
      @if (kicker() || title() || subtitle()) {
        <header class="fs__head">
          @if (kicker()) {
            <div class="fs__kicker">{{ kicker() }}</div>
          }
          @if (title()) {
            <h2 class="fs__title">{{ title() }}</h2>
          }
          @if (subtitle()) {
            <p class="fs__sub">{{ subtitle() }}</p>
          }
        </header>
      }
      <ng-content />
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .fs {
        background: var(--surface-card);
        border: 1px solid var(--border-subtle);
        border-radius: 14px;
        box-shadow:
          0 1px 0 rgba(21, 21, 26, 0.02),
          0 8px 24px -16px rgba(21, 21, 26, 0.08);
      }
      .fs__head {
        margin-bottom: 22px;
      }
      .fs__kicker {
        margin-bottom: 6px;
        font-family: var(--font-mono);
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 1.6px;
        text-transform: uppercase;
        color: var(--accent-amber);
      }
      .fs__title {
        margin: 0;
        font-family: var(--font-brand);
        font-size: 20px;
        font-weight: 800;
        letter-spacing: -0.5px;
        color: var(--text-primary);
      }
      .fs__sub {
        margin: 6px 0 0;
        max-width: 640px;
        font-family: var(--font-brand);
        font-size: 13px;
        font-weight: 500;
        line-height: 1.5;
        letter-spacing: -0.05px;
        color: var(--text-secondary);
      }
    `,
  ],
})
export class FormSection {
  readonly kicker = input<string | null>(null);
  readonly title = input<string | null>(null);
  readonly subtitle = input<string | null>(null);
  readonly padding = input(28);
}
