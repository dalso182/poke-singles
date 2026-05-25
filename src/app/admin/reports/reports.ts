import { Component, signal } from '@angular/core';
import { PageHeader } from '../../shared/table/page-header/page-header';
import { PillTabs, type TabItem } from '../../shared/table/tabs/pill-tabs/pill-tabs';
import { CustomerOrdersReport } from './customer-orders-report/customer-orders-report';
import { CustomerActivityReport } from './customer-activity-report/customer-activity-report';
import { CustomerSearchesReport } from './customer-searches-report/customer-searches-report';
import { CouponsReport } from './coupons-report/coupons-report';

/** Admin "Reportes" hub. A page header + a report-type switcher; each report is
 *  a self-contained child (own filters / table / pagination). */
@Component({
  selector: 'app-admin-reports',
  imports: [
    PageHeader,
    PillTabs,
    CustomerOrdersReport,
    CustomerActivityReport,
    CustomerSearchesReport,
    CouponsReport,
  ],
  templateUrl: './reports.html',
  styleUrl: './reports.scss',
})
export class Reports {
  protected readonly tab = signal('orders');
  protected readonly tabs: readonly TabItem[] = [
    { key: 'orders', label: 'Pedidos por cliente' },
    { key: 'activity', label: 'Actividad de clientes' },
    { key: 'searches', label: 'Búsquedas' },
    { key: 'coupons', label: 'Cupones' },
  ];
}
