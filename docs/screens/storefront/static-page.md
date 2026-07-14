# Static info page (/info/:slug)

> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose

Renders one admin-managed informational page (`static_pages` row) as trusted HTML inside the storefront shell — the replacement for OpenCart's "information/information" pages (About Us, shipping policy, card-condition guide, etc.). One component serves every slug; content is edited in `/admin/pages`.

## Route & access

- Path: `/info/:slug`, child of the empty-path `UserShell` route in `src/app/app.routes.ts` (so it sits behind `maintenanceGuard` like the rest of the storefront). No other guard — public.
- `:slug` binds directly to the component's `slug` input via `withComponentInputBinding()`.
- Reached from: the left nav "Información" section ("Sobre nosotros" → `/info/sobre-nosotros`, "Políticas de envío" → `/info/politica-pedidos-envios`) and the footer ("Sobre nosotros", "Estado de cartas" → `/info/estado-de-cartas`, "Métodos de pago y envío" → `/info/metodos-pago-envio`, "Política de pedidos y envíos" → `/info/politica-pedidos-envios`).

## Files

- `src/app/user/static-page/static-page.ts` — `StaticPage` component: slug input, fetch effect, loading/not-found state.
- `src/app/user/static-page/static-page.html` — progress bar, title + HTML body, not-found block.
- `src/app/user/static-page/static-page.scss` — page layout/typography for the rendered HTML.
- `src/app/core/catalog/static-pages.service.ts` — `StaticPagesService`: `listActive()`, `list()`, `getBySlug()`, `getById()`, `create()`, `update()`, `softDelete()`, `restore()` over table `static_pages`.
- `supabase/migrations/20260510000000_static_pages.sql` — table + RLS + `sobre-nosotros` seed (empty content).
- `supabase/migrations/20260510000100_seed_estado_de_cartas.sql` — seeds `estado-de-cartas` ("Estado de cartas", full NM/LP/MP/HP/DM guide, `sort_order` 20).
- `supabase/migrations/20260510000300_seed_bienvenida.sql` — seeded `bienvenida` (historical: its content was copied into an inactive `announcements` row and the page soft-deleted by `20260714000000_announcements.sql`).
- `supabase/migrations/20260525001500_fix_shipping_policy_slug.sql` — renames the typo'd slug `politica-peiddos-envios` → `politica-pedidos-envios`.

## UI anatomy

`section.static-page`, top to bottom:

1. `mat-progress-bar mode="indeterminate"` — while `loading()`.
2. When `page()` resolves: `header.static-page__header` with `<h1>{{ p.title }}</h1>`, then `article.static-page__content` with `[innerHTML]="safeContent()"` (the row's HTML, sanitization bypassed). Note the seeded `estado-de-cartas` body intentionally starts at `<h2>` because the component renders the title itself.
3. Not-found block `.static-page__not-found` (when `notFound() && !loading()`): `mat-icon` `article`, `<h1>` "Página no encontrada", `<p class="muted">` "La página que buscas no existe o fue movida.", and a `mat-stroked-button` link "Volver al inicio" → `/`.

## Services & backend

- `StaticPagesService.getBySlug(slug)` — `SELECT * FROM static_pages WHERE slug = :slug` with `.maybeSingle()`. **No client-side `is_published`/`deleted_at` filter** — visibility for shoppers is enforced by RLS policy `static_pages_public_read` (`is_published = true AND deleted_at IS NULL` for `anon, authenticated`); `static_pages_admin_all` gives admins full read/write via `public.is_admin()`.
- Table `static_pages` columns: `id uuid`, `slug text unique`, `title text`, `content text default ''`, `meta_description text`, `is_published boolean default true`, `sort_order integer default 0`, `deleted_at timestamptz`, `created_at`, `updated_at` (trigger `static_pages_set_updated_at` via `tg_set_updated_at()`). Partial index `static_pages_published_idx` on `(sort_order, slug)` where published and not deleted.
- Other service methods (`listActive`, `list`, CRUD) serve `/admin/pages`, not this screen.

## State & data flow

- Input: `slug = input.required<string>()` — bound from the `:slug` route param.
- Signals: `page` (`StaticPageRow | null`), `loading` (starts `true`), `notFound`.
- Computed: `safeContent` — `DomSanitizer.bypassSecurityTrustHtml(page()?.content ?? '')`.
- Constructor `effect`: whenever `slug()` changes (including first render and in-place navigation between `/info/*` pages, which reuses the component instance), calls `fetch(slug)` — sets `loading=true`, clears `page`/`notFound`, awaits `getBySlug`; `null` row or a thrown error → `notFound=true`; finally `loading=false`.
- `ngOnInit()` is an intentional no-op (comment: initial fetch is handled by the slug effect).
- No caching: every slug change refetches; no storage keys, no query params.

## Behaviors & edge cases

- **Loading**: indeterminate progress bar only; previous content is cleared immediately on slug change (no stale flash, but also a blank gap during fetch).
- **Missing / unpublished / soft-deleted page**: identical "Página no encontrada" state for shoppers (RLS hides the row, so the client can't distinguish). Network errors also collapse into not-found rather than a distinct error state.
- **Admin sessions differ**: `static_pages_admin_all` lets a signed-in admin fetch unpublished and soft-deleted rows, so an admin CAN preview a draft at `/info/:slug` that a shopper would see as not-found.
- **Empty content published**: a row with `content = ''` (like the seeded `sobre-nosotros` before the admin pastes copy) renders the title over an empty article — not the not-found state.
- **HTML is trusted**: sanitization is bypassed by design (admin-only authorship). Scripts still won't execute via `innerHTML`, but arbitrary markup/styles will render.

## Gotchas / invariants

- **Visibility relies entirely on RLS** — if a future view/policy change relaxes `static_pages` reads, unpublished drafts leak to `/info/:slug` with no client-side backstop (compare the `security_invoker` lesson on product views).
- **Dead code**: the empty `ngOnInit()` (and the `OnInit` interface) exist only to host a comment.
- **Seeded slugs the app links to**: `sobre-nosotros`, `estado-de-cartas`, `politica-pedidos-envios` (post-rename). The footer's `/info/metodos-pago-envio` has **no seed migration** — it 404s ("Página no encontrada") until created in `/admin/pages`. `/info/bienvenida` also 404s now: the page was soft-deleted when the welcome modal moved to the announcements system (`20260714000000`, see [dialogs](./dialogs.md)).
- **Slug renames are breaking**: nav/footer links and the dialog services hardcode slugs; renaming in admin breaks them silently (`20260525001500` exists precisely because of a slug typo that left the footer link dead).
- The `estado-de-cartas` seeded body ends with an `<img>` hot-linked from the live OpenCart domain (`https://poke-singles.com/image/catalog/Logo-Borde-400x400.png`) — it will break after cutover unless the content or asset is migrated.
- `StaticPagesService` casts the Supabase client to `any` for every query (the table postdates the last `database.types.ts` regen pattern used elsewhere) — no compile-time schema safety here.

## Related docs

- [dialogs](./dialogs.md) — the card-conditions dialog renders `estado-de-cartas` in a modal; the announcement modal has its own table now
- [shell-header-footer](./shell-header-footer.md) — nav/footer entry points to `/info/*`
- [../admin/pages.md](../admin/pages.md) — admin CRUD for `static_pages`
- [../../architecture/data-model.md](../../architecture/data-model.md)
- [../../architecture/routing-and-guards.md](../../architecture/routing-and-guards.md)
