import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { SellerPayoutsService } from '../../core/catalog/seller-payouts.service';
import type { PayoutItemDetail, SellerPayoutRow } from '../../core/catalog/catalog.types';
import { Thumb } from '../../shared/table/cells/thumb-cell/thumb-cell';
import { Money } from '../../shared/table/cells/money-cell/money-cell';
import { Btn } from '../../shared/table/controls/btn/btn';

/** Read-only "what did this payment cover?" dialog: the order items linked to
 *  one seller_payouts batch. The batch row arrives as dialog data, so the
 *  frozen totals render without a fetch; only the item list loads. */
@Component({
  selector: 'app-payout-items-dialog',
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    MatDialogModule,
    MatProgressBarModule,
    MatTableModule,
    Thumb,
    Money,
    Btn,
  ],
  templateUrl: './payout-items-dialog.html',
  styleUrl: './payout-items-dialog.scss',
})
export class PayoutItemsDialog implements OnInit {
  private readonly payouts = inject(SellerPayoutsService);
  private readonly dialogRef = inject<MatDialogRef<PayoutItemsDialog>>(MatDialogRef);
  protected readonly data = inject<SellerPayoutRow>(MAT_DIALOG_DATA);

  protected readonly items = signal<PayoutItemDetail[]>([]);
  protected readonly loading = signal(true);

  protected readonly displayedColumns = ['product', 'order', 'qty', 'vendido'];

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.items.set(await this.payouts.listPayoutItems(this.data.id));
    } catch {
      // Read-only view: an empty table + the batch totals is a fine fallback.
    } finally {
      this.loading.set(false);
    }
  }

  /** Order links navigate away — close the dialog alongside. */
  protected onOrderClick(): void {
    this.dialogRef.close();
  }

  protected onClose(): void {
    this.dialogRef.close();
  }
}
