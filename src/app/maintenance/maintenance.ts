import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AppSettingsService } from '../core/settings/app-settings.service';

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
}
