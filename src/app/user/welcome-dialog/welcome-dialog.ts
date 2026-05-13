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

export interface WelcomeDialogData {
  page: StaticPageRow;
}

@Component({
  selector: 'app-welcome-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './welcome-dialog.html',
  styleUrl: './welcome-dialog.scss',
})
export class WelcomeDialog {
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly data = inject<WelcomeDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<WelcomeDialog>);

  protected readonly safeContent = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(this.data.page.content ?? ''),
  );

  protected close(): void {
    this.dialogRef.close();
  }
}
