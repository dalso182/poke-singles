import { Component, OnInit, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { SellersService } from '../../core/catalog/sellers.service';
import type { SellerRow } from '../../core/catalog/catalog.types';
import { BackHeader } from '../../shared/forms/back-header/back-header';
import { PillTabs, type TabItem } from '../../shared/table/tabs/pill-tabs/pill-tabs';
import { Btn } from '../../shared/table/controls/btn/btn';
import { SellerSealed } from './seller-sealed';

/** Per-seller consignment view (sellers/:id): Sellado = sold items with the
 *  fee breakdown + bulk "mark paid" + payout history; Singles = placeholder
 *  until its fee rules are defined. */
@Component({
  selector: 'app-admin-seller-detail',
  imports: [MatProgressBarModule, BackHeader, PillTabs, Btn, SellerSealed],
  templateUrl: './seller-detail.html',
  styleUrl: './seller-detail.scss',
})
export class SellerDetail implements OnInit {
  /** Route param (sellers/:id) bound via withComponentInputBinding. */
  readonly id = input.required<string>();

  private readonly sellers = inject(SellersService);
  private readonly router = inject(Router);

  protected readonly seller = signal<SellerRow | null>(null);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);

  protected readonly view = signal('sealed');
  protected readonly tabs: readonly TabItem[] = [
    { key: 'sealed', label: 'Sellado' },
    { key: 'singles', label: 'Singles' },
  ];

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const s = await this.sellers.get(this.id());
      this.seller.set(s);
      this.notFound.set(s === null);
    } catch {
      this.notFound.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected goBack(): void {
    this.router.navigate(['/admin/sellers']);
  }
}
