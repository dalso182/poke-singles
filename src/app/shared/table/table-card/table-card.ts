import { Component } from '@angular/core';

/** Card wrapping a `<table class="app-table">` and an optional pagination footer. */
@Component({
  selector: 'app-table-card',
  template: `<section class="tc"><ng-content /></section>`,
  styles: [
    `
      :host {
        display: block;
      }
      .tc {
        background: var(--surface-card);
        border: 1px solid var(--border-subtle);
        border-radius: 14px;
        overflow: hidden;
        box-shadow:
          0 1px 0 rgba(21, 21, 26, 0.02),
          0 8px 24px -16px rgba(21, 21, 26, 0.08);
      }
    `,
  ],
})
export class TableCard {}
