import { Component, OnInit, inject, input, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { CustomersService } from '../../core/customers/customers.service';
import type { CustomerDetail as CustomerDetailRow, OrderStatus } from '../../core/catalog/catalog.types';

@Component({
  selector: 'app-admin-customer-detail',
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatTableModule,
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

  protected readonly orderColumns = ['ref', 'total', 'status', 'date'];

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

  protected statusLabel(s: OrderStatus): string {
    switch (s) {
      case 'pending':   return 'Pendiente';
      case 'paid':      return 'Pagado';
      case 'shipped':   return 'Enviado';
      case 'completed': return 'Completado';
      case 'cancelled': return 'Cancelado';
    }
  }
}
