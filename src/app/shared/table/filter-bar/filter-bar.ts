import { Component } from '@angular/core';

/** Card that holds search / tabs / dropdowns / toggles above a table. */
@Component({
  selector: 'app-filter-bar',
  template: `<div class="fb"><ng-content /></div>`,
  styles: [
    `
      :host {
        display: block;
        margin-bottom: 16px;
      }
      .fb {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        padding: 14px 16px;
        background: var(--surface-card);
        border: 1px solid var(--border-subtle);
        border-radius: 14px;
        box-shadow: 0 1px 0 rgba(21, 21, 26, 0.02);
      }
    `,
  ],
})
export class FilterBar {}
