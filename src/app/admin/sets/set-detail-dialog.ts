import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { SetsService } from '../../core/catalog/sets.service';
import type { SetRow } from '../../core/catalog/catalog.types';

export type SetDetailDialogResult =
  | { kind: 'updated'; row: SetRow }
  | { kind: 'deleted'; id: string }
  | null;

@Component({
  selector: 'app-set-detail-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSnackBarModule,
  ],
  templateUrl: './set-detail-dialog.html',
  styleUrl: './set-detail-dialog.scss',
})
export class SetDetailDialog {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(SetsService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialogRef =
    inject<MatDialogRef<SetDetailDialog, SetDetailDialogResult>>(MatDialogRef);
  protected readonly data = inject<SetRow>(MAT_DIALOG_DATA);

  protected readonly saving = signal(false);
  protected readonly deleting = signal(false);

  protected readonly form: FormGroup = this.fb.nonNullable.group({
    name: [this.data.name, Validators.required],
    series: [this.data.series ?? ''],
    release_date: [this.data.release_date ?? ''],
    symbol_image_url: [this.data.symbol_image_url ?? ''],
    printed_total: [this.data.printed_total != null ? String(this.data.printed_total) : ''],
  });

  protected async onSave(): Promise<void> {
    if (this.form.invalid || this.form.pristine) return;
    this.saving.set(true);
    try {
      const raw = this.form.getRawValue();
      const row = await this.service.update(this.data.id, {
        name: raw.name,
        series: raw.series || null,
        release_date: raw.release_date || null,
        symbol_image_url: raw.symbol_image_url || null,
        printed_total: raw.printed_total ? Number(raw.printed_total) : null,
      });
      this.snack.open('Set actualizado', 'OK', { duration: 3000 });
      this.dialogRef.close({ kind: 'updated', row });
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.saving.set(false);
    }
  }

  protected async onDelete(): Promise<void> {
    if (
      !confirm(
        `¿Eliminar el set "${this.data.name}"? Sólo se permite si no tiene productos.`,
      )
    ) {
      return;
    }
    this.deleting.set(true);
    try {
      const result = await this.service.deleteIfEmpty(this.data.id);
      if (!result.deleted) {
        this.snack.open(
          `No se eliminó: el set tiene ${result.productCount} producto(s) asociado(s).`,
          'OK',
          { duration: 5000 },
        );
        return;
      }
      this.snack.open('Set eliminado', 'OK', { duration: 3000 });
      this.dialogRef.close({ kind: 'deleted', id: this.data.id });
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.deleting.set(false);
    }
  }

  protected onCancel(): void {
    this.dialogRef.close(null);
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
