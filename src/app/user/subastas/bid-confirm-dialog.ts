import { Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface BidConfirmData {
  amount: number;
  productName: string;
}

/**
 * Pre-bid confirmation ("Live Arena" dark variant): the user reviews the
 * amount and must explicitly acknowledge the commitment to pay if they win
 * (or risk being banned from future auctions) before the bid is submitted.
 * Open with `panelClass: 'arena-dialog'` (dark surface override in
 * _material-overrides). Closes with `true` only on confirm.
 */
@Component({
  selector: 'app-bid-confirm-dialog',
  imports: [DecimalPipe, MatCheckboxModule, MatDialogModule, MatIconModule],
  template: `
    <div class="confirm">
      <div class="confirm__head">
        <span class="confirm__kicker">Confirmar puja</span>
        <button type="button" class="confirm__close" aria-label="Cerrar" (click)="ref.close(false)">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <div class="confirm__center">
        <div class="confirm__kicker">Vas a pujar</div>
        <div class="confirm__amount">₡{{ data.amount | number: '1.0-0' }}</div>
        <div class="confirm__product">{{ data.productName }}</div>
      </div>

      <label class="confirm__terms">
        <mat-checkbox [checked]="accepted()" (change)="accepted.set($event.checked)">
          Entiendo que al pujar me comprometo a pagar si gano. De lo contrario
          podría ser vetado de futuras subastas.
        </mat-checkbox>
      </label>

      <div class="confirm__actions">
        <button type="button" class="confirm__cancel" (click)="ref.close(false)">Cancelar</button>
        <button
          type="button"
          class="confirm__go"
          [disabled]="!accepted()"
          (click)="ref.close(true)"
        >
          <mat-icon>gavel</mat-icon>
          Confirmar puja
        </button>
      </div>
    </div>
  `,
  styles: `
    .confirm {
      padding: 22px;
      background: radial-gradient(120% 120% at 80% 0%, #23222a, #15151a 60%);
      color: #fff;
    }

    .confirm__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .confirm__kicker {
      font-family: var(--font-mono);
      font-size: 10px;
      letter-spacing: 1.6px;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.5);
    }

    .confirm__close {
      background: none;
      border: none;
      color: rgba(255, 255, 255, 0.5);
      cursor: pointer;
      padding: 0;
      display: inline-flex;

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }

      &:hover {
        color: #fff;
      }
    }

    .confirm__center {
      margin: 16px 0;
      text-align: center;
    }

    .confirm__amount {
      font-family: var(--font-brand);
      font-size: 44px;
      font-weight: 800;
      letter-spacing: -1.6px;
      color: var(--accent-amber);
      margin-top: 4px;
      font-variant-numeric: tabular-nums;
    }

    .confirm__product {
      font-family: var(--font-mono);
      font-size: 11px;
      color: rgba(255, 255, 255, 0.45);
      margin-top: 2px;
    }

    .confirm__terms {
      display: block;
      padding: 6px 12px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.1);
      cursor: pointer;

      mat-checkbox {
        font-size: 11.5px;
        --mdc-checkbox-unselected-icon-color: rgba(255, 255, 255, 0.4);
        --mdc-checkbox-unselected-hover-icon-color: rgba(255, 255, 255, 0.6);
        --mat-checkbox-label-text-color: rgba(255, 255, 255, 0.8);
        --mat-checkbox-label-text-size: 11.5px;
      }
    }

    .confirm__actions {
      display: flex;
      gap: 10px;
      margin-top: 16px;
    }

    .confirm__cancel {
      flex: 0 0 auto;
      height: 46px;
      padding: 0 18px;
      border-radius: 10px;
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.18);
      color: rgba(255, 255, 255, 0.85);
      font-family: var(--font-brand);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;

      &:hover {
        border-color: rgba(255, 255, 255, 0.35);
      }
    }

    .confirm__go {
      flex: 1;
      height: 46px;
      border-radius: 10px;
      border: none;
      background: linear-gradient(180deg, #e7a928, var(--accent-amber));
      color: #1a1206;
      font-family: var(--font-brand);
      font-size: 14px;
      font-weight: 800;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: transform 0.1s, filter 0.15s, box-shadow 0.15s;

      mat-icon {
        font-size: 17px;
        width: 17px;
        height: 17px;
      }

      &:hover:not(:disabled) {
        filter: brightness(1.06);
        box-shadow: 0 8px 24px -6px rgba(212, 148, 28, 0.55);
      }

      &:active:not(:disabled) {
        transform: translateY(1px);
      }

      &:disabled {
        opacity: 0.45;
        cursor: default;
      }
    }
  `,
})
export class BidConfirmDialog {
  protected readonly data = inject<BidConfirmData>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef<BidConfirmDialog>);
  protected readonly accepted = signal(false);
}
