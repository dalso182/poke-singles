# Shared components

> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose

An orientation map of `src/app/shared/**`: what each component family is for, when to reach for which piece, the composition rules (especially the admin table system), and which screens consume what. **Exact prop/input tables are NOT duplicated here — see [../design-manifest.md](../design-manifest.md)**, which documents every shared component's inputs/outputs/projection.

## Scope

- **In scope:** every family under `src/app/shared/` — table system, form layout, filters, typeaheads, card preview (plus `src/app/core/preview/card-preview.service.ts`), commerce tiles, misc widgets, pipes, validators — and the rules for composing them.
- **Out of scope:** page-level smart components (`src/app/user/**`, `src/app/admin/**`, `src/app/home/**` — see `docs/screens/**`), design tokens and global CSS classes (see [theming](./theming.md)), the data services these components call (see [data-model](./data-model.md)).

## Key files

```
src/app/shared/
├── table/                    Admin table system
│   ├── page-header/          app-page-header
│   ├── filter-bar/           app-filter-bar
│   ├── table-card/           app-table-card
│   ├── pagination-footer/    app-pagination-footer
│   ├── tabs/                 app-pill-tabs, app-underline-tabs (share TabItem)
│   ├── cells/                app-pill, app-money, app-stock, app-thumb
│   └── controls/             app-btn, app-icon-btn, app-toggle, app-checkbox,
│                             app-labeled-toggle, app-editable-input, app-dropdown,
│                             app-search-input, app-date-range
├── forms/                    Admin create/edit layout: app-back-header, app-form-section,
│                             app-sub-section, app-form-grid, app-form-footer,
│                             app-selected-card-preview
├── filters-bar/              app-filters-bar + app-category-filter / app-set-filter /
│                             app-card-type-filter (storefront facets)
├── card-typeahead/           app-card-typeahead (TCGdex async)
├── set-typeahead/            app-set-typeahead (local catalog)
├── card-preview/             [appCardPreview] directive + app-card-preview-overlay
├── product-card/             app-product-card
├── raffle-card/              app-raffle-card
├── marquee/                  app-marquee
├── coupon-field/             app-coupon-field
├── load-more/                app-load-more
├── sort-select/              app-sort-select
├── energy-chip/              app-energy-chip (+ ENERGY_TYPE_META helpers)
├── user-avatar/              app-user-avatar
├── social-icons/             app-social-icons
├── sparkline/                app-sparkline
├── empty-cart-pokemon/       app-empty-cart-pokemon
├── image-picker/             app-image-picker-dialog
├── pipes/or-dash.pipe.ts     orDash
└── validators/               nameValidator, digitsValidator/phoneValidator
src/app/core/preview/card-preview.service.ts   CardPreviewService (overlay state)
```

All are standalone components with signal inputs (`input()` / `model()` / `output()`), inline templates, one folder per component, bare file names (no `.component.ts` suffix).

## How it works

### Family 1 — the admin table system (`shared/table/`)

**Hard rule (memory + practice): every admin list screen composes these `app-*` primitives — never per-screen table CSS.** The canonical page skeleton:

```html
<app-page-header kicker="…" title="…" sub="…">  <!-- actions projected -->
<app-filter-bar>                                 <!-- app-search-input, app-pill-tabs,
                                                      app-dropdown, app-date-range, toggles -->
<app-table-card>
  <table mat-table class="app-table app-table--comfy"> …cells… </table>
  <app-pagination-footer [page]="…" [perPage]="…" [total]="…" (pageChange)…/>
</app-table-card>
```

- The **look** of the `<table>` itself comes from the global `.app-table` styles in `src/styles/_admin-table.scss` (density modifiers `--comfy`/`--cozy`, cell modifiers `.is-mono`/`.is-dim`/`.is-right`/`.is-center`) — see [theming](./theming.md). The primitives supply the chrome around it.
- **Cells** render inside `<td>`s: `app-pill` (status; its `red` tone is `--danger`, never brand red), `app-money` (₡, es-CR thousands, sale + struck-through original), `app-stock` (low/out dot, `low` threshold default 3), `app-thumb` (42 px product thumb + language tag).
- **Controls** are the form-ish widgets that live in filter bars and editable tables: `app-btn` (escapes the global uppercase mat-button override — use it, not `mat-button`, inside admin chrome), `app-icon-btn`, `app-toggle`/`app-checkbox`/`app-labeled-toggle` (the labeled one is a `ControlValueAccessor`, drop-in for `mat-slide-toggle`), `app-editable-input` (inline edit, e.g. prices in Sets), `app-dropdown` (mat-select in a 40 px outlined shell), `app-search-input`, `app-date-range` (provides its own `provideNativeDateAdapter()`).
- **Tabs**: `app-pill-tabs` (segmented, filter-level, e.g. Activas/Completadas) vs `app-underline-tabs` (section-level, e.g. report switcher, customer-detail tabs). Both take `TabItem[]` (`{ key, label, count? }`) with `[(value)]`.
- `app-pagination-footer` is **1-based** and stateless — the screen owns `page`/`perPage` and reloads on the outputs; `perPageOptions` default `[10, 25, 50, 100]`.

**Consumers (verified imports):** every admin list/detail screen — products-list, add-product, product-edit, categories, filters, sets, sellers, price-review, coupons(+edit), shipping-methods, orders, order-detail, customers, customer-detail, raffles(+detail), reports (+ the four sub-reports + loyalty-report), pages(+edit), config, dashboard — **plus one storefront screen: `user/account/account.ts`** (reuses table primitives for the order/points ledgers). The unrouted `admin/card-types/card-types.ts` also still imports them.

### Family 2 — form layout (`shared/forms/`)

For admin create/edit screens (add-product, product-edit, coupon-edit, page-edit, raffle-detail, config): `app-back-header` (back arrow + kicker/title/sub + actions slot; falls back to `Location.back()` when `backLink` is null) → one or more `app-form-section` cards → optional `app-sub-section` groups → `app-form-grid` (host **is** the grid; span with `style="grid-column: span 2"`) → sticky `app-form-footer` ("Guardar"/"Cancelar" defaults, `primary`/`secondary` outputs). `app-selected-card-preview` is the lavender band showing the TCGdex-matched card on add-product/product-edit. Field *styling* inside these comes from `_admin-forms.scss` (scoped under `app-admin-shell`) — the layout primitives don't restyle inputs.

### Family 3 — storefront filter facets (`shared/filters-bar/`) + sorting

`app-filters-bar` is the horizontal strip that projects facet triggers and shows "Limpiar filtros" when `anyActive`. Inside it go the three menu facets: `app-category-filter` (single-select by slug, re-click clears), `app-set-filter` and `app-card-type-filter` (multi-select by id, per-option counts, `hideZero` default true; card-type filter label defaults to `'Rareza'` and is reused for sealed sub-types). `app-sort-select` sits alongside (option keys: `relevance` — only when `showRelevance` — `price-asc`, `price-desc`, `recent`).

These are **controlled components**: the page owns selection state in the URL (query params `categoria`, `sets`, `types`, `tipo`, `sort`, bound via `withComponentInputBinding` — mind the undefined-default footgun, see [routing-and-guards](./routing-and-guards.md)) and navigates on `selectionChange`. Consumers: `user/card-list` (`/products`, `/ofertas`) and `user/search-results` (`/buscar`). Pair with `app-load-more` for pagination ("Cargar más" + inline spinner).

### Family 4 — typeaheads

- `app-set-typeahead` — autocompletes over **local** catalog sets (`SetsService`); emits the selected set id, no free text; public `reload()` method.
- `app-card-typeahead` — **async** autocomplete against the TCGdex API; optional `setCode` narrows to one set; emits the full `Card` (from `@tcgdex/sdk`).

Used by the admin add-product flow (set → card → auto-populate) and product-edit. Not used on the storefront.

### Family 5 — card hover preview (directive + overlay + service)

Three pieces around one root-provided service:

- `CardPreviewService` (`src/app/core/preview/card-preview.service.ts`) — holds `current: signal<CardPreview | null>` (`{ imageUrl, name, illustrator, anchor: DOMRect }`). `show()` is debounced by `SHOW_DELAY_MS = 180` ms so drive-by hovers don't flicker. It subscribes to router events: `NavigationStart` hides the preview **and sets a `navigating` flag that suppresses `show()` until `NavigationEnd`/`Cancel`/`Error`** — otherwise a hover on a card being torn down mid-navigation leaves the overlay stuck on the next page.
- `[appCardPreview]` directive — attach to a card image host with `[appCardPreview]="{ image_url, name, illustrator }"`; `mouseenter` → `show()`, `mouseleave` → `hide()`. No-ops on non-hover devices (`(hover: hover)`) or when `image_url` is null.
- `app-card-preview-overlay` — the singleton renderer, viewport-clamped next to the anchor rect. **Hosted once in `UserShell`** (`src/app/user/user-shell/user-shell.ts`), so previews work on every storefront page without per-page wiring. It is *not* hosted in AdminShell.

Consumers of the directive: `app-product-card` (every grid/marquee tile) and the detail page family.

### Family 6 — commerce tiles & cart widgets

- `app-product-card` — the storefront tile: image (with `[appCardPreview]`), meta line (`set_name, #number/printedTotal · Holo|Reverse`), condition pill (`condition-pill--nm/lp/mp/hp` classes; `HP`/`DMG` both map to `--hp`), energy-type icon (internal `TYPE_ICON_MAP` → `assets/images/types/*.png`), price (sale styling via global classes), add-to-cart button ("Añadir" / "Agotada" when `quantity === 0`) that calls `CartService.add(id, 1)` and snackbars errors. Used by home (rails + offers grid), card-list, search-results, and `app-marquee`.
- `app-raffle-card` — `/rifas` tile: countdown to draw date, quantity stepper, "Agregar ticket(s)" / "AGOTADA"; no detail link.
- `app-marquee` — infinite scroll rail of product cards; `direction: 'left' | 'right'`, `durationSeconds` default **56**. Home only.
- `app-coupon-field` — self-contained apply/remove coupon control that reads/mutates shared `CartService` state directly (no inputs beyond `variant: 'default' | 'compact'`). Used in cart-drawer, cart-page, checkout — one implementation, three placements.
- `app-empty-cart-pokemon` — empty-cart mascot: the user's avatar Pokémon in the fixed `'Teary-Eyed'` portrait, falling back to `DEFAULT_AVATAR_NUMBER`; error handling steps through a source chain so the `<img>` never goes empty. Cart-drawer + cart-page.
- `app-load-more`, `app-sort-select` — see family 3.

### Family 7 — identity & decoration widgets

- `app-user-avatar` — resolves the signed-in avatar in one place: chosen Pokémon portrait (mood derived from live cart total via `avatarMoodForTotal`, with emotion fallbacks) → Google photo (`user_metadata.avatar_url`/`picture`) → initials (`maxInitials`: header uses 2, account 1). Presentational; parent supplies the circular container. Used by header and account.
- `app-energy-chip` — one Pokémon energy-type disc (self-hosted PNG), gray em-dash fallback; also exports `ENERGY_TYPE_META`, `energyTypeColor()`, `energyTypeFg()`, `energyTypeName()` for non-component uses. Used on the detail page.
- `app-social-icons` — Instagram/Facebook/WhatsApp buttons with hard-coded URLs (footer).
- `app-sparkline` — dependency-free inline-SVG trend line (`stroke` defaults to `var(--mat-sys-primary)`); admin dashboard 30-day KPI trends.
- `app-image-picker-dialog` — Material dialog browser over the self-hosted card-image store (PHP endpoints in `server/`); returns `ImagePickerResult = { url, path, name } | null` via `MatDialogRef`. Admin product forms only.

### Pipes & validators

- `orDash` (`shared/pipes/or-dash.pipe.ts`) — em dash `—` for `null`/`undefined`/`''`/empty array; passthrough otherwise. Ubiquitous in admin tables.
- `nameValidator()` (`shared/validators/name.validator.ts`) — Unicode letters + spaces + dots only (`/^[\p{L}\s.]+$/u`); error `{ name: true }`.
- `digitsValidator(length)` / `phoneValidator()` (`shared/validators/phone.validator.ts`) — exactly N digits; `phoneValidator()` = `digitsValidator(8)` (Costa Rica). Errors `{ digits: true }` or `{ digitsLength: { requiredLength, actualLength } }` — one key at a time so a single `<mat-error>` covers both.
- All validators pass empty values (pair with `Validators.required` when mandatory). Used in checkout, account, admin customer forms.

## Contracts & conventions

- **Prop tables live in [../design-manifest.md](../design-manifest.md)** — check it before adding an input you think is missing; keep it updated when you change a shared component's API.
- **Admin tables compose primitives; no per-screen table CSS.** If a screen needs a new cell/control style, extend the primitive (or `_admin-table.scss`) so every screen gets it.
- **Signal inputs only** (`input()`, `input.required()`, `model()`, `output()`); no decorator `@Input`/`@Output`. Inline templates in `shared/` (design-manifest §"All templates are inline" — note `marquee`, `product-card`, `raffle-card`, `user-avatar` actually use `templateUrl` with sibling `.html` files; the *no-NgModule, per-component Material imports* rule is uniform).
- **Controlled over stateful:** filter facets, tabs, pagination, and sort emit changes and let the page own state (usually in the URL for storefront, in signals for admin).
- **Two-way via `model()`** where ergonomics matter (`app-toggle [(on)]`, `app-pill-tabs [(value)]`, `app-search-input [(value)]`, `app-date-range [(start)]/[(end)]`).
- **Brand rules leak into components:** `app-pill`'s `red` tone, `app-stock`'s out-dot, and `.condition-pill--hp` all use `--danger`, never `--brand-red` (see [theming](./theming.md)).
- **Hover-only affordances** gate on `@media (hover: hover)` (card preview, hover rings).
- New shared components: one folder under `src/app/shared/<name>/`, selector `app-<name>`, SCSS sibling, and an entry in the design manifest.

## Gotchas / invariants

- **`app-card-preview-overlay` must remain a singleton hosted in `UserShell`.** Adding a second instance (or hosting one per page) breaks the service's single-`current()` model. Admin pages have no overlay by design — the add-product preview uses `app-selected-card-preview` instead.
- **`CardPreviewService.SHOW_DELAY_MS = 180`** and the `navigating` suppression exist to fix real bugs (flicker; overlay stuck after click-through navigation). Don't remove either when refactoring.
- **`app-pagination-footer` is 1-based**; the Supabase range math in services is 0-based — off-by-one bugs live at this boundary.
- **`app-labeled-toggle`'s `disabled` is not an input** — it only disables through the CVA `setDisabledState` (reactive forms). Template-driven `[disabled]` silently does nothing.
- **`app-dropdown`/`app-date-range` render panels in the CDK overlay**, outside `app-admin-shell` — admin skinning reaches them via `panelClass="admin-form-overlay"` (`_admin-forms.scss`), not the shell scope.
- **`app-coupon-field` mutates shared `CartService` state** — placing two variants on the same screen (e.g. drawer open over cart page) is safe only because they read the same signals; don't fork per-instance state.
- **`app-social-icons` URLs are hard-coded** in the component — a copy change there is a code change.
- **`account.ts` is a storefront consumer of the admin table system** — restyling `.app-table` affects `/account` ledgers too.
- **Dead code:** `src/app/admin/card-types/` still imports table primitives but has no route (superseded by `/admin/filters`).
- **`or-dash` and validators are plain functions/pipes** — no DI; safe anywhere including dialogs.

## Related docs

- [../design-manifest.md](../design-manifest.md) — the authoritative prop/token manifest (inputs, outputs, projection, wraps).
- [theming.md](./theming.md) — `.app-table`, `_admin-forms.scss`, brand utility classes these components rely on.
- [routing-and-guards.md](./routing-and-guards.md) — URL-bound filter state and the input-binding footgun.
- [commerce-flow.md](./commerce-flow.md) — CartService, coupons, the add-to-cart path behind product-card/coupon-field.
- Screen docs: [../screens/admin/products-list.md](../screens/admin/products-list.md) (canonical table-system consumer), [../screens/admin/add-product.md](../screens/admin/add-product.md) (typeaheads + forms family), [../screens/storefront/card-list.md](../screens/storefront/card-list.md) (facets + product cards), [../screens/storefront/home.md](../screens/storefront/home.md) (marquee/rails), [../screens/storefront/rifas.md](../screens/storefront/rifas.md) (raffle-card).
