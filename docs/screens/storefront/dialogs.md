# Storefront-global dialogs (announcement & card conditions)

> Part of the Poke-Singles docs set. Verified against source on 2026-07-22. Load together with /CLAUDE.md.

## Purpose

Two Material dialogs open globally inside the storefront without a page navigation. The **announcement dialog** auto-opens the single active `announcements` row exactly once per person (per-user DB flag for signed-in users, per-browser localStorage flag for guests) — the admin-managed replacement for the old first-visit welcome modal. The **card-conditions dialog** opens on demand (condition pills / info icons across product surfaces) and shows the `estado-de-cartas` static page (NM/LP/MP/HP/DM guide).

## Route & access

Neither dialog is routed; both are opened programmatically by root-provided services:

- **Announcement dialog** — `AnnouncementModalService` (`src/app/core/announcements/announcement-modal.service.ts`) is instantiated once in the `UserShell` constructor (`src/app/user/user-shell/user-shell.ts`), so it's scoped to the storefront (never `/admin` or `/library`). A constructor `effect()` checks once per app mount (after the auth session resolves) and once per fresh `signedInTick()`; no user action opens it.
- **Card-conditions dialog** — `CardConditionsDialogService.open()` is called from `openConditionsInfo($event)` handlers in four components: `src/app/shared/product-card/product-card.ts`, `src/app/shared/raffle-card/raffle-card.ts`, `src/app/user/cart-drawer/cart-drawer.ts`, and `src/app/user/cart-page/cart-page.ts` (two template call sites there). Each handler stops the click from propagating to the surrounding card/link before opening.

## Files

- `src/app/user/announcement-dialog/announcement-dialog.ts` — `AnnouncementDialog` component; `AnnouncementDialogData { announcement: AnnouncementRow }` via `MAT_DIALOG_DATA`.
- `src/app/user/announcement-dialog/announcement-dialog.html` / `.scss` — logo + title + body/image columns + actions.
- `src/app/core/announcements/announcement-modal.service.ts` — `AnnouncementModalService`: mount/login triggering, seen-gating, guest→login sync, lazy import.
- `src/app/core/catalog/announcements.service.ts` — `AnnouncementsService` data access (`getActive`, `hasRead`, `markRead`, `incrementViews`, admin CRUD/`activate`).
- `src/app/core/storage/local-storage.service.ts` — `LocalStorageService` (guest seen flag).
- `src/app/user/card-conditions-dialog/card-conditions-dialog.ts` — `CardConditionsDialog` component; `CardConditionsDialogData { page: StaticPageRow | null }`.
- `src/app/user/card-conditions-dialog/card-conditions-dialog.html` / `.scss` — title bar + body (or error line); no action row.
- `src/app/core/preview/card-conditions-dialog.service.ts` — `CardConditionsDialogService`: page-row cache + lazy import.
- Migration: `supabase/migrations/20260714000000_announcements.sql` (also absorbed the old `bienvenida` static page into a seeded inactive announcement and soft-deleted the page). Conditions seed: `supabase/migrations/20260510000100_seed_estado_de_cartas.sql`.

## UI anatomy

### Announcement dialog

- `.announcement-dialog__close` — absolute top-right icon button (`close`, `aria-label="Cerrar"`).
- `mat-dialog-content.announcement-dialog__content`:
  - `.announcement-dialog__logo` — the Poke-Singles logo (`assets/images/poke-singles-logo.png`), centered, **always present**.
  - `.announcement-dialog__title` — `<h2 mat-dialog-title>` bound to `announcement.title`, styled as the big left-aligned heading (Material's dialog-title chrome overridden).
  - `.announcement-dialog__body` — flex row: `<article [innerHTML]="safeBody()">` (rich text from the admin editor; styles both `<p>` and `<div>` blocks) + optional `.announcement-dialog__image` right column (`announcement.image_url`, stacks below text under 600px).
- `mat-dialog-actions.announcement-dialog__actions` (left-aligned):
  - When `link_path` AND `link_label` are set: `mat-flat-button color="primary"` with the `link_label` (closes + `router.navigateByUrl(link_path)`) followed by a `mat-stroked-button` "Entendido".
  - Otherwise: a single `mat-flat-button color="primary"` "Entendido". **Entendido is always present** — it's modal chrome, not content.
- Dialog config: `panelClass: 'announcement-dialog-panel'`, `width: '800px'`, `maxWidth: '95vw'`, `autoFocus: 'first-tabbable'`, `restoreFocus: true`.

### Card-conditions dialog

- `.conditions-dialog__title` — `<h2 mat-dialog-title>` bound to `data.page?.title ?? 'Estado de cartas'` + `.conditions-dialog__close` icon button (`close`, `aria-label="Cerrar"`).
- `mat-dialog-content.conditions-dialog__content` — when `data.page` exists: `<article [innerHTML]="safeContent()">`; when null (load failed / page missing): `<p class="muted">` "No pudimos cargar la guía. Intenta de nuevo más tarde."
- No action row — closed via X, Esc, or backdrop.
- Dialog config: `panelClass: 'card-conditions-dialog-panel'`, `width: '640px'`, `maxWidth: '95vw'`, `autoFocus: 'first-tabbable'`, `restoreFocus: true`.
- Seeded content (migration `20260510000100`): sections `<h2>` "Near Mint (NM)", "Light Played (LP)", "Moderately Played (MP)", "Heavily Played (HP)", "Damaged (DM)" with Spanish descriptions, separated by `<hr>`, ending in a `<figure>` whose image is hot-linked from the LIVE OpenCart site (`https://poke-singles.com/image/catalog/Logo-Borde-400x400.png`).

## Services & backend

- `AnnouncementsService.getActive()` → `SELECT * FROM announcements WHERE is_active AND deleted_at IS NULL maybeSingle()`. RLS `announcements_public_read_active` means anon/authenticated can ONLY ever read the active, non-deleted row.
- Seen state: `announcement_reads (announcement_id, user_id, seen_at, PK(announcement_id, user_id))` with self-`for all` RLS (`cart_items` pattern) + admin read. `markRead` is an idempotent upsert.
- View counter: `increment_announcement_views(p_id)` — `SECURITY DEFINER`, granted to anon+authenticated, only bumps the live active row (guests can't inflate arbitrary ids).
- Conditions dialog: `StaticPagesService.getBySlug('estado-de-cartas')`; RLS restricts shoppers to published, non-deleted pages.
- Both dialog components are **lazy `import()`ed** by their services on first open so they stay out of the initial bundle.

## State & data flow

### Announcement dialog

- localStorage key: `announcement:seen:<announcement id>` (value `'1'`) via `LocalStorageService`.
- Trigger `effect()`: waits for `auth.currentUser() !== undefined` (session resolved), then runs `maybeShow()` once per mount and once per new `signedInTick()`; `lastHandledTick` + a session-lifetime `shownIds` Set + a `running` flag dedupe token-refresh ticks and overlapping runs.
- `maybeShow()` decision order (every failure skips silently):
  1. `getActive()` → none/error → return.
  2. Already shown this session (`shownIds`) → return.
  3. Another dialog already open (`dialog.openDialogs.length > 0`) → return (shows next mount/login instead of stacking).
  4. **Admins skip all seen-gating** (`auth.isAdmin()`): straight to open, every page load — for content checking. No flags written, no view counted for them.
  5. localStorage flag present → if signed in, fire-and-forget `markRead()` (**guest→login sync**); return without showing.
  6. Signed in and `hasRead()` → backfill the localStorage flag; return.
  7. Open the dialog + fire `incrementViews()`.
- `afterClosed()` (any close path — X, Entendido, Esc, backdrop, link click): write the localStorage flag + `markRead()` when signed in. The component itself never records seen-state.
- Component signals: `safeBody` computed (`bypassSecurityTrustHtml`), `hasLink` computed (`link_path && link_label`).

### Card-conditions dialog

- Service holds a module-lifetime cache: `private cached: StaticPageRow | null`. First `open()` fetches and caches; later opens reuse the row (the service is `providedIn: 'root'`, so the cache survives dialog open/close cycles and shell remounts). A failed fetch logs `[card-conditions] failed to load page` and opens the dialog anyway with `page: null`.
- Because the cache check is `if (!this.cached)`, a null result (failure or missing page) is retried on every subsequent open — only a successful fetch is permanent.
- Component: `safeContent` computed; `close()` → `dialogRef.close()`.

## Behaviors & edge cases

- **Announcement never nags**: any storage/network error path skips silently; private-mode localStorage failures are swallowed by `LocalStorageService` (guests there may see it again next visit; signed-in users are still covered by the DB row).
- **Seen once is seen forever**: re-activating an old announcement does NOT re-show it — flags are keyed by announcement id and never expire. To re-push a message, create and activate a NEW announcement.
- **Admins always see the active modal** (once per page load) and never affect `view_count` or seen-flags — deliberate, for iterating on content.
- **Conditions dialog always opens**, even when content failed to load (shows the fallback error line with a hardcoded "Estado de cartas" title).
- **Sanitization**: both dialogs deliberately bypass HTML sanitization — content is admin-authored under admin-only write RLS (announcements from the constrained rich-text editor, static pages from the raw-HTML editor).
- **Responsive**: widths 800px (announcement) / 640px (conditions) collapse to `95vw`; the announcement image column stacks under the text below a 600px viewport.

## Gotchas / invariants

- **At most one live announcement** — enforced by the partial unique index `announcements_single_active_idx`; activation is deactivate-all-then-activate (see [../admin/announcements.md](../admin/announcements.md)).
- **Dismissal is recorded on ANY close** — Esc counts. There is no "remind me later".
- **`view_count` counts modal opens (guests included), not uniques** — the reads table only covers signed-in users; admin opens count nowhere.
- **E2e**: `scripts/e2e-seed.mjs` deactivates any active announcement so the modal can't open over checkout clicks (the old `welcome:dismissed:v1` localStorage plant is gone).
- **Unpublishing `estado-de-cartas` breaks the dialog for shoppers** (RLS returns null → permanent fallback message) while admins still see it — easy to miss in testing.
- **Seeded conditions HTML hot-links an image from the live OpenCart domain** (`poke-singles.com/image/catalog/Logo-Borde-400x400.png`). After OpenCart cutover/decommission that image 404s unless the content is edited or the asset migrated.
- **Conditions slug coupling**: the constant `'estado-de-cartas'` must match the seeded row; renaming the slug silently degrades the dialog to the error line.
- All four condition-dialog call sites use `event.stopPropagation()`-style handlers (`openConditionsInfo($event)`) so the click doesn't also trigger the product-card navigation — keep that when adding new triggers.
- **Branded top bar vs. the scrolling body**: the global 3px red-amber accent bar is a `background-image` on `.mat-mdc-dialog-surface` (painted *behind* the content). Because this dialog's `mat-dialog-content` scrolls, a scoped rule in `src/styles/_material-overrides.scss` (`.announcement-dialog-panel .mat-mdc-dialog-surface`) pins the bar to the top edge (`background-origin: border-box`) and adds `padding-top: 10px` so scrolled text clips *below* the bar instead of riding over it. The component's `.announcement-dialog__content` top padding is trimmed by that same 10px (24→14 desktop, 20→10 mobile) to keep the resting look — change one, change the other.

## Related docs

- [../admin/announcements.md](../admin/announcements.md) — admin CRUD, activation, view counts
- [static-page](./static-page.md) — `/info/:slug` pages (conditions guide's page form)
- [shell-header-footer](./shell-header-footer.md) — where both global services are bootstrapped
- [cart-drawer](./cart-drawer.md), [cart-page](./cart-page.md) — condition-dialog triggers
- [../../architecture/data-model.md](../../architecture/data-model.md) — `announcements` / `announcement_reads` / `static_pages` schema/RLS
