import { Component, signal } from '@angular/core';
import { PillTabs, type TabItem } from '../../../shared/table/tabs/pill-tabs/pill-tabs';
import { ConsignmentSealed } from './consignment-sealed/consignment-sealed';
import { ConsignmentPayouts } from './consignment-payouts/consignment-payouts';

/** "Consignaciones" report host: sealed items (with the fee math), the singles
 *  placeholder (rules TBD), and the payout-batch history. The `@switch`
 *  recreates children on tab change, so Pagos always reloads after a payout is
 *  created in Sellado. */
@Component({
  selector: 'app-consignment-report',
  imports: [PillTabs, ConsignmentSealed, ConsignmentPayouts],
  template: `
    <div class="consignment__tabs">
      <app-pill-tabs [tabs]="tabs" [(value)]="view" />
    </div>

    @switch (view()) {
      @case ('sealed') {
        <app-consignment-sealed />
      }
      @case ('singles') {
        <p class="consignment__placeholder">
          Reglas de pago para singles pendientes de definir — próximamente.
        </p>
      }
      @case ('payouts') {
        <app-consignment-payouts />
      }
    }
  `,
  styles: [
    `
      .consignment__tabs {
        margin-bottom: 16px;
      }
      .consignment__placeholder {
        padding: 48px 24px;
        text-align: center;
        color: var(--text-secondary);
        background: var(--surface-card);
        border: 1px solid var(--border-subtle);
        border-radius: 14px;
      }
    `,
  ],
})
export class ConsignmentReport {
  protected readonly view = signal('sealed');
  protected readonly tabs: readonly TabItem[] = [
    { key: 'sealed', label: 'Sellado' },
    { key: 'singles', label: 'Singles' },
    { key: 'payouts', label: 'Pagos' },
  ];
}
