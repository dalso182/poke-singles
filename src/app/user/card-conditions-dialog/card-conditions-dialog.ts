import { Component, computed, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { StaticPageRow } from '../../core/catalog/catalog.types';

export interface CardConditionsDialogData {
  page: StaticPageRow | null;
}

@Component({
  selector: 'app-card-conditions-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './card-conditions-dialog.html',
  styleUrl: './card-conditions-dialog.scss',
})
export class CardConditionsDialog {
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly data = inject<CardConditionsDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<CardConditionsDialog>);

  protected readonly safeContent = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(this.data.page?.content ?? ''),
  );

  protected close(): void {
    this.dialogRef.close();
  }
}
