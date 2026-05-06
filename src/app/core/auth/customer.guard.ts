import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { AuthService } from './auth.service';

/**
 * Gate for customer-only routes (e.g. /account, /cart, /checkout). Lighter
 * than adminGuard — no role check, just "are you signed in?". On a hard
 * refresh waits for session hydration before deciding so we don't bounce
 * a logged-in user. If signed out, opens the login dialog and redirects
 * home; the dialog handles the rest.
 *
 * LoginDialog is lazy-imported to keep its Material deps out of the
 * initial bundle.
 */
export const customerGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const dialog = inject(MatDialog);

  await auth.ready;

  if (auth.isSignedIn()) return true;

  const { LoginDialog } = await import('../../auth/login-dialog/login-dialog');
  dialog.open(LoginDialog, {
    panelClass: 'login-dialog-panel',
    autoFocus: 'first-tabbable',
    restoreFocus: true,
  });
  return router.createUrlTree(['/']);
};
