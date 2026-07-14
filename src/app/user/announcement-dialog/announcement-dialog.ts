import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { AnnouncementRow } from '../../core/catalog/catalog.types';

export interface AnnouncementDialogData {
  announcement: AnnouncementRow;
}

/**
 * Renders the active announcement (admin-authored via /admin/announcements).
 * Marking it "seen" is NOT done here — AnnouncementModalService handles that
 * in afterClosed() so every close path counts uniformly.
 */
@Component({
  selector: 'app-announcement-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './announcement-dialog.html',
  styleUrl: './announcement-dialog.scss',
})
export class AnnouncementDialog {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly router = inject(Router);
  private readonly dialogRef = inject(MatDialogRef<AnnouncementDialog>);
  protected readonly data = inject<AnnouncementDialogData>(MAT_DIALOG_DATA);

  // Admin-authored under admin-only write RLS — same trust model as the
  // static pages and the old welcome dialog.
  protected readonly safeBody = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(this.data.announcement.body_html ?? ''),
  );

  protected readonly hasLink = computed(() => {
    const a = this.data.announcement;
    return !!a.link_path && !!a.link_label;
  });

  protected close(): void {
    this.dialogRef.close();
  }

  protected followLink(): void {
    const path = this.data.announcement.link_path;
    this.dialogRef.close();
    if (path) void this.router.navigateByUrl(path);
  }
}
