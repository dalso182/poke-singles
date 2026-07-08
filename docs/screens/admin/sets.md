# Admin — Sets

> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose

Browse and maintain the `sets` table (TCG expansions, ~250 rows): an accordion of series groups, each holding a grid of clickable set cards that open an edit/delete dialog. Also hosts a collapsible "add set manually" form for pre-order or non-TCGdex sets. Bulk import of the TCGdex set catalog does **not** live here — it's the "Importar histórico de sets de TCGdex" operation on `/admin/config` (`SetsService.syncFromTcgdex()`); the page header explicitly points there.

## Route & access

- **Path:** `/admin/sets` (child of the lazy `AdminShell` route; `canActivate: [adminGuard]` + `canActivateChild: [adminGuard]` on the parent `admin` route in `src/app/app.routes.ts`).
- **Sidenav:** group "Catálogo" → item `Sets` (icon `collections_bookmark`) with a **count badge** — `AdminShell.setCount` = `sets.list().length` fetched at shell bootstrap.
- **Query params:** none.

## Files

| File | Role |
|---|---|
| `src/app/admin/sets/sets.ts` | `Sets` component (`selector: 'app-admin-sets'`) — list, series grouping, add form, dialog launcher |
| `src/app/admin/sets/sets.html` | Header, add card, series accordion + set-card grid |
| `src/app/admin/sets/sets.scss` | BEM styles under `.sets__*` |
| `src/app/admin/sets/set-detail-dialog.ts` | `SetDetailDialog` component (`selector: 'app-set-detail-dialog'`) + `SetDetailDialogResult` union |
| `src/app/admin/sets/set-detail-dialog.html` / `.scss` | Dialog template/styles (`.set-detail__*`) |
| `src/app/core/catalog/sets.service.ts` | `SetsService` — cached list, CRUD, `deleteIfEmpty`, count RPCs, TCGdex hydration/sync |
| `src/app/core/catalog/catalog.types.ts` | `SetRow`, `SetInsert`, `SetUpdate` (`SetUpdate = Partial<Omit<SetInsert, 'code'>>` — code is immutable) |
| `supabase/migrations/20260501205916_initial_catalog_schema.sql` | `public.sets` table + RLS |
| `supabase/migrations/20260521000000_sets_printed_total.sql` | Adds `printed_total` + backfill from cached TCGdex payloads |
| `supabase/migrations/20260512000000_set_product_counts.sql` | RPC `set_product_counts` (storefront facet — not used by this screen) |

## UI anatomy

1. `<app-page-header>` — `kicker="Catálogo"`, `title="Sets"`, `sub="Agrupados por serie. Click en un set para ver el detalle. Para importar el histórico de TCGdex, ve a Configuración → Importar."`. Projected action: `<app-btn variant="primary">` toggling `addOpen` — flips between icon `add` / `"Agregar set manual"` and icon `close` / `"Cancelar"`.
2. **Add card** (`mat-card.sets__add`, only while `addOpen()`): outline fields `Código` (placeholder `SV3`), `Nombre` (placeholder `Obsidian Flames`), `Serie` (placeholder `Scarlet & Violet`), `Fecha de release` (`type="date"`), `Total impreso` (`type="number" min="1"`, placeholder `151`), `URL del símbolo` (placeholder `https://…`, class `.sets__url-field`), then `<app-btn variant="primary">Crear</app-btn>` disabled while invalid or `addSaving()`.
3. `mat-progress-bar mode="indeterminate"` while `loading()`.
4. Empty state (`mat-card.sets__empty-card`, when `!loading() && totalSets() === 0`): `"Aún no hay sets. Importa el histórico desde **Configuración** o crea uno manualmente con el botón de arriba."`
5. **Accordion** (`.sets__accordion`, when `totalSets() > 0`): one `mat-expansion-panel.sets__panel` (`hideToggle`) per series group. Header: glyph icon `collections_bookmark`, series label, `"{n} set"`/`"{n} sets"` count, `"Expandido"` tag while open, chevron `expand_more`. Body: `.sets__grid` of `<button.sets__card>` per set — set `code`, symbol image (`symbol_image_url`, fallback icon `collections_bookmark`), name, `release_date || '—'`, chevron `chevron_right`, `aria-label="Ver detalle de {name}"`.
6. **Detail dialog** (`SetDetailDialog`, `width: '560px'`, `maxWidth: '95vw'`, `autoFocus: 'first-tabbable'`): title = mono `code` chip + name; symbol image when present; editable fields `Nombre` (required), `Serie`, `Fecha de release`, `Total impreso` (`min="1"`, placeholder `151`), `URL del símbolo`. Actions: `Eliminar` (stroked, warn, icon `delete_outline`), spacer, `Cancelar`, `Guardar` (flat primary, disabled while invalid/pristine/saving/deleting). `mat-progress-bar` while `saving() || deleting()`.

The `code` field is not editable anywhere after creation (dialog doesn't render it as an input; `SetUpdate` omits it).

## Services & backend

`SetsService` (root-provided; also injects `TcgdexService`):

- `list({ refresh? })` — `from('sets').select('*')` ordered by `release_date` desc (`nullsFirst: false`) then `name` asc. **Process-lifetime cache**: a `cache` signal + `inflight` promise de-dupe; `refresh: true` bypasses (this screen always refreshes). Mutations call `invalidate()` (clears both `cache` and `countsCache`).
- `get(id)` / `findByCode(code)` — `maybeSingle()` lookups.
- `create(input: SetInsert)` / `update(id, patch: SetUpdate)` — plain writes + `invalidate()`.
- `deleteIfEmpty(id)` — counts `products` with `set_id = id` (`{ head: true, count: 'exact' }`); if `> 0` returns `{ deleted: false, productCount }`, else deletes and returns `{ deleted: true, productCount: 0 }`. This is the only delete path.
- `counts({ refresh? })` — RPC `set_product_counts`, session-cached; `countsForQuery(q, { onSaleOnly, categorySlug })` — RPC `search_set_counts`. **Both are storefront facet consumers (`/buscar` Set filter); the admin Sets screen does not surface product counts.**
- `findOrCreateFromTcgdex(card)` — add-product flow: look up by `card.set.id`; on miss hydrate the full set from TCGdex and insert; on hit with `printed_total == null`, backfill it from TCGdex (self-healing).
- `syncFromTcgdex()` — the `/admin/config` bulk import: lists all TCGdex sets, inserts missing ones, backfills `printed_total` on existing null rows, never overwrites admin edits; returns `{ added, backfilled, skipped, failed, excluded }`. Sets in `EXCLUDED_SERIES` (`'Pokémon TCG Pocket'`) are skipped.
- `hydrateSetFromTcgdex(code)` (private) — maps TCGdex `serie.name` → `series`, `releaseDate`, `symbol` + `.webp` → `symbol_image_url`, `cardCount.official` → `printedTotal`; any error returns all-nulls.

Backend:

- Table `public.sets` (initial schema): `id uuid pk`, `code text not null unique`, `name text not null`, `series text`, `release_date date`, `symbol_image_url text`, `created_at`. RLS: `sets_public_read` + `sets_admin_all` (`public.is_admin()`).
- `20260521000000_sets_printed_total.sql`: `printed_total int check (printed_total is null or printed_total > 0)`; backfilled from cached card payloads (table named `tcgdex_cards` at that point; renamed to `card_details` in `20260525002000_neutralize_card_source_names.sql`) (`data->'set'->'cardCount'->>'official'`, one card per set is enough). Enables "#15/151" card-number rendering and `N/M` search queries.
- `20260512000000_set_product_counts.sql`: RPC `set_product_counts()` returns `(set_id uuid, in_stock_count bigint)` for `active = true and quantity > 0 and price > 0`; `security definer`, granted to `anon, authenticated`; sets with 0 in-stock products are absent from the result.

## State & data flow

Signals on `Sets`: `rows = signal<SetRow[]>([])`, `loading`, `addOpen`, `addSaving`; `addForm = fb.nonNullable.group({ code, name, series, release_date, symbol_image_url, printed_total })` (only `code` and `name` are `Validators.required`; all fields are strings — `printed_total` is converted with `Number()` on submit, empty → `null`).

- `grouped = computed<SeriesGroup[]>()` — buckets rows by `series` (null key `'__no_series__'`); inside each group sets sort by `release_date` **descending** (string `localeCompare`) then name asc; groups sort alphabetically by label with the null-series group (`NO_SERIES_LABEL = 'Sin serie'`) forced last.
- `totalSets = computed(() => this.rows().length)`.

Flow: constructor calls `refresh()` (floating promise) → `service.list({ refresh: true })`. `onAdd()` → `create` with empty strings coerced to `null` → reset, close card, `refresh()`, snackbar `"Set creado"`. `openDetail(row)` opens `SetDetailDialog` with the row as `MAT_DIALOG_DATA`; on close, a `{ kind: 'updated', row }` result patches that row in place (no refetch) and `{ kind: 'deleted', id }` filters it out.

`SetDetailDialog` flow: `form` seeded from `data` (numbers stringified); `onSave()` (guards invalid/pristine) → `service.update` → snackbar `"Set actualizado"` → close with updated row. `onDelete()` → native `confirm('¿Eliminar el set "{name}"? Sólo se permite si no tiene productos.')` → `deleteIfEmpty`; if blocked, snackbar `` `No se eliminó: el set tiene ${productCount} producto(s) asociado(s).` `` and the dialog stays open; on success `"Set eliminado"` + close. Errors: `MatSnackBar` with `errorMessage(err)`, fallback `"Error desconocido"`.

## Behaviors & edge cases

- **Delete is guarded, not cascading:** `deleteIfEmpty` refuses when any product references the set. (There is no DB-side FK guarantee documented here — the check is a client-side count immediately before the delete, so a race with a concurrent product insert is theoretically possible.)
- **`printed_total` self-heals:** older rows imported before the column existed get it backfilled the next time `findOrCreateFromTcgdex` touches the set (add-product card pick) or when `syncFromTcgdex` runs; the sync counts these as `backfilled`.
- Add form does no code normalization — whatever is typed becomes the unique `code` (TCGdex codes are lowercase like `sv03`, manual entry can differ; `findByCode` is exact-match).
- Dialog save closes only on success; the accordion updates from the dialog result without refetching, so `created_at`-independent fields stay consistent but ordering/grouping is **not** recomputed against a fresh fetch (it is recomputed locally since `grouped` derives from `rows`).
- Sets with no `release_date` sort last inside their group (empty-string compare) and render `—` on the card.
- The shell's sidenav Sets badge is populated by a separate `sets.list()` call at shell bootstrap and does not live-update when you add/delete here until the shell reloads.

## Gotchas / invariants

- **`code` is immutable by type-system convention** (`SetUpdate = Partial<Omit<SetInsert, 'code'>>`): product slugs, TCGdex lookups (`findByCode`) and the add-product flow key on it.
- The per-set product counts RPC (`set_product_counts`) lives in `SetsService` but is **not surfaced on this screen** — it drives the storefront Set facet. Don't remove it when refactoring the admin screen.
- `SetsService.list()` is cached for the process lifetime; any consumer that mutates `sets` outside the service (e.g. raw SQL) leaves the cache stale until `invalidate()` or a `refresh: true` call.
- `grouped()` sorts `release_date` as strings — safe for ISO `YYYY-MM-DD` values, wrong for anything else.
- `hydrateSetFromTcgdex` swallows all TCGdex errors into all-null fields, so a transient API outage during manual sync can create sets with missing series/date/symbol/total (existing rows are never overwritten, so re-running the sync does **not** repair those except `printed_total`).
- `syncFromTcgdex`'s series exclusion (`EXCLUDED_SERIES`) only applies to **new** inserts during sync; a Pocket set created manually or via card pick would not be filtered.
- Deleting is admin-RLS-gated (`sets_admin_all`); `sets_public_read` exposes every set (no `active` flag exists on sets).

## Related docs

- [Config (TCGdex set import + exchange rate)](./config.md)
- [Add product (findOrCreateFromTcgdex on card pick)](./add-product.md) · [Products list (Set filter)](./products-list.md)
- [Categories](./categories.md) · [Filters](./filters.md)
- [Admin shell & nav](./admin-shell.md)
- [Data model](../../architecture/data-model.md) · [Shared components](../../architecture/shared-components.md)
