import { Component, input, model, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Switch toggle. Supports two-way `[(on)]` and also one-way `[on]` + `(change)`
 * for inline write-back rows (where the new value is sent to a service directly).
 */
@Component({
  selector: 'app-toggle',
  imports: [MatIconModule],
  template: `
    <button
      type="button"
      class="toggle"
      role="switch"
      [attr.aria-checked]="on()"
      [class.toggle--on]="on()"
      [class.toggle--sm]="size() === 'sm'"
      [disabled]="disabled()"
      (click)="toggle()"
    >
      <span class="toggle__dot">
        @if (on()) {
          <mat-icon class="toggle__check">check</mat-icon>
        }
      </span>
    </button>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }
      .toggle {
        position: relative;
        width: 36px;
        height: 20px;
        padding: 0;
        border: none;
        border-radius: 999px;
        background: #d4d2c9;
        cursor: pointer;
        transition: background 0.15s ease;
        display: inline-flex;
        align-items: center;
        flex-shrink: 0;
      }
      .toggle--sm {
        width: 30px;
        height: 18px;
      }
      .toggle--on {
        background: var(--brand-blue);
      }
      .toggle:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .toggle__dot {
        position: absolute;
        top: 3px;
        left: 3px;
        width: 14px;
        height: 14px;
        border-radius: 999px;
        background: #fff;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
        transition: left 0.18s cubic-bezier(0.4, 0, 0.2, 1);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .toggle--sm .toggle__dot {
        width: 12px;
        height: 12px;
      }
      .toggle--on .toggle__dot {
        left: calc(100% - 14px - 3px);
      }
      .toggle--on.toggle--sm .toggle__dot {
        left: calc(100% - 12px - 3px);
      }
      .toggle__check {
        color: var(--brand-blue);
        font-size: 10px;
        width: 10px;
        height: 10px;
        line-height: 10px;
      }
    `,
  ],
})
export class ToggleSwitch {
  readonly on = model(false);
  readonly size = input<'md' | 'sm'>('md');
  readonly disabled = input(false);
  readonly change = output<boolean>();

  protected toggle(): void {
    if (this.disabled()) return;
    const next = !this.on();
    this.on.set(next);
    this.change.emit(next);
  }
}
