# Library (designer reference)

> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose

`/library` is an internal designer/developer reference gallery: every Angular Material component the project uses, rendered live with the Vault Light theme, plus the typography scale, the Material and brand color palettes, and the brand utility classes. It is the visual regression surface for theme work — after touching anything in `src/styles/`, open `/library` to verify the change. All data on the page is hardcoded demo content; nothing touches Supabase.

## Route & access

- **Path:** `/library` — top-level route in `src/app/app.routes.ts`, lazy `loadComponent` → `Library`. **No shell** (neither UserShell nor AdminShell), **no guards** (not even `maintenanceGuard` — it stays reachable during maintenance).
- Must be declared **before** the empty-path UserShell route or the catch-all would swallow it (CLAUDE.md route-ordering rule).
- Not linked from any app navigation; the page itself says so: "Not linked from app navigation; reach it via `/library`." The only in-page navigation is "Back to store" → `/` and the fragment-based table of contents (`routerLink="/library"` + `[fragment]`).

## Files

- `src/app/library/library.ts` — `Library` component (standalone, selector `app-library`, `AfterViewInit`). Imports ~28 Material modules per-component (the project-wide convention — no barrel), provides `provideNativeDateAdapter()` for the datepicker demo. Holds the demo data: `toc`, `materialSwatches` / `brandSwatches` (typed `Swatch { name, cssVar, hex, textOn }`), `autocompleteSets`, `chips` signal, `requiredEmail` FormControl, `tableColumns` + `tableData` (`MatTableDataSource<InventoryRow>`, 12 fake cards), `progressValue` signal.
- `src/app/library/library.html` — the gallery: `.brand-bar` strip, header, `.library-layout` (sticky `.library-toc` aside + `.library-content` main) with 17 `section.lib-section` blocks separated by `mat-divider`.
- `src/app/library/library.scss` — page-local layout and sample styles (`.library-shell`, `.library-toc`, `.lib-section`, `.type-spec`, `.swatches`/`.swatch`, `.form-grid`, `.card-grid`, `.table-wrap`, `.util-block`; responsive breakpoints at 1100 px and 720 px).
- `src/app/library/library-dialog.ts` — `LibraryDialog`, a minimal inline-template demo dialog ("Confirmar acción" / "Este es un diálogo de ejemplo…" with "Cancelar" and "Confirmar" buttons).
- Theme sources it showcases (edit these, verify here): `src/styles/_theme-colors.scss`, `_brand-tokens.scss`, `_brand-utilities.scss`, `_material-overrides.scss` (plus admin-only `_admin-table.scss`, `_admin-forms.scss`, not demoed here).
- `brand-guidelines.html` (repo root) — the full design-system spec this page implements; open it in a browser.

## UI anatomy

1. **`.brand-bar`** — the brand-red gradient strip (one of brand red's few allowed uses).
2. **Header** (`.library-header`): "Back to store" link (arrow icon → `/`), `<h1 class="display">` "Library", and the lead paragraph "Reference page for designers — every Material component the project uses, rendered with the Vault Light theme."
3. **TOC aside** (`.library-toc`, eyebrow "Index") — 17 fragment links from the `toc` array.
4. **Sections** (ids = TOC targets, numbered eyebrows "01 — Typography" … "17 — Brand utilities"):
   - `typography` — Manrope / IBM Plex Mono specimens: display ("La caza continúa."), H2, eyebrow ("★ Pieza destacada · Verificada"), product name, body, mono meta ("SCARLET & VIOLET · 270/264 · NM · ENGLISH"), regular price and sale price (`.price--sale` + `.price--original`).
   - `palette` — "Material system tokens": 12 swatches with name/hex/CSS var (Primary `#1E3A8A`, Error `#B91C1C`, Surface `#FBFAF7`, etc. — hexes are **hardcoded** in `materialSwatches`). Then "Brand-only tokens": 8 swatches (`--brand-red #CE1126`, `--brand-red-dark`, `--brand-red-soft`, `--accent-amber #D4941C`, `--accent-amber-soft`, `--success`, `--warning`, `--danger #B91C1C`) with the explanatory copy: "Brand red is restricted to two uses: `.brand-bar` and the `AGOTADA` badge. Sale prices (`.price--sale`) use Amber Glow. Danger (the form-error red) is intentionally a different hue."
   - `buttons` — text/filled/outlined/raised, with-icon, disabled, FAB/mini-FAB/icon buttons.
   - `forms` — outline + fill form fields, a validated email control (`requiredEmail`; its error copy is self-documenting: "Email is required — error color should be Danger #B91C1C, not brand red."), select, textarea, autocomplete (filtered via `autocompleteFilter` signal + `filteredSets` getter), datepicker; checkboxes (incl. indeterminate/disabled), radio group (NM/LP/MP/HP), slide toggles, single and range sliders.
   - `chips` — static set (incl. `highlighted` "Destacada" and disabled) + removable chips backed by the `chips` signal / `removeChip()`.
   - `cards` — outlined vs elevated, plus two **product-card demos** reusing the real storefront classes: `.product-card--on-sale` (sale + original price) and `.product-card--sold-out` (triggers the AGOTADA badge from `::after`).
   - `lists` — basic, two-line (icon + title + line), nav list.
   - `tabs` — "Detalles" / "Envío" / "Reseñas".
   - `expansion` — accordion: "Verificación", "Envíos", "Pagos".
   - `stepper` — 3 steps "Carrito" → "Envío" → "Pago".
   - `menu` — "Acciones" dropdown (añadir al carrito / wishlist / compartir).
   - `tooltip` — above/below/right positions.
   - `progress` — determinate (bound to `progressValue()` = 60) + indeterminate bars and spinners.
   - `badge` — cart/notification/error badges (primary / accent / warn).
   - `feedback` — "Open snackbar" → `openSnackBar()` ("Pedido recibido. Te escribimos cuando esté listo." / action "Cerrar", duration 4000) and "Open dialog" → `openDialog()` (opens `LibraryDialog`, width 440px).
   - `table` — sortable + paginated inventory table (`matSort`, `mat-paginator` pageSize 5); stock 0 renders "Agotada" in `var(--brand-red)` inline style.
   - `brand` — the brand utilities outside Material: `.brand-bar`, `.brand-eyebrow`, `.brand-mono`, `.price--sale + .price--original`.

## Services & backend

None. The only injected services are `MatSnackBar` and `MatDialog` for the feedback demos. No Supabase, no HTTP — the page is fully static demo data and safe to load in any environment.

## State & data flow

- Signals: `autocompleteFilter` (string, fed by `onAutocompleteInput()`), `chips` (`string[]`, mutated by `removeChip()`), `progressValue` (fixed 60).
- `filteredSets` is a plain getter (not a computed) filtering `autocompleteSets` by the signal value.
- `paginator` / `sort` via `viewChild.required(MatPaginator/MatSort)`, wired to `tableData` in `ngAfterViewInit`.
- No inputs, effects, or reload triggers.

## Behaviors & edge cases

- Reachable during maintenance mode and while signed out — there is nothing to protect.
- TOC links navigate to `/library#fragment`; `withInMemoryScrolling` in `app.config.ts` handles the anchor scroll.
- The product-card demos depend on global storefront classes (`.product-card`, `.price--sale`, the sold-out `::after` badge) — if those global styles change, this page reflects it immediately, which is the point.
- Demo images `assets/images/card2.jpg` / `card3.jpg` must exist for the card-media samples.

## Gotchas / invariants

- **Swatch hexes are hardcoded twins of the SCSS tokens.** `materialSwatches` / `brandSwatches` carry literal hex strings; changing a token in `src/styles/_theme-colors.scss` or `_brand-tokens.scss` does **not** update the labels here (the swatch background uses the hardcoded hex too, via `[style.background]="s.hex"` — not the CSS var). Update `library.ts` alongside any palette change or the reference page lies.
- **Brand-red copy drift:** the palette section says brand red has "two uses" (`.brand-bar`, AGOTADA) and that sale prices use Amber Glow — and `_brand-utilities.scss` confirms `.price--sale { color: var(--accent-amber) }`. CLAUDE.md instead lists **three** brand-red uses including "sale prices (`.price--sale`)". The code (and this page) are authoritative: sale prices are **amber**, not brand red.
- The table's "Agotada" cell uses an inline `style="color: var(--brand-red)"` — a deliberate demo of the sold-out semantics; don't copy that inline-style pattern into real screens (use the sanctioned classes).
- `provideNativeDateAdapter()` is provided **at this component** for the datepicker demo — datepickers elsewhere need their own adapter provision.
- This is the one place Material modules are imported en masse (28 modules); everywhere else imports stay minimal per component. Don't treat this file as an import template.
- Keep `/library` above the empty-path UserShell route in `app.routes.ts` (same ordering rule as `/admin` and `/mantenimiento`).
- Adding a Material component to the app? Add its demo section (+ `toc` entry) here so the theme coverage stays complete — the `theme` skill treats this page as the verification surface.

## Related docs

- [Theming](../architecture/theming.md) — Vault Light tokens, Material overrides, the brand-red rule.
- [Design manifest](../design-manifest.md) — the design-system source of truth (`brand-guidelines.html`).
- [Shared components](../architecture/shared-components.md) — the real product card whose classes the demos reuse.
- [Routing & guards](../architecture/routing-and-guards.md) — why `/library` sits above the UserShell catch-all.
- [Home](./storefront/home.md) — a real consumer of the brand utilities shown here.
