# Admin — Anuncios

> Part of the Poke-Singles docs set. Verified against source on 2026-07-14. Load together with /CLAUDE.md.

## Purpose

CRUD for **announcement modals**: admin-authored messages every storefront visitor sees exactly once (see [../storefront/dialogs.md](../storefront/dialogs.md) for the customer-side behavior). At most one announcement is active at a time; activating one deactivates the rest. Replaces the old `bienvenida` static-page welcome modal.

## Route & access

- `/admin/announcements` — list (`AnnouncementsList`), `pathMatch: 'full'`.
- `/admin/announcements/new` and `/admin/announcements/:id/edit` — form (`AnnouncementEdit`).
- All lazy `loadComponent` children of the `admin` route (behind `adminGuard`). Sidenav: "Anuncios" (icon `campaign`) under the "Información" group.

## Files

- `src/app/admin/announcements/announcements-list.ts` / `.html` / `.scss` — list screen.
- `src/app/admin/announcements/announcement-edit.ts` / `.html` / `.scss` — create/edit form.
- `src/app/shared/forms/rich-text-editor/rich-text-editor.ts` / `.html` / `.scss` — `RichTextEditor` (`app-rich-text-editor`), reusable `ControlValueAccessor` WYSIWYG.
- `src/app/core/catalog/announcements.service.ts` — `AnnouncementsService` (list/getById/create/update/softDelete/restore/activate/deactivate + storefront reads).
- `src/app/core/catalog/catalog.types.ts` — `AnnouncementRow` / `AnnouncementInsert` / `AnnouncementUpdate` / `AnnouncementReadRow`.
- `supabase/migrations/20260714000000_announcements.sql` — schema, RLS, views RPC, bienvenida seed.

## UI anatomy

### List

- `app-page-header` — kicker "Información", title "Anuncios", sub "Modales que cada visitante ve una sola vez. Solo puede haber uno activo; al activar otro, el anterior se desactiva." + primary `app-btn` "Crear anuncio".
- `app-pill-tabs` — "Todos" / "Eliminados" (counts) + `app-search-input` (200ms debounce, filters by title).
- `app-table-card` with `.app-table.app-table--comfy`; columns `title`, `is_active` ("Estado": green dot Pill "Activo" / neutral "Inactivo"), `view_count` ("Vistas", `number` pipe), `updated_at` ("Actualizado", `date:'short'`), `actions`.
- Row actions (live rows): ghost `app-btn` "Activar"/"Desactivar", "Editar", danger `app-icon-btn` delete (`delete_outline`). Deleted rows: "Restaurar".
- Empty state: "Sin anuncios en este filtro. Crea uno con el botón de arriba."

### Edit form

- `app-back-header` (kicker "Información", title "Crear anuncio" / "Editar anuncio", back to `/admin/announcements`).
- Section "Datos": `title` (required), `link_path` ("Enlace interno (opcional)", pattern `^\/[a-z0-9\-\/?=&]*$`, hint "Ruta dentro del sitio, ej. /rifas o /products"), `link_label` ("Texto del botón del enlace", required-iff-path via the group-level `linkLabelRequired` validator), `app-labeled-toggle` `is_active` ("Activo (al guardar, desactiva cualquier otro anuncio)").
- Section "Imagen (opcional)": thumbnail + "Quitar" when set; "Elegir imagen"/"Cambiar imagen" opens the shared `ImagePickerDialog` and stores `result.url` (root-relative `/card-images/...`) in the `imageUrl` signal (not a form control — `markAsDirty()` manually).
- Section "Contenido": `app-rich-text-editor` bound to `body_html` next to a live "Vista previa" that mirrors the modal — sanitized body text left, image right, and a **non-interactive CTA stand-in** (`.announcement-edit__preview-btn`) shown only when both link fields are filled. Entendido is deliberately NOT in the preview (modal chrome, not content).
- `app-form-footer` — "Crear anuncio"/"Guardar" (disabled while invalid/saving) + Cancelar.

### Rich-text editor (`app-rich-text-editor`)

- Toolbar: Negrita, Cursiva, divider, 4 color swatches — Texto `#15151a`, Gris `#5a5a65`, Ámbar `#d4941c`, Verde `#15803d`. **No brand red** (restricted per theme rules).
- `contenteditable` surface + `document.execCommand` (`styleWithCSS` on, so output is `<span style>` not `<font>`); toolbar buttons act on `mousedown` with `preventDefault()` to keep the selection. Paragraphs via Enter (browsers emit `<p>` or `<div>` — consumers style both).
- `ControlValueAccessor` over an HTML string; SSR-safe (`isPlatformBrowser` guard, `AfterViewInit` applies a pre-view `writeValue`).

## Services & backend

- Table `announcements`: `id`, `title`, `body_html`, `image_url`, `link_path`, `link_label`, `is_active`, `view_count`, `deleted_at`, timestamps + `tg_set_updated_at`. Partial unique index `announcements_single_active_idx ON (is_active) WHERE is_active AND deleted_at IS NULL` — the hard single-active guarantee.
- RLS: `announcements_public_read_active` (anon+authenticated see only the live active row) + `announcements_admin_all`.
- `activate(id)` = two admin queries: `update({is_active:false}).eq('is_active', true)` then `update({is_active:true}).eq('id', id)`. Not atomic by design: a race errors on the unique index (never two active); a failure in between leaves zero active (safe). pg-safeupdate is satisfied (both filtered).
- `softDelete(id)` also sets `is_active: false` so a deleted announcement can't stay live; `restore()` restores as **inactive**.
- `view_count` is bumped by the anon-callable `increment_announcement_views(p_id)` RPC when the storefront modal opens (admins excluded) — impressions including guests, not uniques.
- Seen tracking lives in `announcement_reads` (see the storefront dialogs doc); admins have read access for potential stats.

## State & data flow

- List: `rows` signal loaded via `service.list({ includeDeleted: true })`; `visibleRows` computed filters by tab + debounced search; `saving` signal disables the acted-on row's buttons.
- Delete → snackbar "Anuncio eliminado" with "Deshacer" action → `restore()` (same pattern as pages/coupons).
- Edit form: `is_active` is applied AFTER create/update via `activate()`/`deactivate()` so the deactivate-others invariant holds; a unique-index bounce surfaces in the error snackbar as fallback.
- Save payload nulls `link_label` when `link_path` is empty.

## Behaviors & edge cases

- Activating from the list shows "Anuncio activado — se mostrará a cada persona una vez".
- The seeded row "Hemos renovado nuestra web" (created inactive by the migration from the old `bienvenida` page content) carries `link_path: '/products'`, `link_label: 'Empezar a buscar'` and a placeholder image to swap via the picker.
- Admin users always see the active modal on the storefront (every page load, nothing recorded) — that's the intended content-checking loop: edit → open storefront → reload.

## Gotchas / invariants

- **Never two active** — rely on `activate()`; don't hand-write `is_active: true` updates elsewhere.
- **Re-activating doesn't re-show** to people who already dismissed (reads are keyed by id, forever). New message = new row.
- **`view_count` restore/reset has no UI** — it only ever increments via the RPC.
- The rich-text editor uses deprecated-but-universal `execCommand`; if it ever breaks in a future browser, the swap-out point is `RichTextEditor.exec()`.
- E2e seeding deactivates all announcements (`scripts/e2e-seed.mjs`) — an activated dev announcement won't survive an e2e run.

## Related docs

- [../storefront/dialogs.md](../storefront/dialogs.md) — the customer-facing modal + seen-gating flow
- [pages.md](./pages.md) — the sibling static-pages CRUD this screen was modeled on
- [../../architecture/data-model.md](../../architecture/data-model.md) — schema/RLS
- [../../architecture/testing.md](../../architecture/testing.md) — e2e suppression
