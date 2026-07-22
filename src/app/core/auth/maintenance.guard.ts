import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { AppSettingsService } from '../settings/app-settings.service';

/**
 * Gate for the customer storefront (UserShell + children). When
 * `app_settings.maintenance_mode` is on, non-admin visitors are sent to the
 * standalone /mantenimiento page. Admins bypass so they can preview the store
 * and reach /admin/config to turn it off (the /admin branch has its own guard).
 * Signed-in testers on the maintenance_testers whitelist also bypass, via the
 * maintenance_bypass_allowed RPC (memoized per user in AppSettingsService).
 *
 * Awaits session hydration so isAdmin() is reliable on a hard refresh. Settings
 * are read through AppSettingsService.load(), which caches with a short TTL so
 * this doesn't round-trip on every navigation.
 */
export const maintenanceGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const settings = inject(AppSettingsService);
  const router = inject(Router);

  await auth.ready;

  if (auth.isAdmin()) return true;

  const { on } = await settings.getMaintenance();
  if (!on) return true;

  if (auth.isSignedIn() && (await settings.canBypassMaintenance())) return true;

  return router.createUrlTree(['/mantenimiento']);
};
