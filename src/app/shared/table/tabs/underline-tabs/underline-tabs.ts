import { Component, input, model } from '@angular/core';
import type { TabItem } from '../pill-tabs/pill-tabs';

/** Section-level underlined tabs with optional count badges (Filtros). */
@Component({
  selector: 'app-underline-tabs',
  template: `
    <div class="ut" role="tablist">
      @for (t of tabs(); track t.key) {
        <button
          type="button"
          class="ut__tab"
          role="tab"
          [class.ut__tab--active]="t.key === value()"
          [attr.aria-selected]="t.key === value()"
          (click)="value.set(t.key)"
        >
          {{ t.label }}
          @if (t.count != null) {
            <span class="ut__count">{{ t.count }}</span>
          }
        </button>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        margin-bottom: 18px;
      }
      .ut {
        display: flex;
        gap: 8px;
        border-bottom: 1px solid var(--border-subtle);
      }
      .ut__tab {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 12px 18px;
        border: none;
        background: transparent;
        cursor: pointer;
        font-family: var(--font-brand);
        font-size: 14px;
        font-weight: 600;
        letter-spacing: -0.1px;
        color: var(--text-secondary);
        border-bottom: 2px solid transparent;
        margin-bottom: -1px;
      }
      .ut__tab--active {
        font-weight: 700;
        color: var(--text-primary);
        border-bottom-color: var(--brand-blue);
      }
      .ut__count {
        font-family: var(--font-mono);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.3px;
        padding: 1px 7px;
        border-radius: 999px;
        border: 1px solid var(--border-subtle);
        background: var(--surface-tonal);
        color: var(--text-secondary);
      }
    `,
  ],
})
export class UnderlineTabs {
  readonly tabs = input.required<readonly TabItem[]>();
  readonly value = model('');
}
