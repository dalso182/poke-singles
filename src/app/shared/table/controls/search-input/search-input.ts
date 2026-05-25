import { Component, input, model } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Filter-bar search box. Two-way `[(value)]`. Grows to fill by default; pass a
 * numeric `width` to fix it (Productos uses 300). Consumers own any debounce.
 */
@Component({
  selector: 'app-search-input',
  imports: [MatIconModule],
  host: {
    '[class.is-fixed]': 'width() !== null',
    '[style.width.px]': 'width()',
  },
  template: `
    <div class="search">
      <mat-icon class="search__icon">search</mat-icon>
      <input
        class="search__input"
        type="search"
        [placeholder]="placeholder()"
        [attr.aria-label]="placeholder()"
        [value]="value()"
        (input)="onInput($event)"
      />
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex: 1 1 240px;
        min-width: 200px;
        max-width: 380px;
      }
      :host.is-fixed {
        flex: none;
        min-width: 0;
        max-width: none;
      }
      .search {
        display: flex;
        align-items: center;
        gap: 8px;
        box-sizing: border-box;
        width: 100%;
        height: 38px;
        padding: 0 12px;
        background: var(--surface-page);
        border: 1px solid var(--border-subtle);
        border-radius: 8px;
        color: var(--text-tertiary);
      }
      .search__icon {
        flex-shrink: 0;
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
      }
      .search__input {
        flex: 1;
        min-width: 0;
        border: none;
        outline: none;
        background: transparent;
        font-family: var(--font-brand);
        font-size: 13.5px;
        color: var(--text-primary);
      }
      .search__input::placeholder {
        color: var(--text-tertiary);
      }
      .search__input::-webkit-search-cancel-button {
        -webkit-appearance: none;
      }
    `,
  ],
})
export class SearchInput {
  readonly value = model('');
  readonly placeholder = input('Buscar');
  readonly width = input<number | null>(null);

  protected onInput(event: Event): void {
    this.value.set((event.target as HTMLInputElement).value);
  }
}
