import { Component, input, model } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

export interface DropdownOption {
  readonly value: string;
  readonly label: string;
}

/**
 * Outlined dropdown with a floating label — a styled native `<select>` (hits the
 * exact spec without fighting mat-form-field). Two-way `[(value)]`.
 */
@Component({
  selector: 'app-dropdown',
  imports: [MatIconModule],
  host: { '[style.width.px]': 'width()' },
  template: `
    <div class="dd">
      <label class="dd__label">{{ label() }}</label>
      <select class="dd__select" [value]="value()" (change)="onChange($event)" [attr.aria-label]="label()">
        @for (o of options(); track o.value) {
          <option [value]="o.value">{{ o.label }}</option>
        }
      </select>
      <mat-icon class="dd__chev">expand_more</mat-icon>
    </div>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }
      .dd {
        position: relative;
        width: 100%;
        height: 38px;
      }
      .dd__label {
        position: absolute;
        top: -7px;
        left: 10px;
        z-index: 1;
        padding: 0 5px;
        background: var(--surface-card);
        font-family: var(--font-brand);
        font-size: 10.5px;
        font-weight: 600;
        letter-spacing: 0.1px;
        color: var(--text-secondary);
      }
      .dd__select {
        appearance: none;
        -webkit-appearance: none;
        width: 100%;
        height: 38px;
        padding: 0 32px 0 12px;
        border: 1px solid var(--border-strong);
        border-radius: 8px;
        background: var(--surface-card);
        font-family: var(--font-brand);
        font-size: 13.5px;
        font-weight: 600;
        color: var(--text-primary);
        outline: none;
        cursor: pointer;
      }
      .dd__select:focus {
        border-color: var(--brand-blue);
      }
      .dd__chev {
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
        pointer-events: none;
        color: var(--text-secondary);
        font-size: 18px;
        width: 18px;
        height: 18px;
        line-height: 18px;
      }
    `,
  ],
})
export class Dropdown {
  readonly label = input.required<string>();
  readonly value = model('');
  readonly options = input.required<readonly DropdownOption[]>();
  readonly width = input(180);

  protected onChange(event: Event): void {
    this.value.set((event.target as HTMLSelectElement).value);
  }
}
