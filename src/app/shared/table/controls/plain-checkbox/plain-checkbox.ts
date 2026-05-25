import { Component, input, model, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** Plain square checkbox (Productos "Destacado"). Two-way `[(on)]` + `(change)`. */
@Component({
  selector: 'app-checkbox',
  imports: [MatIconModule],
  template: `
    <button
      type="button"
      class="check"
      role="checkbox"
      [attr.aria-checked]="on()"
      [class.check--on]="on()"
      [disabled]="disabled()"
      (click)="toggle()"
    >
      @if (on()) {
        <mat-icon class="check__icon">check</mat-icon>
      }
    </button>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }
      .check {
        width: 18px;
        height: 18px;
        padding: 0;
        border: 1.5px solid var(--border-strong);
        border-radius: 3px;
        background: var(--surface-card);
        cursor: pointer;
        color: #fff;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: all 0.12s ease;
      }
      .check--on {
        border-color: var(--brand-blue);
        background: var(--brand-blue);
      }
      .check:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .check__icon {
        font-size: 12px;
        width: 12px;
        height: 12px;
        line-height: 12px;
      }
    `,
  ],
})
export class PlainCheckbox {
  readonly on = model(false);
  readonly disabled = input(false);
  readonly change = output<boolean>();

  protected toggle(): void {
    if (this.disabled()) return;
    const next = !this.on();
    this.on.set(next);
    this.change.emit(next);
  }
}
