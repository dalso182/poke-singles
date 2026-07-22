import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { AppSettingsService } from '../core/settings/app-settings.service';
import { AuthService } from '../core/auth/auth.service';

/** Default copy when the admin hasn't written a maintenance message. Mirrors
 *  the placeholder shown in the admin config form. */
const FALLBACK_MESSAGE = 'Estamos actualizando el inventario, volvemos en un rato.';

/**
 * Standalone full-page maintenance screen. Lives outside UserShell (no header/
 * nav/footer) and is the redirect target of `maintenanceGuard`. If maintenance
 * is off, bounces back to the storefront so the route isn't a dead page.
 */
@Component({
  selector: 'app-maintenance',
  imports: [MatIconModule],
  templateUrl: './maintenance.html',
  styleUrl: './maintenance.scss',
})
export class Maintenance {
  private readonly settings = inject(AppSettingsService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);

  protected readonly ready = signal(false);
  protected readonly message = signal(FALLBACK_MESSAGE);
  /** Admin-picked /card-images/… image; replaces the wrench icon when set. */
  protected readonly imageUrl = signal<string | null>(null);

  constructor() {
    void this.resolve();
  }

  private async resolve(): Promise<void> {
    try {
      const { on, message, imageUrl } = await this.settings.getMaintenance();
      if (!on) {
        void this.router.navigate(['/']);
        return;
      }
      const trimmed = message?.trim();
      this.message.set(trimmed ? trimmed : FALLBACK_MESSAGE);
      this.imageUrl.set(imageUrl);
    } finally {
      this.ready.set(true);
    }
  }

  /** Hidden tester entrance (the dot in the corner): opens the shared login
   *  dialog; on close, whitelisted testers get through via maintenanceGuard. */
  protected async openLogin(): Promise<void> {
    const { LoginDialog } = await import('../auth/login-dialog/login-dialog');
    const ref = this.dialog.open(LoginDialog, {
      panelClass: 'login-dialog-panel',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });
    ref.afterClosed().subscribe(() => {
      if (this.auth.isSignedIn()) void this.router.navigate(['/']);
    });
  }
}
