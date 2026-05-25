import { Component, input } from '@angular/core';

/**
 * Compact icon-only button (28×28). Project a `<mat-icon>` as content.
 * Bind `(click)` on the host. `tone="danger"` tints the hover red (--danger).
 */
@Component({
  selector: 'app-icon-btn',
  template: `
    <button
      type="button"
      class="icon-btn"
      [class.icon-btn--danger]="tone() === 'danger'"
      [attr.aria-label]="label()"
      [title]="label()"
      [disabled]="disabled()"
    >
      <ng-content />
    </button>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }
      .icon-btn {
        width: 28px;
        height: 28px;
        padding: 0;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--text-secondary);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: all 0.12s ease;
      }
      .icon-btn:hover {
        background: var(--surface-tonal);
        color: var(--text-primary);
      }
      .icon-btn--danger:hover {
        background: #fee2e2;
        color: var(--danger);
      }
      .icon-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      :host ::ng-deep mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        line-height: 18px;
      }
    `,
  ],
})
export class IconBtn {
  readonly label = input.required<string>();
  readonly tone = input<'default' | 'danger'>('default');
  readonly disabled = input(false);
}
