import { Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface BidConfirmData {
  amount: number;
  productName: string;
}

/**
 * Pre-bid confirmation: the user reviews the amount and must explicitly
 * acknowledge the commitment to pay if they win (or risk being banned from
 * future auctions) before the bid is submitted. Closes with `true` only on
 * confirm.
 */
@Component({
  selector: 'app-bid-confirm-dialog',
  imports: [DecimalPipe, MatButtonModule, MatCheckboxModule, MatDialogModule, MatIconModule],
  template: `
    <h2 mat-dialog-title class="bid-confirm-title">
      <mat-icon>gavel</mat-icon>
      Confirmar puja
    </h2>
    <mat-dialog-content>
      <p class="bid-confirm-line">
        Vas a pujar
        <strong class="bid-confirm-amount">₡{{ data.amount | number: '1.0-0' }}</strong>
        por <strong>{{ data.productName }}</strong>.
      </p>
      <div class="bid-confirm-terms">
        <mat-checkbox [checked]="accepted()" (change)="accepted.set($event.checked)">
          Entiendo que al pujar me comprometo a pagar si gano. De lo contrario
          podría ser vetado de futuras subastas.
        </mat-checkbox>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close(false)">Cancelar</button>
      <button
        mat-flat-button
        type="button"
        [disabled]="!accepted()"
        (click)="ref.close(true)"
      >
        Confirmar puja
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .bid-confirm-title {
      display: flex;
      align-items: center;
      gap: 8px;

      mat-icon {
        color: var(--accent-amber);
      }
    }

    .bid-confirm-line {
      margin: 0 0 12px;
      font-size: 15px;
      line-height: 1.5;
    }

    .bid-confirm-amount {
      font-family: var(--font-brand);
      font-size: 18px;
    }

    .bid-confirm-terms {
      background: var(--surface-tonal);
      border-radius: 8px;
      padding: 10px 12px;

      mat-checkbox {
        font-size: 13px;
      }
    }
  `,
})
export class BidConfirmDialog {
  protected readonly data = inject<BidConfirmData>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef<BidConfirmDialog>);
  protected readonly accepted = signal(false);
}
