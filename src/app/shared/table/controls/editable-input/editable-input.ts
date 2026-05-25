import { Component, input, model } from '@angular/core';

/**
 * Inline-edit text input — looks like static text at rest, shows a subtle border
 * on hover, blooms to a blue ring on focus. Two-way `[(value)]`. Pass `width` for
 * short numeric fields (host shrinks to fit); otherwise it fills its cell.
 */
@Component({
  selector: 'app-editable-input',
  host: {
    '[style.display]': "width() === null ? 'block' : 'inline-flex'",
    '[style.width]': "width() === null ? '100%' : 'auto'",
  },
  template: `
    <input
      class="ei"
      [class.ei--mono]="mono()"
      type="text"
      [value]="value()"
      [placeholder]="placeholder()"
      [disabled]="disabled()"
      [style.text-align]="align()"
      [style.width.px]="width()"
      (input)="onInput($event)"
    />
  `,
  styles: [
    `
      .ei {
        width: 100%;
        height: 32px;
        padding: 0 10px;
        border: 1px solid transparent;
        border-radius: 6px;
        background: transparent;
        font-family: var(--font-brand);
        font-size: 13px;
        font-weight: 600;
        letter-spacing: -0.1px;
        color: var(--text-primary);
        outline: none;
        transition: border-color 0.12s ease, background 0.12s ease, box-shadow 0.12s ease;
      }
      .ei--mono {
        font-family: var(--font-mono);
        font-size: 11.5px;
        font-weight: 500;
        letter-spacing: 0.4px;
      }
      .ei:hover:not(:focus):not(:disabled) {
        border-color: var(--border-strong);
      }
      .ei:focus {
        border: 1.5px solid var(--brand-blue);
        background: var(--surface-card);
        box-shadow: 0 0 0 3px var(--brand-blue-soft);
      }
      .ei:disabled {
        color: var(--text-tertiary);
        cursor: not-allowed;
      }
      .ei::placeholder {
        color: var(--text-tertiary);
        font-weight: 500;
      }
    `,
  ],
})
export class EditableInput {
  readonly value = model('');
  readonly mono = input(false);
  readonly align = input<'left' | 'right'>('left');
  readonly width = input<number | null>(null);
  readonly placeholder = input('');
  readonly disabled = input(false);

  protected onInput(event: Event): void {
    this.value.set((event.target as HTMLInputElement).value);
  }
}
