import { Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface CancelOrderDialogData {
  /** Short reference for the title, e.g. "#7301". */
  shortRef: string;
}

/** Resolved value: trimmed notes string (possibly empty) on confirm; or
 *  `null` if the admin dismissed/cancelled the dialog. */
export type CancelOrderDialogResult = string | null;

@Component({
  selector: 'app-cancel-order-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './cancel-order-dialog.html',
  styleUrl: './cancel-order-dialog.scss',
})
export class CancelOrderDialog {
  protected readonly data = inject<CancelOrderDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef =
    inject<MatDialogRef<CancelOrderDialog, CancelOrderDialogResult>>(MatDialogRef);

  protected readonly notes = new FormControl<string>('', { nonNullable: true });

  protected onCancel(): void {
    this.dialogRef.close(null);
  }

  protected onConfirm(): void {
    this.dialogRef.close(this.notes.value.trim());
  }
}
