import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { OrdersService } from '../../core/orders/orders.service';

@Component({
  selector: 'app-admin-dashboard',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss',
})
export class AdminDashboard implements OnInit {
  private readonly orders = inject(OrdersService);

  protected readonly pendingCount = signal<number | null>(null);

  ngOnInit(): void {
    void this.orders.countPendingOrders().then((n) => this.pendingCount.set(n));
  }
}
