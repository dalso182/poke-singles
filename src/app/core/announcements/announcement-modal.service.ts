import { Injectable, PLATFORM_ID, effect, inject, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { AuthService } from '../auth/auth.service';
import { AnnouncementsService } from '../catalog/announcements.service';
import { LocalStorageService } from '../storage/local-storage.service';

const storageKey = (id: string) => `announcement:seen:${id}`;

/**
 * Auto-shows the active announcement modal exactly once per person:
 *  - Guests: dismissal recorded in localStorage (`announcement:seen:<id>`).
 *  - Signed-in users: dismissal recorded per-account in `announcement_reads`
 *    (survives devices/browsers); localStorage doubles as a fast-path cache.
 *  - Guest→login sync: a guest who dismissed and later signs in gets the DB
 *    row written from the localStorage flag instead of a re-show.
 *
 * Checks once per storefront mount (after the session resolves) and once per
 * fresh SIGNED_IN tick — no polling; a newly activated announcement appears on
 * the next visit/login. All failures skip silently ("skip rather than nag").
 *
 * Admins are exempt from the seen-gating: they get the active modal on every
 * page load (handy for checking content), and in exchange nothing is recorded
 * for them — no flags, no view-count bump.
 *
 * Activated from `UserShell` so it's scoped to the storefront (never the admin
 * shell). Root-provided, so dedupe state survives the shell remounting.
 */
@Injectable({ providedIn: 'root' })
export class AnnouncementModalService {
  private readonly dialog = inject(MatDialog);
  private readonly auth = inject(AuthService);
  private readonly announcements = inject(AnnouncementsService);
  private readonly storage = inject(LocalStorageService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private handledMount = false;
  /** Last SIGNED_IN tick already checked (token refreshes reuse the guard). */
  private lastHandledTick = 0;
  /** Announcements already shown this app session. */
  private readonly shownIds = new Set<string>();
  /** Serializes overlapping checks (mount + a quick login, refresh ticks). */
  private running = false;

  constructor() {
    if (!this.isBrowser) return;
    effect(() => {
      const user = this.auth.currentUser(); // undefined = session still resolving
      const tick = this.auth.signedInTick();
      if (user === undefined) return;
      if (this.handledMount && tick === this.lastHandledTick) return;
      this.handledMount = true;
      this.lastHandledTick = tick;
      untracked(() => void this.maybeShow());
    });
  }

  private async maybeShow(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      let active;
      try {
        active = await this.announcements.getActive();
      } catch {
        return;
      }
      if (!active) return;
      if (this.shownIds.has(active.id)) return;
      // Don't stack on top of another dialog (login, avatar picker…); the
      // announcement gets its turn on the next mount or login.
      if (this.dialog.openDialogs.length > 0) return;

      const key = storageKey(active.id);
      const user = this.auth.currentUser();
      // Admins always see the active modal (fresh per page load) so changes
      // can be checked without clearing flags; their views aren't counted
      // and no seen-flags are written for them.
      const isAdmin = this.auth.isAdmin();

      if (!isAdmin) {
        if (this.storage.get(key)) {
          // Dismissed on this browser. If they're signed in now (e.g.
          // dismissed as a guest, then logged in), persist the flag to
          // their account.
          if (user) {
            this.announcements.markRead(active.id, user.id).catch(() => {});
          }
          return;
        }

        if (user) {
          let read: boolean;
          try {
            read = await this.announcements.hasRead(active.id, user.id);
          } catch {
            return;
          }
          if (read) {
            // Dismissed on another device — backfill the local fast-path flag.
            this.storage.set(key, '1');
            return;
          }
        }
      }

      this.shownIds.add(active.id);
      const { AnnouncementDialog } = await import(
        '../../user/announcement-dialog/announcement-dialog'
      );
      const ref = this.dialog.open(AnnouncementDialog, {
        data: { announcement: active },
        panelClass: 'announcement-dialog-panel',
        width: '600px',
        maxWidth: '95vw',
        autoFocus: 'first-tabbable',
        restoreFocus: true,
      });
      if (!isAdmin) {
        this.announcements.incrementViews(active.id).catch(() => {});
      }
      // Any close path (X, Entendido, Esc, backdrop, link click) counts as seen.
      ref.afterClosed().subscribe(() => {
        if (isAdmin) return; // never flag admins — they re-see on next load
        this.storage.set(key, '1');
        const closer = this.auth.currentUser();
        if (closer) {
          this.announcements.markRead(active.id, closer.id).catch(() => {});
        }
      });
    } finally {
      this.running = false;
    }
  }
}
