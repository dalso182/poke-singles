import { Component, input } from '@angular/core';

/**
 * Table-system button. Custom (not mat-button) so it escapes the global
 * uppercase mat-button override. Bind `(click)` on the host; project text and
 * an optional `<mat-icon>`.
 */
@Component({
  selector: 'app-btn',
  template: `
    <button
      type="button"
      class="btn"
      [attr.data-variant]="variant()"
      [class.btn--sm]="size() === 'sm'"
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
      .btn {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        height: 38px;
        padding: 0 14px;
        border-radius: 8px;
        border: 1px solid transparent;
        font-family: var(--font-brand);
        font-size: 13px;
        font-weight: 700;
        letter-spacing: -0.1px;
        cursor: pointer;
        transition: background 0.12s ease;
      }
      .btn--sm {
        height: 30px;
        padding: 0 12px;
        font-size: 12px;
      }
      .btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      [data-variant='primary'] {
        background: var(--brand-blue);
        color: #fff;
        border-color: var(--brand-blue);
      }
      [data-variant='ghost'] {
        background: var(--surface-card);
        color: var(--text-primary);
        border-color: var(--border-subtle);
      }
      [data-variant='danger'] {
        background: var(--surface-card);
        color: var(--danger);
        border-color: var(--border-subtle);
      }
      [data-variant='subtle'] {
        background: transparent;
        color: var(--text-secondary);
        border-color: transparent;
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
export class Btn {
  readonly variant = input<'primary' | 'ghost' | 'danger' | 'subtle'>('ghost');
  readonly size = input<'md' | 'sm'>('md');
  readonly disabled = input(false);
}
