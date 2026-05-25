import { Component, input } from '@angular/core';

/**
 * Responsive form grid. The host IS the grid, so projected fields become grid
 * items. Span a field across columns with `style="grid-column: span 2"`.
 */
@Component({
  selector: 'app-form-grid',
  template: `<ng-content />`,
  host: {
    '[style.display]': "'grid'",
    '[style.grid-template-columns]': 'template()',
    '[style.gap.px]': 'gap()',
  },
})
export class FormGrid {
  readonly cols = input(2);
  readonly gap = input(20);

  protected template(): string {
    return `repeat(${this.cols()}, minmax(0, 1fr))`;
  }
}
