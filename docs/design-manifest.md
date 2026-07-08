# Poke-Singles — Component & Token Manifest

Generated from source under `src/`. Documents reusable/presentational components in
`src/app/shared/`, the global design tokens in `src/styles/`, global utility classes, and
markup conventions. Page/route-level smart components (under `src/app/user/`, `src/app/admin/`,
`src/app/home/`, `src/app/library/`) are intentionally excluded.

All shared components use Angular **signal inputs** (`input()` / `input.required()` / `model()`)
and the `output()` function — none use the legacy `@Input()` / `@Output()` decorators. All
templates are **inline** (no external `.html` files in `shared/`).

---

## 1. Reusable UI components

### Buttons & actions

| Selector | Purpose | Inputs | Outputs | Projection | Wraps |
|---|---|---|---|---|---|
| `app-btn` | Table-system button (escapes the global uppercase mat-button override); bind `(click)` on host | `variant: 'primary'\|'ghost'\|'danger'\|'subtle'` = `'ghost'`; `size: 'md'\|'sm'` = `'md'`; `disabled: boolean` = `false` | none (bind `(click)` on host) | default (text + optional icon) | no |
| `app-icon-btn` | Compact 28×28 icon-only button; project a `<mat-icon>` | `label: string` (required, aria-label+title); `tone: 'default'\|'danger'` = `'default'`; `disabled: boolean` = `false` | none (bind `(click)` on host) | default (the icon) | no (styles projected `mat-icon`) |
| `app-load-more` | "Cargar más" stroked button; disables + shows inline spinner while loading | `loading: boolean` = `false` | `loadMore: void` | none | no |

### Forms & inputs

| Selector | Purpose | Inputs | Outputs | Projection | Wraps |
|---|---|---|---|---|---|
| `app-toggle` | Switch toggle; one-way `[on]` or two-way `[(on)]` | `on: boolean` (model) = `false`; `size: 'md'\|'sm'` = `'md'`; `disabled: boolean` = `false` | `change: boolean` | none | `<button role="switch">` + `mat-icon` |
| `app-checkbox` | Plain square checkbox (e.g. Productos "Destacado") | `on: boolean` (model) = `false`; `disabled: boolean` = `false` | `change: boolean` | none | `<button role="checkbox">` + `mat-icon` |
| `app-labeled-toggle` | Toggle + inline label; works as `[(on)]`+`(change)` **or** as a reactive-forms control (`ControlValueAccessor`, drop-in for `mat-slide-toggle`) | `on: boolean` (model) = `false`; `helper: string\|null` = `null`. (`disabled` is internal via `setDisabledState`, not an input) | `change: boolean` | default (label text) | composes `app-toggle` |
| `app-editable-input` | Inline-edit text input (static at rest, focus ring); two-way `[(value)]` | `value: string` (model) = `''`; `mono: boolean` = `false`; `align: 'left'\|'right'` = `'left'`; `width: number\|null` = `null`; `placeholder: string` = `''`; `disabled: boolean` = `false` | none (value via model) | none | native `<input>` |
| `app-dropdown` | Outlined dropdown with floating label, backed by `mat-select`; compact 40px for filter bars | `label: string` (required); `value: string` (model) = `''`; `options: readonly DropdownOption[]` (required); `width: number` = `180` | none (value via model) | none | `mat-form-field` + `mat-select` |
| `app-search-input` | Filter-bar search box; grows to fill unless `width` fixed | `value: string` (model) = `''`; `placeholder: string` = `'Buscar'`; `width: number\|null` = `null` | none (value via model) | none | native `<input type="search">` + `mat-icon` |
| `app-date-range` | Filter-bar date-range picker; `[(start)]`/`[(end)]` as ISO `YYYY-MM-DD` strings or null | `width: number` = `260`; `start: string\|null` (model) = `null`; `end: string\|null` (model) = `null` | none (values via models) | none | `mat-date-range-input` / `mat-date-range-picker` (provides `provideNativeDateAdapter()`) |

`DropdownOption = { readonly value: string; readonly label: string }` (exported from `outlined-dropdown.ts`).

### Form layout (create/edit screens)

| Selector | Purpose | Inputs | Outputs | Projection | Wraps |
|---|---|---|---|---|---|
| `app-form-section` | Card wrapping one form section (optional kicker/title/subtitle + body) | `kicker: string\|null` = `null`; `title: string\|null` = `null`; `subtitle: string\|null` = `null`; `padding: number` = `28` | none | default | no |
| `app-sub-section` | Inner group within a section; optional mono kicker + hairline divider | `kicker: string\|null` = `null`; `divider: boolean` = `false` | none | default | no |
| `app-form-grid` | Responsive form grid (host IS the grid; span items with `style="grid-column: span 2"`) | `cols: number` = `2`; `gap: number` = `20` | none | default | no |
| `app-form-footer` | Sticky right-aligned action footer (secondary + primary buttons, optional info note) | `primaryLabel: string` = `'Guardar'`; `secondaryLabel: string` = `'Cancelar'`; `primaryDisabled: boolean` = `false`; `sticky: boolean` = `true`; `info: string\|null` = `null` | `primary: void`; `secondary: void` | none | composes `app-btn` ×2 |
| `app-back-header` | Create/edit page header — back arrow + amber kicker + title + sub + actions slot | `kicker: string\|null` = `null`; `title: string` (required); `sub: string\|null` = `null`; `backLink: string\|null` = `null` (falls back to `Location.back()`) | none (back handled internally) | default (into `.bh__actions`) | no (injects `Router`/`Location`) |
| `app-selected-card-preview` | Lavender preview band shown when a card is auto-populated from TCGdex on add-product/product-edit | `imageUrl: string\|null` = `null`; `name: string` (required); `setLine: string\|null` = `null` | `imgLoad: void`; `imgError: void` | default (detail lines, into `.scp__body`) | no |

### Typeaheads & autocomplete

| Selector | Purpose | Inputs | Outputs | Projection | Wraps |
|---|---|---|---|---|---|
| `app-set-typeahead` | Autocomplete over local catalog `SetsService` rows; emits selected set id (no free text) | `value: string\|null` = `null`; `placeholder: string` = `'Buscar set…'`; `label: string` = `'Set'`; `required: boolean` = `false` | `valueChange: string\|null` | none | `mat-form-field` + `mat-autocomplete`. Public method `reload(): Promise<void>` |
| `app-card-typeahead` | Async autocomplete against the TCGdex card API; emits the full card detail | `placeholder: string` = `'Buscar cartas…'`; `setCode: string\|null` = `null` (TCGdex set id, narrows results) | `cardSelected: Card` (from `@tcgdex/sdk`) | none | `mat-form-field` + `mat-autocomplete` + spinner |

### Filters (`/buscar`, listings)

| Selector | Purpose | Inputs | Outputs | Projection | Wraps |
|---|---|---|---|---|---|
| `app-filters-bar` | Horizontal strip hosting projected filter triggers; shows "Limpiar filtros" when any active | `anyActive: boolean` = `false` | `clearAll: void` | default (triggers) + named `[bar-end]` (trailing slot) | no |
| `app-set-filter` | Multi-select set facet (checkbox menu, search, per-set counts) | `sets: SetRow[]` (required); `counts: Map<string,number>` = `new Map()`; `selected: string[]` (required); `hideZero: boolean` = `true` | `selectionChange: string[]` | none | `mat-menu` + `mat-checkbox` |
| `app-category-filter` | Single-select category facet (radio-style; re-click clears to "all"; shows zero-count) | `categories: CategoryRow[]` (required); `counts: Map<string,number>` = `new Map()` (keyed by `category_id`); `selected: string\|null` = `null` (slug; null = all) | `selectionChange: string\|null` | none | `mat-menu` (auto-closes via `MatMenuTrigger`) |
| `app-card-type-filter` | Multi-select card-type/rarity facet (checkbox menu + counts); configurable label | `cardTypes: CardTypeRow[]` (required); `counts: Map<string,number>` = `new Map()`; `selected: string[]` (required); `hideZero: boolean` = `true`; `label: string` = `'Rareza'` | `selectionChange: string[]` | none | `mat-menu` + `mat-checkbox` |
| `app-sort-select` | "Ordenar por" select; parent owns the (URL-bound) value | `value: SortKey` (required); `showRelevance: boolean` = `false` | `sortChange: SortKey` | none | `mat-select`. Option values: `relevance` (only if `showRelevance`), `price-asc`, `price-desc`, `recent` |

### Cards & commerce

| Selector | Purpose | Inputs | Outputs | Projection | Wraps |
|---|---|---|---|---|---|
| `app-product-card` | Storefront tile — image, meta line, condition pill, type icon, price (+ sale), add-to-cart | `card: ProductCardItem` (required) | none | none | no (uses `appCardPreview`, `RouterLink`; `TYPE_ICON_MAP` internal) |
| `app-raffle-card` | Raffle tile for `/rifas` — draw-date countdown + quantity stepper, no detail link | `raffle: RaffleCardItem` (required) | none | none | no |
| `app-coupon-field` | Self-contained coupon apply/remove control reading/mutating shared `CartService` state | `variant: 'default'\|'compact'` = `'default'` | none | none | no |
| `app-energy-chip` | Single Pokémon energy-type chip (self-hosted PNG disc); falls back to gray em-dash for unknown/null | `type: string\|null` = `null`; `size: number` = `22`; `withLabel: boolean` = `false` | none | none | no. Also exports `ENERGY_TYPE_META`, `energyTypeColor()`, `energyTypeFg()`, `energyTypeName()` |

### Navigation, layout & feedback

| Selector | Purpose | Inputs | Outputs | Projection | Wraps |
|---|---|---|---|---|---|
| `app-page-header` | List-screen header — amber kicker, big title, sub, projected actions | `kicker: string\|null` = `null`; `title: string` (required); `sub: string\|null` = `null` | none | default (into `.ph__actions`) | no |
| `app-filter-bar` | Card holding search / tabs / dropdowns / toggles above a table | none | none | default | no |
| `app-table-card` | Card wrapping a `<table class="app-table">` + optional pagination footer | none | none | default | no |
| `app-pill-tabs` | Segmented pill tabs with optional count badges; two-way `[(value)]` | `tabs: readonly TabItem[]` (required); `value: string` (model) = `''` | none (value via model) | none | no |
| `app-underline-tabs` | Section-level underlined tabs with optional count badges | `tabs: readonly TabItem[]` (required); `value: string` (model) = `''` | none (value via model) | none | no (reuses `TabItem`) |
| `app-pagination-footer` | Pagination footer (restyle of mat-paginator); `page` is 1-based, screen owns state | `page: number` (required, 1-based); `perPage: number` (required); `total: number` (required); `perPageOptions: readonly number[]` = `[10,25,50,100]` | `pageChange: number`; `perPageChange: number` | none | native `<select>` + custom pager (not mat-paginator) |
| `app-sparkline` | Tiny responsive inline-SVG trend chart (no charting dep); stretches to container | `values: number[]` = `[]`; `height: number` = `44`; `stroke: string` = `'var(--mat-sys-primary)'` | none | none | no (`OnPush`) |
| `app-social-icons` | Instagram / Facebook / WhatsApp icon-button links (registers inline SVGs) | none | none | none | no (hard-coded URLs) |
| `app-card-preview-overlay` | Singleton hover-preview card driven by `CardPreviewService`; viewport-clamped next to anchor | none (fully service-driven) | none | none | no |

`TabItem = { readonly key: string; readonly label: string; readonly count?: number | null }` (exported from `pill-tabs.ts`, reused by `underline-tabs.ts`).

### Table cells

| Selector | Purpose | Inputs | Outputs | Projection | Wraps |
|---|---|---|---|---|---|
| `app-pill` | Status pill (`red` tone uses `--danger`, not brand red) | `tone: 'neutral'\|'green'\|'amber'\|'red'\|'blue'\|'ink'` = `'neutral'`; `dot: boolean` = `false` | none | default (label) | `<span>` |
| `app-money` | ₡ money cell (es-CR thousands); with `original` shows sale (amber) + struck-through original | `value: number` (required); `original: number\|null` = `null` | none | none | no |
| `app-stock` | Stock count with low/out dot (out uses `--danger`) | `value: number` (required); `low: number` = `3` | none | none | no (`state` computed: `'ok'\|'low'\|'out'`) |
| `app-thumb` | Small product thumbnail with optional language-tag overlay | `src: string\|null` = `null`; `lang: string\|null` = `null`; `size: number` = `42` | none | none | no |

### Directives

| Selector | Purpose | Inputs | Outputs | Notes |
|---|---|---|---|---|
| `[appCardPreview]` | On hover-capable devices, shows/hides the shared `CardPreviewService` overlay with full-size art | `appCardPreview: { image_url: string\|null; name: string; illustrator: string\|null }` (required) | none | Attribute directive. `mouseenter` → `service.show(...)` (skipped if no hover or null image); `mouseleave` → `service.hide()`. Gated by `(hover: hover)` |

### Dialogs

| Selector | Purpose | Inputs / Result | Wraps |
|---|---|---|---|
| `app-image-picker-dialog` | Material dialog file/folder browser for the self-hosted card-image store (navigate, search, upload, create folder, pick) | No inputs. Returns via `MatDialogRef<ImagePickerDialog, ImagePickerResult>`; `ImagePickerResult = { url: string; path: string; name: string } \| null` (exported) | `mat-dialog-*` primitives; backed by `ImageBrowserService` |

### Pipes

| Pipe | Purpose | Signature |
|---|---|---|
| `orDash` | Returns em dash `—` for missing values (`null`, `undefined`, `''`, empty array); passes everything else through | `transform(value: unknown): unknown`. Standalone. File: `shared/pipes/or-dash.pipe.ts` |

---

## 2. Design tokens

Two coexisting systems:

1. **Material 3 (`--mat-sys-*`)** — generated by `mat.theme()` in `src/styles.scss` from
   `src/styles/_theme-colors.scss` (primary `#1E3A8A` Tico Blue, tertiary `#D4941C` Amber,
   error `#B91C1C` Danger). Surfaces overridden to warm cream via `mat.theme-overrides()`.
   Typography family Manrope (brand + plain), weights 700/500/400, density `-1`.
2. **Brand tokens (`--*`)** — plain CSS custom properties on `:root`, intentionally **outside**
   Material's palette. Defined in `_brand-tokens.scss`; table-system extras in `_admin-table.scss`.

All loaded through `src/styles.scss` via `@use` (order: theme-colors → brand-tokens →
material-overrides → brand-utilities → admin-table → admin-forms).

### Color — brand (`_brand-tokens.scss`)

| Token | Value | Notes |
|---|---|---|
| `--brand-red` | `#ce1126` | **Restricted**: brand-bar gradient + AGOTADA/sold-out badge only |
| `--brand-red-dark` | `#a50e1f` | |
| `--brand-red-soft` | `#fdeef0` | |
| `--accent-amber` | `#d4941c` | Featured/rare + sale prices; mirrors Material tertiary |
| `--accent-amber-soft` | `#fef3d7` | |
| `--surface-page` | `#fbfaf7` | Warm cream page bg |
| `--surface-card` | `#ffffff` | Card surface (note: `--surface` does NOT exist) |
| `--surface-tonal` | `#f4f2ed` | |
| `--surface-tonal-2` | `#eae7df` | |
| `--border-subtle` | `#e5e2da` | |
| `--border-strong` | `#cfcbc0` | |
| `--text-primary` | `#15151a` | |
| `--text-secondary` | `#5a5a65` | |
| `--text-tertiary` | `#8b8b96` | |
| `--success` | `#15803d` | |
| `--warning` | `#a16207` | |
| `--danger` | `#b91c1c` | Semantic error red — intentionally distinct from `--brand-red` |

### Color — table system (`_admin-table.scss`)

| Token | Value | Notes |
|---|---|---|
| `--brand-blue` | `#1e3a8a` | Flat Tico Blue (M3 primary is a tonal variant, not exact) |
| `--brand-blue-soft` | `#e8edf8` | |
| `--brand-blue-edge` | `#c7d2ea` | |
| `--amber-edge` | `#efd7a4` | |
| `--amber-text` | `#8c5f0e` | Readable amber text on amber-soft fills |
| `--green-soft` | `#ddf0e5` | |
| `--green-edge` | `#bfe0cd` | |
| `--red-edge` | `#f0c7cc` | |
| `--row-hover` | `#faf9f5` | Subtle warm table-row hover |

### Typography (`_brand-tokens.scss`)

| Token | Value |
|---|---|
| `--font-brand` | `'Manrope', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` |
| `--font-mono` | `'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` |

No dedicated spacing / shape / elevation / motion token sets exist as CSS variables — those
values are inline per component or carried by Material's `--mat-sys-*` tokens. Shape overrides
live in `_material-overrides.scss` (button radius `4px`, card radius `8px`).

---

## 3. Global styles & utilities

### `_brand-utilities.scss`

| Class | Purpose |
|---|---|
| `.brand-bar` | 3px red→amber→red gradient strip; once per page atop a hero/featured block |
| `.brand-eyebrow` | Small uppercase amber label above titles |
| `.brand-mono` | Monospace catalog metadata (e.g. "SCARLET · 199/197 · NM") |
| `.product-card--on-sale` / `::after` | Amber ring/glow + `$` badge (auto when `sale_price` set) |
| `.product-card--sold-out` / `::after` | Red AGOTADA badge + grayscaled/faded thumb |
| `.price--sale` | Amber, bold — the price the customer pays |
| `.price--original` | Grey, strikethrough — original price (sits right of sale) |
| `.condition-pill` (+ `--nm`/`--lp`/`--mp`/`--hp`) | Card-grade badge; traffic-light tones (`--hp` uses `--danger`, not brand red) |
| `.condition-pill--btn` | Button variant — strips chrome, keeps keyboard focus + hover affordance |
| `.order-status` (+ `--paid`/`--shipped`/`--completed`/`--cancelled`) | Order-status pill on `/account` + admin orders |

### `_admin-table.scss`

| Class | Purpose |
|---|---|
| `.app-table` | The shared mat-table look (header/row/cell typography, gutters, dividers) |
| `.app-table--comfy` / `.app-table--cozy` | Row density (60px / 76px) |
| `.is-mono` / `.is-dim` / `.is-right` / `.is-center` | Cell modifiers (on `<th>`/`<td>`) |
| `.app-slug-chip` | Mono slug pill (Páginas / Filtros) |

### `_admin-forms.scss`

Reskins Material form controls (outlined fields 48px, 8px radius, brand-blue focus ring,
`--danger` errors) **scoped under `app-admin-shell`** so the storefront keeps its look.
CDK-overlay pieces (select panel, datepicker) are reached via `panelClass="admin-form-overlay"`.
Notable classes: `.is-mono` (on a `mat-form-field` for slugs/prices/IDs), `.ps-mono-textarea`
(raw-HTML editor), `app-form-grid.checkbox-grid` (row-hover checkbox grid).

### `_material-overrides.scss` (global, no selector scope)

Button/card/table/dialog shape + color overrides; 40px compact form fields; white menu/
expansion panels; uppercase tracked Material buttons; the 3px red-amber-red bar on every
dialog surface; `.search-help-tooltip` wide tooltip. Body sets `font-variant-numeric:
tabular-nums` so money/stock/count columns align.

---

## 4. Conventions

- **Selector prefix:** `app` (from `angular.json`). All shared components use `app-*`; the one
  directive uses the camelCase attribute `[appCardPreview]`.
- **Components:** standalone only (no NgModules); signals for state; Material imported
  per-component via the `imports:` array (no shared barrel). Style language SCSS
  (`schematics.@angular/component.style: "scss"`, `inlineStyleLanguage: scss`).
- **Folder structure:** one folder per component under `src/app/shared/<name>/` holding the
  `.ts` (inline template + styleUrl) and a sibling `.scss`. The table system is grouped under
  `shared/table/{cells,controls,tabs,...}`; forms under `shared/forms/`; facets under
  `shared/filters-bar/`. Files use bare names (`product-card.ts`), not the `.component.ts` suffix.
- **Wiring a new screen:** add a route in `src/app/app.routes.ts` with `loadComponent: () =>
  import('...').then(m => m.X)` (every route is lazy). Admin screens go under the `admin` parent
  (`adminGuard` on activate + activateChild, rendered in `AdminShell`); customer screens under the
  empty-path `UserShell` parent (`maintenanceGuard`, plus `customerGuard` on `/account`).
  **Specific paths (`admin`, `library`, `mantenimiento`) must precede the empty-path UserShell**
  or the catch-all swallows them.
- **Breakpoints:** no shared breakpoint token — each component sets its own `max-width` media
  query. The recurring storefront mobile breakpoint is **`599px`** (home, search-results, rifas
  grids). Admin/detail screens use ad-hoc widths (e.g. 720px, 880px, 960px). Hover features gate
  on `@media (hover: hover)`.
- **Lint/style rules affecting markup:** no project ESLint config is present (no
  `eslint.config.*` / `.eslintrc` under the repo). Production build budgets cap any single
  component stylesheet at 4kB (warning) / 12kB (error) and the initial bundle at 500kB / 1MB.
  Brand-red usage is a hard project rule (see `CLAUDE.md` / theme skill), not a linter.
