import { Component, input, output } from '@angular/core';

/**
 * Bulk-action toolbar shown while table rows are selected (Consignaciones).
 * Renders the selection count + a "Limpiar" reset; the consumer projects its
 * own actions (totals, inputs, buttons). Parents gate visibility with
 * `@if (selectedCount() > 0)`.
 */
@Component({
  selector: 'app-bulk-bar',
  template: `
    <div class="bb">
      <span class="bb__count">
        {{ count() }} {{ count() === 1 ? 'seleccionado' : 'seleccionados' }}
      </span>
      <button type="button" class="bb__clear" (click)="clear.emit()">Limpiar</button>
      <span class="bb__spacer"></span>
      <ng-content />
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        margin-bottom: 16px;
      }
      .bb {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        padding: 10px 16px;
        background: var(--surface-card);
        border: 1px solid var(--brand-blue);
        border-radius: 14px;
        box-shadow: 0 1px 0 rgba(21, 21, 26, 0.02);
      }
      .bb__count {
        font-family: var(--font-brand);
        font-size: 13px;
        font-weight: 700;
        color: var(--text-primary);
      }
      .bb__clear {
        border: none;
        background: transparent;
        padding: 0;
        font-size: 12px;
        font-weight: 600;
        color: var(--text-secondary);
        cursor: pointer;
        text-decoration: underline;
      }
      .bb__spacer {
        flex: 1;
      }
    `,
  ],
})
export class BulkBar {
  readonly count = input.required<number>();
  readonly clear = output<void>();
}
