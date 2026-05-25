import { Component, input, model } from '@angular/core';

export interface TabItem {
  readonly key: string;
  readonly label: string;
  /** Optional count badge; renders when not null/undefined. */
  readonly count?: number | null;
}

/** Segmented pill tabs with optional count badges. Two-way `[(value)]`. */
@Component({
  selector: 'app-pill-tabs',
  template: `
    <div class="pt" role="tablist">
      @for (t of tabs(); track t.key) {
        <button
          type="button"
          class="pt__tab"
          role="tab"
          [class.pt__tab--active]="t.key === value()"
          [attr.aria-selected]="t.key === value()"
          (click)="value.set(t.key)"
        >
          {{ t.label }}
          @if (t.count != null) {
            <span class="pt__count">{{ t.count }}</span>
          }
        </button>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }
      .pt {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        padding: 3px;
        background: var(--surface-tonal);
        border-radius: 10px;
      }
      .pt__tab {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 7px 12px;
        border: none;
        border-radius: 7px;
        background: transparent;
        cursor: pointer;
        font-family: var(--font-brand);
        font-size: 12.5px;
        font-weight: 600;
        letter-spacing: -0.1px;
        color: var(--text-secondary);
      }
      .pt__tab--active {
        background: var(--surface-card);
        box-shadow:
          0 1px 2px rgba(0, 0, 0, 0.06),
          0 0 0 1px rgba(21, 21, 26, 0.04);
        font-weight: 700;
        color: var(--text-primary);
      }
      .pt__count {
        font-family: var(--font-mono);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.3px;
        padding: 1px 6px;
        border-radius: 999px;
        border: 1px solid var(--border-subtle);
        background: var(--surface-card);
        color: var(--text-tertiary);
      }
      .pt__tab--active .pt__count {
        background: var(--surface-tonal);
        color: var(--text-primary);
      }
    `,
  ],
})
export class PillTabs {
  readonly tabs = input.required<readonly TabItem[]>();
  readonly value = model('');
}
