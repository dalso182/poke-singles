# Admin — Static pages (list + edit)

> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose

CRUD for admin-managed static/informational pages (About Us, shipping, FAQ — the replacement for OpenCart's "information" pages). The list filters by publish/deleted state with soft-delete + undo; the editor is a raw-HTML textarea with a live side-by-side preview. Published pages render publicly at `/info/:slug`.

## Route & access

- `/admin/pages` (`pathMatch: 'full'`) → `PagesList`.
- `/admin/pages/new` → `PageEdit` (create mode).
- `/admin/pages/:id/edit` → `PageEdit` (edit mode; `:id` = `static_pages.id` UUID).
- All behind `adminGuard` on the `/admin` parent. No query params; list filter/search are component state only.

## Files

- `src/app/admin/pages/pages-list.ts` — `PagesList` component (selector `app-admin-pages-list`).
- `src/app/admin/pages/pages-list.html` / `pages-list.scss` — list template + `pages-list__*` styles.
- `src/app/admin/pages/page-edit.ts` — `PageEdit` component (selector `app-admin-page-edit`), reactive form + HTML preview.
- `src/app/admin/pages/page-edit.html` / `page-edit.scss` — form template + `page-edit__*` styles.
- `src/app/core/catalog/static-pages.service.ts` — `StaticPagesService` (all methods below).
- `src/app/core/catalog/catalog.types.ts` — `StaticPageRow`, `StaticPageInsert`, `StaticPageUpdate`.
- `supabase/migrations/20260510000000_static_pages.sql` — table, RLS, `sobre-nosotros` seed.
- Seeds: `20260510000100_seed_estado_de_cartas.sql`, `20260510000300_seed_bienvenida.sql`, slug fix `20260525001500_fix_shipping_policy_slug.sql`.

## UI anatomy

### List (`/admin/pages`)

1. `<app-page-header>` — kicker `"Contenido"`, title `"Páginas"`, sub `"Páginas estáticas (Sobre nosotros, Envíos, FAQ, etc.). Editables y visibles en /info/<slug>"`. Action: primary `app-btn` (`add` icon) `"Crear página"` → `goToNew()`.
2. Toolbar `.pages-list__toolbar`: `<app-pill-tabs>` + `<app-search-input placeholder="Buscar">` (two-way `[(value)]="searchText"`).
   - Tabs with counts: `Todas` (non-deleted), `Publicadas`, `No publicadas`, `Eliminadas`.
3. `<mat-progress-bar mode="indeterminate">` while `loading()`.
4. `<app-table-card>` → `.pages-list__scroll` → `mat-table.app-table.app-table--comfy`. `displayedColumns = ['title', 'slug', 'is_published', 'updated_at', 'actions']`:
   - **title** ("Título") — bold `.pages-list__title`.
   - **slug** ("Slug") — `.app-slug-chip` showing `/info/{{ row.slug }}`.
   - **is_published** ("Publicada", centered) — green dotted pill `"Publicada"` or neutral pill `"Borrador"`.
   - **updated_at** ("Actualizada") — `date: 'short'`, mono/dim.
   - **actions** — non-deleted rows: ghost sm `app-btn` `"Editar"` + danger `app-icon-btn` (`delete_outline`, label `"Eliminar"`, disabled while `saving() === row.id`); deleted rows: ghost sm `"Restaurar"`.
5. Empty state `.pages-list__empty`: `"Sin páginas en este filtro. Crea una con el botón de arriba."`

### Edit (`/admin/pages/new`, `/admin/pages/:id/edit`)

1. `<app-back-header>` — kicker `"Contenido"`, title `"Editar página"` / `"Crear página"`, `backLink="/admin/pages"`.
2. Progress bar while loading an existing row.
3. Form section `"Datos"` (`app-form-section` + `app-form-grid [cols]="2"`):
   - `Título` (required; error `"Necesitamos un título."`).
   - `Slug (URL)` — mono field with `matTextPrefix` `/info/`, placeholder `sobre-nosotros`, normalized on blur; edit-mode hint `"El slug no se puede cambiar después de crear la página."`; validation error `"Solo letras minúsculas, números y guiones."`
   - `Descripción (SEO)` — 2-row textarea spanning both columns, placeholder `"Resumen breve de la página, máx. 160 caracteres."` (length is not enforced).
   - `Orden` — number input, min 0.
   - `<app-labeled-toggle formControlName="is_published">Publicada</app-labeled-toggle>`.
4. Form section `"Contenido (HTML)"`, subtitle `"Pegá el HTML directamente. Vista previa al lado."` — `.page-edit__editor` two panes: labeled `HTML` textarea (`.ps-mono-textarea.page-edit__textarea`, `rows="22"`, `spellcheck="false"`) and labeled `Vista previa` div with `[innerHTML]="previewHtml()"` (`.page-edit__preview`).
5. `<app-form-footer>` — primary label `Guardando…` / `Guardar` (edit) / `Crear página` (new); disabled when `form.invalid || saving()`; `[sticky]="false"`; secondary → `cancel()` back to `/admin/pages`.

Shared primitives → [design-manifest](../../design-manifest.md).

## Services & backend

`StaticPagesService` — all plain PostgREST calls on **`static_pages`** (no RPCs):

- `list({ includeDeleted })` — select `*`, ordered `sort_order asc, title asc`; `includeDeleted !== true` adds `.is('deleted_at', null)`. The list screen always calls `list({ includeDeleted: true })`.
- `listActive()` — customer-facing: `deleted_at is null`, `is_published = true`, same ordering (used by the storefront footer/static pages, not this screen).
- `getBySlug(slug)` / `getById(id)` — `maybeSingle()`.
- `create(input: StaticPageInsert)` — insert + return row.
- `update(id, patch: StaticPageUpdate)` — update by id + return row.
- `softDelete(id)` — sets `deleted_at = new Date().toISOString()`.
- `restore(id)` — sets `deleted_at = null`.

Table `static_pages`: `id uuid` PK, `slug text unique`, `title text`, `content text default ''`, `meta_description text`, `is_published boolean default true`, `sort_order integer default 0`, `deleted_at`, `created_at`, `updated_at` (touch trigger `static_pages_set_updated_at`). RLS: `static_pages_public_read` (anon+authenticated, only `is_published = true and deleted_at is null`) and `static_pages_admin_all` (`is_admin()`). Partial index `static_pages_published_idx` on `(sort_order, slug)` for the published set.

## State & data flow

### PagesList

- Signals: `rows: StaticPageRow[]`, `loading`, `saving: string | null` (row id being deleted), `filter: 'all' | 'published' | 'unpublished' | 'deleted'` (default `'all'`), `searchText: signal('')`.
- `searchValue` = `toSignal(toObservable(searchText).pipe(debounceTime(200), distinctUntilChanged()))` — 200 ms debounced search.
- Computeds: `visibleRows` (case-insensitive substring match on `` `${title} ${slug}` ``, then tab filter — `all/published/unpublished` exclude deleted; `deleted` shows only deleted) and `tabs` (counts from the full row set; `Todas` counts live rows only).
- Constructor → `refresh()` (full refetch). `onDelete(row)` → `softDelete` → `refresh` → snackbar `"Página eliminada"` with action **`Deshacer`** (5000 ms) wired to `onRestore(row.id)`; `onRestore` also refetches. Errors → snackbar `errorMessage(err)` / `'Error desconocido'`.

### PageEdit

- Signals: `id: string | null` (from `route.snapshot.paramMap.get('id')` in `ngOnInit`), `mode = computed(() => id() ? 'edit' : 'new')`, `loading`, `saving`, `originalSlug`.
- Reactive form (`fb.nonNullable.group`): `slug` (`required`, `minLength(2)`, pattern `/^[a-z0-9-]+$/`), `title` (`required`), `meta_description`, `is_published` (default `true`), `sort_order` (default 0, `required`, `min(0)`), `content` (default `''`).
- `contentValue = toSignal(form.controls['content'].valueChanges, …)` feeds `previewHtml = computed(() => sanitizer.bypassSecurityTrustHtml(contentValue() ?? ''))` — the live preview renders admin HTML unsanitized.
- `loadExisting(id)`: missing row → snackbar `"Página no encontrada."` + redirect to `/admin/pages`; otherwise `patchValue`, then `slug` control is **disabled** (`emitEvent: false`) and the form marked pristine.
- `onSlugBlur()` normalizes: trim, lowercase, non-`[a-z0-9-]` runs → `-`, collapse `-+`, strip leading/trailing `-`.
- `onSubmit()`: invalid/saving → `markAllAsTouched` and bail. Builds `StaticPageInsert` from `getRawValue()` (slug trim+lowercase, title trim, `meta_description` empty→null, `sort_order` `Number(...) || 0`). Edit mode destructures the slug **out** of the payload before `update(id, patch)`; new mode calls `create(payload)`. Snackbars `"Página actualizada"` / `"Página creada"` (3000 ms) and navigates back to `/admin/pages` in both cases.

## Behaviors & edge cases

- Soft delete is undoable from the snackbar action; deleted rows live under the `Eliminadas` tab with a `Restaurar` button. There is no hard delete in the UI.
- Unpublished ("Borrador") and deleted pages are invisible to the public via RLS — `getBySlug` on the storefront simply returns null for them.
- Slug is immutable after creation (disabled control + stripped from the update patch) so live `/info/:slug` URLs never break.
- Duplicate slug on create fails with the Postgres unique-violation message surfaced raw in the snackbar (no friendly mapping).
- Search + tab filters are entirely client-side over the one fetched list.
- Seeded pages: `sobre-nosotros` (migration seed, empty content), plus `estado-de-cartas` and welcome-page seeds in later migrations.

## Gotchas / invariants

- **`previewHtml` uses `bypassSecurityTrustHtml`** — intentional (admins-only RLS, trusted authors), but any HTML pasted here executes as-is in the preview *and* on the public `/info/:slug` page. Never reuse this pattern for customer-supplied content.
- **A soft-deleted page still occupies its unique slug** — creating a new page with the same slug fails until the old one is restored (and edited) or removed in SQL.
- `sort_order` drives the public ordering (`sort_order asc, title asc` in `listActive()`); the admin list uses the same server ordering, not `updated_at`.
- `meta_description` placeholder mentions a 160-character max but no validator enforces it.
- In edit mode `form.getRawValue()` is required because the slug control is disabled; the slug still passes validation from its loaded value.
- `PageEdit` reads the route param via `route.snapshot.paramMap` (not `withComponentInputBinding` inputs, unlike `RaffleDetail`) — navigating between two edit URLs without leaving the component would not reload (not reachable from current UI).
- Table/search primitives come from `src/app/shared/table/`; the editor uses the `src/app/shared/forms/` set (`app-back-header`, `app-form-section`, `app-form-grid`, `app-form-footer`).

## Related docs

- [static-page (storefront)](../storefront/static-page.md) — the public `/info/:slug` renderer.
- [shell-header-footer (storefront)](../storefront/shell-header-footer.md) — where published pages are linked.
- [design-manifest](../../design-manifest.md) — shared table/form primitives.
- [data-model](../../architecture/data-model.md), [auth-and-roles](../../architecture/auth-and-roles.md) (RLS / `is_admin`).
