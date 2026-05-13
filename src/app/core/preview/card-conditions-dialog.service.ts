import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { StaticPagesService } from '../catalog/static-pages.service';
import type { StaticPageRow } from '../catalog/catalog.types';

const SLUG = 'estado-de-cartas';

/**
 * Opens the card-conditions info modal. The dialog component is lazy
 * imported on first open so it doesn't bloat the initial bundle, and
 * the page row is cached on this service (which is providedIn: 'root',
 * so the cache survives across dialog open/close cycles).
 */
@Injectable({ providedIn: 'root' })
export class CardConditionsDialogService {
  private readonly dialog = inject(MatDialog);
  private readonly pages = inject(StaticPagesService);
  private cached: StaticPageRow | null = null;

  async open(): Promise<void> {
    if (!this.cached) {
      try {
        this.cached = await this.pages.getBySlug(SLUG);
      } catch (err) {
        console.error('[card-conditions] failed to load page', err);
      }
    }
    const { CardConditionsDialog } = await import(
      '../../user/card-conditions-dialog/card-conditions-dialog'
    );
    this.dialog.open(CardConditionsDialog, {
      data: { page: this.cached },
      panelClass: 'card-conditions-dialog-panel',
      width: '640px',
      maxWidth: '95vw',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });
  }
}
