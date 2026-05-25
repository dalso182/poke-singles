import { Component, forwardRef, input, model, output, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { ToggleSwitch } from '../toggle-switch/toggle-switch';

/**
 * Toggle + inline label. Works three ways:
 *  - `[(on)]` two-way + `(change)` (filter toggles, e.g. Productos)
 *  - `formControlName` / `[formControl]` (reactive forms) — implements
 *    ControlValueAccessor so it's a drop-in for `<mat-slide-toggle>`.
 * Optional `helper` renders a second line beneath the label (form "toggle-row").
 */
@Component({
  selector: 'app-labeled-toggle',
  imports: [ToggleSwitch],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => LabeledToggle), multi: true },
  ],
  template: `
    <label class="lt" [class.lt--disabled]="disabled()">
      <app-toggle [on]="on()" [disabled]="disabled()" (change)="onToggle($event)" />
      <span class="lt__label"><ng-content /></span>
    </label>
    @if (helper()) {
      <div class="lt__helper">{{ helper() }}</div>
    }
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
      }
      .lt {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        height: 38px;
        padding: 0 4px;
        cursor: pointer;
      }
      .lt--disabled {
        cursor: not-allowed;
        opacity: 0.6;
      }
      .lt__label {
        font-family: var(--font-brand);
        font-size: 13px;
        font-weight: 500;
        color: var(--text-primary);
      }
      .lt__helper {
        margin-left: 48px;
        font-family: var(--font-brand);
        font-size: 11.5px;
        font-weight: 500;
        letter-spacing: -0.05px;
        color: var(--text-secondary);
      }
    `,
  ],
})
export class LabeledToggle implements ControlValueAccessor {
  readonly on = model(false);
  readonly helper = input<string | null>(null);
  readonly change = output<boolean>();
  protected readonly disabled = signal(false);

  private cvaChange: (value: boolean) => void = () => {};
  private cvaTouched: () => void = () => {};

  protected onToggle(value: boolean): void {
    this.on.set(value);
    this.cvaChange(value);
    this.cvaTouched();
    this.change.emit(value);
  }

  // ControlValueAccessor
  writeValue(value: boolean): void {
    this.on.set(!!value);
  }
  registerOnChange(fn: (value: boolean) => void): void {
    this.cvaChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.cvaTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
