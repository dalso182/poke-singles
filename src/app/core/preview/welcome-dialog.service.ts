import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { StaticPagesService } from '../catalog/static-pages.service';
import { LocalStorageService } from '../storage/local-storage.service';
import type { StaticPageRow } from '../catalog/catalog.types';

const STORAGE_KEY = 'welcome:dismissed:v1';
const SLUG = 'bienvenida';

/**
 * Auto-opens the first-visit welcome modal at most once per browser.
 * Closing the dialog by any means (X, Entendido, Esc, backdrop) marks
 * it dismissed in localStorage. The modal silently skips when:
 *   - The localStorage flag is set (already seen).
 *   - The bienvenida page is missing, unpublished, or has empty content.
 *   - Storage / network errors — fall back to "skip rather than nag".
 *
 * Bump the STORAGE_KEY version (v1 → v2) to re-show with new copy.
 */
@Injectable({ providedIn: 'root' })
export class WelcomeDialogService {
  private readonly dialog = inject(MatDialog);
  private readonly pages = inject(StaticPagesService);
  private readonly storage = inject(LocalStorageService);

  async maybeOpen(): Promise<void> {
    if (this.storage.get(STORAGE_KEY)) return;

    let page: StaticPageRow | null;
    try {
      page = await this.pages.getBySlug(SLUG);
    } catch {
      return;
    }
    if (!page || !page.content?.trim()) return;

    const { WelcomeDialog } = await import(
      '../../user/welcome-dialog/welcome-dialog'
    );
    const ref = this.dialog.open(WelcomeDialog, {
      data: { page },
      panelClass: 'welcome-dialog-panel',
      // Wider-than-tall feel on desktop; collapses to viewport width on
      // mobile via maxWidth.
      width: '760px',
      maxWidth: '95vw',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });
    ref.afterClosed().subscribe(() => {
      this.storage.set(STORAGE_KEY, '1');
    });
  }
}
