import { Component, OnInit, inject, input, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { CustomersService } from '../../core/customers/customers.service';
import type { CustomerDetail as CustomerDetailRow, OrderStatus } from '../../core/catalog/catalog.types';
import { BackHeader } from '../../shared/forms/back-header/back-header';
import { TableCard } from '../../shared/table/table-card/table-card';
import { Pill } from '../../shared/table/cells/pill/pill';
import { Money } from '../../shared/table/cells/money-cell/money-cell';
import { Btn } from '../../shared/table/controls/btn/btn';

type PillTone = 'neutral' | 'green' | 'amber' | 'red' | 'blue' | 'ink';

@Component({
  selector: 'app-admin-customer-detail',
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    MatProgressBarModule,
    MatTableModule,
    BackHeader,
    TableCard,
    Pill,
    Money,
    Btn,
  ],
  templateUrl: './customer-detail.html',
  styleUrl: './customer-detail.scss',
})
export class CustomerDetail implements OnInit {
  /** Route param (customers/:id) bound via withComponentInputBinding. */
  readonly id = input.required<string>();

  private readonly customers = inject(CustomersService);
  private readonly router = inject(Router);

  protected readonly customer = signal<CustomerDetailRow | null>(null);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);

  protected readonly orderColumns = ['ref', 'total', 'status', 'date', 'actions'];

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    const c = await this.customers.getCustomer(this.id());
    this.customer.set(c);
    this.notFound.set(c === null);
    this.loading.set(false);
  }

  protected goBack(): void {
    void this.router.navigate(['/admin/customers']);
  }

  protected goToOrder(id: string): void {
    void this.router.navigate(['/admin/orders', id]);
  }

  /** Monogram avatar — initials + a stable hue derived from the name. */
  protected initials(name: string | null | undefined): string {
    const source = (name || '?').trim();
    return (
      source
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0] ?? '')
        .join('')
        .toUpperCase() || '?'
    );
  }
  private hue(name: string | null | undefined): number {
    const s = name || '?';
    let sum = 0;
    for (let i = 0; i < s.length; i++) sum += s.charCodeAt(i);
    return Math.abs(sum) % 360;
  }
  protected avatarBg(name: string | null | undefined): string {
    return `oklch(0.94 0.04 ${this.hue(name)})`;
  }
  protected avatarFg(name: string | null | undefined): string {
    return `oklch(0.40 0.08 ${this.hue(name)})`;
  }

  protected recurringTag(orderCount: number): string {
    return orderCount > 1 ? 'Cliente recurrente' : 'Cliente';
  }

  protected statusLabel(s: OrderStatus): string {
    switch (s) {
      case 'pending':
        return 'Pendiente';
      case 'paid':
        return 'Pagado';
      case 'shipped':
        return 'Enviado';
      case 'completed':
        return 'Completado';
      case 'cancelled':
        return 'Cancelado';
    }
  }

  protected statusTone(s: OrderStatus): PillTone {
    switch (s) {
      case 'paid':
      case 'completed':
        return 'green';
      case 'shipped':
        return 'blue';
      case 'cancelled':
        return 'red';
      default:
        return 'amber';
    }
  }
}
