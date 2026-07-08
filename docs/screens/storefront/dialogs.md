# Storefront-global dialogs (welcome & card conditions)

> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose

Two Material dialogs render admin-editable `static_pages` HTML inside the storefront without a page navigation. The **welcome dialog** auto-opens once per browser on a shopper's first visit and shows the `bienvenida` page. The **card-conditions dialog** opens on demand (condition pills / info icons across product surfaces) and shows the `estado-de-cartas` condition guide (NM/LP/MP/HP/DM).

## Route & access

Neither dialog is routed; both are opened programmatically by root-provided services in `src/app/core/preview/`:

- **Welcome dialog** — `WelcomeDialogService.maybeOpen()` is called exactly once from the `UserShell` constructor (`src/app/user/user-shell/user-shell.ts`), so it fires on any storefront entry (never in `/admin` or `/library`). It self-gates (see State & data flow); no user action opens it.
- **Card-conditions dialog** — `CardConditionsDialogService.open()` is called from `openConditionsInfo($event)` handlers in four components: `src/app/shared/product-card/product-card.ts`, `src/app/shared/raffle-card/raffle-card.ts`, `src/app/user/cart-drawer/cart-drawer.ts`, and `src/app/user/cart-page/cart-page.ts` (two template call sites there). Each handler stops the click from propagating to the surrounding card/link before opening.

The same content is also reachable as full pages at `/info/bienvenida` and `/info/estado-de-cartas` — see [static-page](./static-page.md).

## Files

- `src/app/user/welcome-dialog/welcome-dialog.ts` — `WelcomeDialog` component; `WelcomeDialogData { page: StaticPageRow }` via `MAT_DIALOG_DATA`.
- `src/app/user/welcome-dialog/welcome-dialog.html` / `.scss` — title bar + sanitized-HTML body + "Entendido" action.
- `src/app/core/preview/welcome-dialog.service.ts` — `WelcomeDialogService`: gating, lazy import, dismissal persistence.
- `src/app/user/card-conditions-dialog/card-conditions-dialog.ts` — `CardConditionsDialog` component; `CardConditionsDialogData { page: StaticPageRow | null }`.
- `src/app/user/card-conditions-dialog/card-conditions-dialog.html` / `.scss` — title bar + body (or error line); no action row.
- `src/app/core/preview/card-conditions-dialog.service.ts` — `CardConditionsDialogService`: page-row cache + lazy import.
- `src/app/core/catalog/static-pages.service.ts` — `StaticPagesService.getBySlug()` used by both services.
- `src/app/core/storage/local-storage.service.ts` — `LocalStorageService` (welcome dismissal flag).
- Seeds: `supabase/migrations/20260510000300_seed_bienvenida.sql`, `supabase/migrations/20260510000100_seed_estado_de_cartas.sql`.

## UI anatomy

### Welcome dialog

- `.welcome-dialog__title` — `<h2 mat-dialog-title>` bound to `data.page.title` (seeded as "Bienvenido a Poke-Singles"; admin-editable) + `.welcome-dialog__close` icon button (`close`, `aria-label="Cerrar"`).
- `mat-dialog-content.welcome-dialog__content` — `<article [innerHTML]="safeContent()">` rendering the page's HTML through `DomSanitizer.bypassSecurityTrustHtml`.
- `mat-dialog-actions` (align end) — `mat-flat-button color="primary"`: "Entendido", closes the dialog.
- Dialog config: `panelClass: 'welcome-dialog-panel'`, `width: '760px'`, `maxWidth: '95vw'`, `autoFocus: 'first-tabbable'`, `restoreFocus: true`.

### Card-conditions dialog

- `.conditions-dialog__title` — `<h2 mat-dialog-title>` bound to `data.page?.title ?? 'Estado de cartas'` + `.conditions-dialog__close` icon button (`close`, `aria-label="Cerrar"`).
- `mat-dialog-content.conditions-dialog__content` — when `data.page` exists: `<article [innerHTML]="safeContent()">`; when null (load failed / page missing): `<p class="muted">` "No pudimos cargar la guía. Intenta de nuevo más tarde."
- No action row — closed via X, Esc, or backdrop.
- Dialog config: `panelClass: 'card-conditions-dialog-panel'`, `width: '640px'`, `maxWidth: '95vw'`, `autoFocus: 'first-tabbable'`, `restoreFocus: true`.
- Seeded content (migration `20260510000100`): sections `<h2>` "Near Mint (NM)", "Light Played (LP)", "Moderately Played (MP)", "Heavily Played (HP)", "Damaged (DM)" with Spanish descriptions, separated by `<hr>`, ending in a `<figure>` whose image is hot-linked from the LIVE OpenCart site (`https://poke-singles.com/image/catalog/Logo-Borde-400x400.png`).

## Services & backend

- Both services call `StaticPagesService.getBySlug(slug)` → `SELECT * FROM static_pages WHERE slug = … maybeSingle()`.
  - Welcome slug constant: `SLUG = 'bienvenida'` (welcome-dialog.service.ts).
  - Conditions slug constant: `SLUG = 'estado-de-cartas'` (card-conditions-dialog.service.ts).
- RLS on `static_pages`: policy `static_pages_public_read` restricts anon/authenticated reads to `is_published = true AND deleted_at IS NULL`; `static_pages_admin_all` gives admins full access. So for shoppers, an unpublished/deleted page reads back as `null`.
- `WelcomeDialogService` also uses `LocalStorageService.get/set`.
- Both dialog components are **lazy `import()`ed** by their services on first open so they stay out of the initial bundle.

## State & data flow

### Welcome dialog

- Storage key: `STORAGE_KEY = 'welcome:dismissed:v1'` (localStorage, value `'1'`). The service doc says to bump the version (`v1` → `v2`) to re-show the modal with new copy.
- `maybeOpen()` flow: (1) return if the storage flag is set; (2) fetch the `bienvenida` row — return on throw; (3) return if the row is missing or `content` is empty/whitespace (the seed migration intentionally ships empty content so no modal appears until the admin writes copy in `/admin/pages`); (4) lazy-import + open; (5) on `afterClosed()` — regardless of HOW it closed (X, "Entendido", Esc, backdrop) — write the dismissal flag.
- No signals; the component only has the `safeContent` computed over its injected data.

### Card-conditions dialog

- Service holds a module-lifetime cache: `private cached: StaticPageRow | null`. First `open()` fetches and caches; later opens reuse the row (the service is `providedIn: 'root'`, so the cache survives dialog open/close cycles and shell remounts). A failed fetch logs `[card-conditions] failed to load page` and opens the dialog anyway with `page: null`.
- Because the cache check is `if (!this.cached)`, a null result (failure or missing page) is retried on every subsequent open — only a successful fetch is permanent.
- Component: `safeContent` computed; `close()` → `dialogRef.close()`.

## Behaviors & edge cases

- **Welcome never nags**: any storage/network error path skips silently; private-mode localStorage failures are swallowed by `LocalStorageService`, which means the flag may fail to persist there and the modal can reappear next visit.
- **Welcome shows at most once per browser**, not per user — it is not tied to auth at all.
- **Conditions dialog always opens**, even when content failed to load (shows the fallback error line with a hardcoded "Estado de cartas" title).
- **Sanitization**: both dialogs deliberately bypass HTML sanitization for `static_pages.content`. Content is admin-authored (admin-only write policy), so this is trusted-input by design — same pattern as [static-page](./static-page.md).
- **Responsive**: fixed widths 760px (welcome) / 640px (conditions) collapse to `95vw` on narrow screens via `maxWidth`.
- **Admin sessions**: RLS lets admins read unpublished pages, so an admin could see a welcome modal for an unpublished `bienvenida` draft that shoppers never see (only if their own browser hasn't set the dismissal flag).

## Gotchas / invariants

- **The empty-content gate is the welcome dialog's kill switch**: clearing `bienvenida`'s content in `/admin/pages` disables the modal for everyone; writing content arms it for every browser without the `welcome:dismissed:v1` flag.
- **Dismissal is recorded on ANY close** — a user who Esc'd immediately never sees the copy again until the key version is bumped.
- **Unpublishing `estado-de-cartas` breaks the dialog for shoppers** (RLS returns null → permanent fallback message) while admins still see it — easy to miss in testing.
- **Seeded conditions HTML hot-links an image from the live OpenCart domain** (`poke-singles.com/image/catalog/Logo-Borde-400x400.png`). After OpenCart cutover/decommission that image 404s unless the content is edited or the asset migrated.
- **Slug coupling**: the constants `'bienvenida'` / `'estado-de-cartas'` must match the seeded rows; renaming a slug in `/admin/pages` silently disables the corresponding dialog (welcome skips; conditions shows the error line).
- `CardConditionsDialogData.page` is nullable; `WelcomeDialogData.page` is not (the service guarantees a row before opening). Don't reuse one dialog's data shape for the other.
- All four condition-dialog call sites use `event.stopPropagation()`-style handlers (`openConditionsInfo($event)`) so the click doesn't also trigger the product-card navigation — keep that when adding new triggers.

## Related docs

- [static-page](./static-page.md) — the `/info/:slug` page rendering the same rows
- [shell-header-footer](./shell-header-footer.md) — where the welcome dialog is bootstrapped
- [cart-drawer](./cart-drawer.md), [cart-page](./cart-page.md) — condition-dialog triggers
- [../../architecture/data-model.md](../../architecture/data-model.md) — `static_pages` schema/RLS
- [../admin/pages.md](../admin/pages.md) — admin CRUD for these pages
