import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import type { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { maintenanceGuard } from './maintenance.guard';
import { AuthService } from './auth.service';
import { AppSettingsService } from '../settings/app-settings.service';

/** Minimal stubs for the three collaborators the guard injects. */
function setup(opts: {
  admin?: boolean;
  signedIn?: boolean;
  maintenanceOn?: boolean;
  bypass?: boolean;
}) {
  const auth = {
    ready: Promise.resolve(),
    isAdmin: () => !!opts.admin,
    isSignedIn: () => !!opts.signedIn,
  };
  const settings = {
    getMaintenanceCalls: 0,
    bypassCalls: 0,
    async getMaintenance() {
      this.getMaintenanceCalls++;
      return { on: !!opts.maintenanceOn, message: null, imageUrl: null };
    },
    async canBypassMaintenance() {
      this.bypassCalls++;
      return !!opts.bypass;
    },
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: auth },
      { provide: AppSettingsService, useValue: settings },
    ],
  });
  const run = () =>
    TestBed.runInInjectionContext(() =>
      maintenanceGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
  return { run, settings, router: TestBed.inject(Router) };
}

describe('maintenanceGuard', () => {
  it('admins pass without even reading settings', async () => {
    const { run, settings } = setup({ admin: true, maintenanceOn: true });
    expect(await run()).toBe(true);
    expect(settings.getMaintenanceCalls).toBe(0);
  });

  it('everyone passes when maintenance is off', async () => {
    const { run, settings } = setup({ maintenanceOn: false });
    expect(await run()).toBe(true);
    expect(settings.bypassCalls).toBe(0);
  });

  it('signed-in whitelisted tester passes when maintenance is on', async () => {
    const { run } = setup({ signedIn: true, maintenanceOn: true, bypass: true });
    expect(await run()).toBe(true);
  });

  it('signed-in non-tester is redirected to /mantenimiento', async () => {
    const { run, router } = setup({ signedIn: true, maintenanceOn: true, bypass: false });
    const result = await run();
    expect(result instanceof UrlTree).toBe(true);
    expect(result.toString()).toBe(router.createUrlTree(['/mantenimiento']).toString());
  });

  it('anonymous visitors are redirected without an RPC round-trip', async () => {
    const { run, settings } = setup({ signedIn: false, maintenanceOn: true });
    const result = await run();
    expect(result instanceof UrlTree).toBe(true);
    expect(settings.bypassCalls).toBe(0);
  });
});
