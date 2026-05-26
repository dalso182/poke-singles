import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

/**
 * "Cargar más" button for the storefront listings (/products, /buscar, …).
 * Presentational only — the parent owns the paging state and reacts to
 * `loadMore` by fetching + appending the next page. The parent decides when to
 * render this (typically `@if (hasMore())`), so the button disappears once a
 * page comes back short. While a load is in flight, `loading` disables it and
 * swaps the label for an inline spinner.
 *
 * Scopes a local override of the global mat-button uppercase rule
 * (_material-overrides.scss) so the label reads sentence-case "Cargar más".
 */
@Component({
  selector: 'app-load-more',
  imports: [MatButtonModule, MatProgressSpinnerModule],
  template: `
    <button
      mat-stroked-button
      type="button"
      [disabled]="loading()"
      (click)="loadMore.emit()"
    >
      @if (loading()) {
        <mat-progress-spinner mode="indeterminate" diameter="18" />
      }
      Cargar más
    </button>
  `,
  styles: [
    `
      :host {
        display: flex;
        justify-content: center;
        margin: 24px 0 8px;
      }
      button {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      /* Undo the global mat-button uppercase/letter-spacing for this label. */
      :host ::ng-deep .mdc-button__label {
        text-transform: none;
        letter-spacing: normal;
      }
    `,
  ],
})
export class LoadMore {
  /** True while the next page is being fetched — disables the button and shows
   *  the inline spinner. Owned by the parent. */
  readonly loading = input<boolean>(false);
  /** Emitted on click. The parent fetches + appends the next page. */
  readonly loadMore = output<void>();
}
