import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from './auth.service';

/**
 * Gate for /admin and its children. Awaits initial session hydration so we
 * don't bounce a logged-in admin on a hard refresh, then:
 *  - signed out  → home + open login dialog
 *  - signed in but not admin → home + snackbar
 *  - admin       → allow
 *
 * LoginDialog is lazy-imported so this guard doesn't drag the dialog and its
 * Material deps into the initial bundle.
 */
export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const dialog = inject(MatDialog);
  const snack = inject(MatSnackBar);

  await auth.ready;

  if (!auth.isSignedIn()) {
    const { LoginDialog } = await import('../../auth/login-dialog/login-dialog');
    dialog.open(LoginDialog, {
      panelClass: 'login-dialog-panel',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });
    return router.createUrlTree(['/']);
  }

  if (!auth.isAdmin()) {
    snack.open('Necesitas permisos de administrador para entrar al panel.', 'OK', {
      duration: 5000,
    });
    return router.createUrlTree(['/']);
  }

  return true;
};
