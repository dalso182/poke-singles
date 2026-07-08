# Theming — Vault Light

> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose

The Vault Light design system: how Angular Material 3 is themed (Tico Blue primary, Amber Glow tertiary, Danger error), the brand token layer that lives *outside* Material, the global utility classes, the admin table/form reskins, the brand-red restriction, and `/library` as the visual reference gallery.

## Scope

- **In scope:** `src/styles.scss` (the single global stylesheet entry per `angular.json` → `"styles": ["src/styles.scss"]`) and everything it `@use`s from `src/styles/`: `_theme-colors.scss`, `_brand-tokens.scss`, `_material-overrides.scss`, `_brand-utilities.scss`, `_admin-table.scss`, `_admin-forms.scss`. Fonts, density, the red rule, `/library`.
- **Out of scope:** which components use which classes (see [shared-components](./shared-components.md)), per-screen SCSS (see `docs/screens/**`).

## Key files

| File | Role |
|---|---|
| `src/styles.scss` | Entry point. `@use` order: theme-colors → brand-tokens → material-overrides → brand-utilities → admin-table → admin-forms. Applies `mat.theme()` + `mat.theme-overrides()` on `html`, base `body` styles. |
| `src/styles/_theme-colors.scss` | Generated M3 palettes (`ng generate @angular/material:theme-color`) from primary `#1E3A8A`, tertiary `#D4941C`, error `#B91C1C`. Exports `$primary-palette`, `$tertiary-palette`. |
| `src/styles/_brand-tokens.scss` | Brand-only CSS custom properties on `:root` (outside Material). |
| `src/styles/_material-overrides.scss` | Global Material shape/size/behavior overrides + dialog brand bar. |
| `src/styles/_brand-utilities.scss` | Utility classes: `.brand-bar`, `.brand-eyebrow`, `.brand-mono`, product-card state classes, price classes, condition pills, order-status pills. |
| `src/styles/_admin-table.scss` | Table-system tokens (`--brand-blue` etc.) + the global `.app-table` look. |
| `src/styles/_admin-forms.scss` | Material form reskin **scoped under `app-admin-shell`** (+ `admin-form-overlay` panelClass for CDK overlays). |
| `src/index.html` | Font loading (Google Fonts): Manrope 300/500/600/700/800, IBM Plex Mono 400/500/600, Material Icons. |
| `src/app/library/` | `/library` — the living reference gallery (tokens, pills, cards, table looks). |
| `brand-guidelines.html` (repo root) | The design-spec source of truth; open in a browser. |

## How it works

### Material 3 theme (`styles.scss`)

Applied on `html` with `color-scheme: light`:

```scss
@include mat.theme((
  color: ( theme-type: light, primary: theme.$primary-palette, tertiary: theme.$tertiary-palette ),
  typography: (
    brand-family: 'Manrope, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    plain-family: 'Manrope, ...same...',
    bold-weight: 700, medium-weight: 500, regular-weight: 400,
  ),
  density: -1,
));
```

- **Primary = Tico Blue** (seeded from `#1E3A8A`; note the emitted `--mat-sys-primary` is a tonal variant, *not* exactly `#1E3A8A` — the admin table system defines flat `--brand-blue: #1e3a8a` for exact-brand contexts).
- **Tertiary = Amber Glow** (`#D4941C` seed).
- **Error = Danger `#B91C1C`** (tone 40 of the generated error palette) — deliberately *not* brand red, so Material form errors/snackbars never bleed `#CE1126`.
- **Brand red is absent from the Material palette entirely** — this is the wiring that enforces the red rule at the framework level.
- **Density `-1`** globally; typography is Manrope for both brand and plain slots.

Then `mat.theme-overrides()` swaps Material's cool neutrals for **warm cream surfaces**: `surface: #fbfaf7`, `surface-container-lowest/-low: #ffffff`, `surface-container: #f4f2ed`, `surface-container-high: #eae7df`, `surface-container-highest: #dfdbd0`, `outline-variant: #e5e2da`, `outline: #cfcbc0`.

`body` sets `background: var(--mat-sys-surface)`, `color: var(--mat-sys-on-surface)`, `font: var(--mat-sys-body-medium)`, and **`font-variant-numeric: tabular-nums`** (aligns digits in money/stock/count columns everywhere).

### Brand token layer (`_brand-tokens.scss`)

Plain custom properties on `:root`, intentionally outside Material:

| Token | Value | Token | Value |
|---|---|---|---|
| `--brand-red` | `#ce1126` | `--text-primary` | `#15151a` |
| `--brand-red-dark` | `#a50e1f` | `--text-secondary` | `#5a5a65` |
| `--brand-red-soft` | `#fdeef0` | `--text-tertiary` | `#8b8b96` |
| `--accent-amber` | `#d4941c` | `--success` | `#15803d` |
| `--accent-amber-soft` | `#fef3d7` | `--warning` | `#a16207` |
| `--surface-page` | `#fbfaf7` | `--danger` | `#b91c1c` |
| `--surface-card` | `#ffffff` | `--font-brand` | `'Manrope', system-ui, …` |
| `--surface-tonal` | `#f4f2ed` | `--font-mono` | `'IBM Plex Mono', ui-monospace, …` |
| `--surface-tonal-2` | `#eae7df` | `--border-subtle` | `#e5e2da` |
| | | `--border-strong` | `#cfcbc0` |

**`--surface` does NOT exist.** Card surfaces are `--surface-card` (#fff). Writing `var(--surface)` compiles fine and silently falls back to the page background — a known trap.

`_admin-table.scss` adds the table-system extras on `:root`: `--brand-blue: #1e3a8a`, `--brand-blue-soft: #e8edf8`, `--brand-blue-edge: #c7d2ea`, `--amber-edge: #efd7a4`, `--amber-text: #8c5f0e`, `--green-soft: #ddf0e5`, `--green-edge: #bfe0cd`, `--red-edge: #f0c7cc`, `--row-hover: #faf9f5`.

### The brand-red rule (as implemented in code)

`_brand-tokens.scss` states the current rule:

```scss
// Tico Red — RESTRICTED to two uses ONLY:
//   1. Brand bar gradient
//   2. AGOTADA / sold-out badges
// Sale prices moved to --accent-amber. NEVER use as a button background,
// link color, focus ring, or generic accent.
```

Sanctioned uses found in the global sheets:

1. **`.brand-bar`** — 3 px `linear-gradient(90deg, var(--brand-red), var(--accent-amber), var(--brand-red))`, once per page atop a hero/featured block. Screens also inline this same gradient (detail, checkout, order-confirmation) and `.mat-mdc-dialog-surface` carries it as a 3 px `background-image` strip on every Material dialog (`_material-overrides.scss`).
2. **Sold-out / AGOTADA badges** — `.product-card--sold-out::after` (`color: var(--brand-red)`; the grayscale/fade of the thumb rides along) and the raffle card's `AGOTADA` `.raffle-badge` (`background: var(--brand-red)`, `shared/raffle-card/raffle-card.scss`).

Everything red-but-not-brand uses **`--danger` (`#b91c1c`)**: Material `error` slot, form errors (`_admin-forms.scss`: "Errors use --danger (#b91c1c), never --brand-red"), `app-pill`'s `red` tone, `app-stock`'s out dot, `.condition-pill--hp`, `.order-status--cancelled`, the admin-shell unread badge.

**Note the drift vs CLAUDE.md:** CLAUDE.md says brand red has *three* uses including `.price--sale`; the code moved sale prices to amber — `.price--sale { color: var(--accent-amber); }` in `_brand-utilities.scss`, and `/library` (`library.html` line ~90) documents "two uses". See Gotchas for stragglers.

### Utility classes (`_brand-utilities.scss`)

- `.brand-bar` — see above.
- `.brand-eyebrow` — 11 px/600, `letter-spacing: 1.5px`, uppercase, `--accent-amber`; sits above titles.
- `.brand-mono` — 12 px `--font-mono`, uppercase, `--text-tertiary`; catalog metadata like "SCARLET · 199/197 · NM".
- `.product-card--on-sale` — amber ring (`box-shadow: 0 0 0 1px var(--accent-amber)` + glow) and an amber `$` badge via `::after` (`content: '$'`, top 6px / right 8px). Applied automatically when `sale_price` is set.
- `.product-card--sold-out` — `::after` badge styling (mono 9 px, `letter-spacing: 1.4px`, `color: var(--brand-red)`) plus `filter: grayscale(0.7); opacity: 0.6` on the imagery. **The `::after` rule sets no `content`** — the badge text comes from component markup/styles (product tiles render "Agotada" on the button; raffle cards render a literal `AGOTADA` span).
- `.price--sale` (amber, 700) + `.price--original` (grey strikethrough, `margin-left: 8px`). Convention: sale price comes **first** in markup (it's what the customer pays), original to its right.
- `.condition-pill` + `--nm` (`--success`) / `--lp` (`--warning`) / `--mp` (`#c2410c`) / `--hp` (`--danger`); mono 10 px, bordered `currentColor`. `.condition-pill--btn` strips button chrome, adds hover wash (`color-mix(in srgb, currentColor 8%, transparent)`) and `:focus-visible` outline `var(--mat-sys-primary)` — used to open the conditions-info dialog.
- `.order-status` + `--paid`/`--completed` (green), `--shipped` (blue `#dbeafe`/`#1d4ed8`), `--cancelled` (red-soft/`--danger`); default covers `pending`. Used on `/account`, `/admin/orders`, `/admin/orders/:id`.

### Material overrides (`_material-overrides.scss`, global)

Token-based `mat.*-overrides` on `html`: buttons 4 px radius (all variants), cards 8 px, tables white background, dialogs white container. Then targeted CSS: 40 px compact form fields (`container-height: 40px`, label 13px, `!important` infix padding), white `.mat-mdc-menu-panel` with compact 36 px items, `.mat-divider` 8 px vertical margins (`!important` — the component sets `margin: 0`), white expansion panels, uppercase/tracked Material buttons (`letter-spacing: 1.2px`, 700, 12 px — the reason `app-btn` exists for admin chrome), roomier `.mat-mdc-card-header`, and `.search-help-tooltip` (320 px wide tooltip, must be global because tooltips render in the CDK overlay).

The dialog brand bar is implemented as `background-image` on `.mat-mdc-dialog-surface` (sized `100% 3px`, positioned top) — **not** a `::before` pseudo, because Material 3 already uses `::before` on the surface for its state layer and a competing pseudo gets stretched by Material's `inset: 0` to cover the whole modal.

### Admin reskins

- **`_admin-table.scss`** — the global `.app-table` look for `<table mat-table class="app-table app-table--comfy|--cozy">`: 40 px tonal header row, mono 9.5 px uppercase header cells (`letter-spacing: 1.6px`), `--row-hover` row hover, density modifiers, `.is-mono`/`.is-dim`/`.is-right`/`.is-center` cell modifiers, `.app-slug-chip`. Lives in the global sheet (not a component) so it reaches mat-table's generated elements. Composed via the shared table primitives — see [shared-components](./shared-components.md).
- **`_admin-forms.scss`** — restyles Material form controls **without replacing them**, scoped under the `app-admin-shell` element selector so the storefront keeps the compact 40 px look: 48 px outlined fields, 8 px radius, `--border-strong` resting outline, focus = `--brand-blue` border + 3 px `--brand-blue-soft` ring (no width bump → no layout jitter), `--danger` errors. CDK-overlay pieces (select panel, datepicker calendar) render outside `app-admin-shell`, so they're reached via `panelClass="admin-form-overlay"`. Extras: `.is-mono` on a `mat-form-field` (slugs/prices/IDs), `.ps-mono-textarea` (raw-HTML editor on page-edit), `app-form-grid.checkbox-grid`.

### Fonts & icons

Loaded in `src/index.html` from Google Fonts: `Manrope:wght@300;500;600;700;800`, `IBM+Plex+Mono:wght@400;500;600` (`display=swap`), plus the `Material+Icons` icon font, with preconnects to `fonts.googleapis.com` / `fonts.gstatic.com`. No self-hosted fonts.

### `/library` — the reference gallery

`src/app/library/` renders the design system live (no shell, no guard): token swatches (`library.ts` lists every brand token with hex + `cssVar`), typography, pills, product-card states, table looks, and prose documenting the rules (including the two-use red rule). **Verify visual changes against `/library` before shipping**; treat it and `brand-guidelines.html` as the spec. See [../screens/library.md](../screens/library.md).

### Build constraints that shape styling

`angular.json` budgets: `anyComponentStyle` warns at **4kB**, errors at **16kB**; initial bundle 500kB/1MB. Big shared looks therefore belong in the global sheets (`_admin-table.scss` etc.), not per-component SCSS. `inlineStyleLanguage: "scss"`.

## Contracts & conventions

- **Never put brand red in the Material palette** or use it for buttons/links/focus/errors. Red-meaning-danger is `--danger`; red-meaning-brand is `--brand-red` in its sanctioned spots only.
- **Card surfaces: `var(--surface-card)`. There is no `--surface`.**
- New global color/typography values go in `_brand-tokens.scss` (brand) or `_admin-table.scss` (table-system extras); component SCSS consumes `var(--token)`, never hex literals for brand colors.
- Admin form styling changes go in `_admin-forms.scss` under the `app-admin-shell` scope (or `admin-form-overlay` for CDK panels) — never global, or the storefront's 40 px fields break.
- Material component tweaks: prefer token-based `mat.*-overrides()` includes over `::ng-deep`/`!important`; the existing `!important`s each carry a comment explaining why they're unavoidable.
- Sale price markup order: `.price--sale` first, `.price--original` second.
- One `.brand-bar` per page, on the first content block.
- Load order in `styles.scss` matters: tokens before consumers (brand-tokens before brand-utilities/admin-*).

## Gotchas / invariants

- **CLAUDE.md drift:** CLAUDE.md still states the *three*-use rule with `.price--sale` in brand red. The code's current rule (`_brand-tokens.scss`, `/library`) is **two uses** — brand-bar gradient + AGOTADA/sold-out badges — with sale prices amber. Follow the code.
- **In-code stragglers that contradict the two-use rule** (document, don't silently copy): `src/app/user/detail/detail.scss` line ~274 `.price.on-sale { color: var(--brand-red); }` (commented "allowed brand-red use (sale price)" — stale vs the token file); `src/app/user/navigation/navigation.scss` `.nav-badge` background `var(--brand-red, #ce1126)`; `src/app/admin/order-detail/order-detail.scss` cancel banner (brand-red tinted background/border/icon/strong); `src/app/user/account/pokedex/pokeball-dialog/pokeball-dialog.scss` explicitly uses `#e3350d` ("classic pokeball red, not #CE1126") but its comment cites a "three allowed uses" rule. If you touch these files, reconcile with Diego before changing the color story.
- **`--surface` fallback trap:** `var(--surface)` resolves to nothing → element silently shows the page background. Grep for it if a "white card" looks cream.
- **`.product-card--sold-out::after` has no `content` in the global sheet** — applying the class alone does not render the badge text; components supply it.
- **`--mat-sys-primary` ≠ `#1E3A8A`** (tonal). Use `--brand-blue` where exact Tico Blue is required (admin table system does).
- **`mat.theme()` emits `--mat-sys-*` on `html`** — anything rendered outside the app root (emails, the PHP endpoints) can't use them; the signup/order emails inline hexes instead.
- **Dialog accent bar:** don't convert the `.mat-mdc-dialog-surface` gradient to a `::before` — Material's state layer owns that pseudo (see comment in `_material-overrides.scss`).
- **Design-manifest drift (minor):** `docs/design-manifest.md` says the component-style budget error is 12kB; `angular.json` says **16kB**. It also claims all shared templates are inline; `marquee`, `product-card`, `raffle-card`, `user-avatar` use `templateUrl`.
- **Fonts come from Google's CDN** — offline dev renders fallback fonts; a cutover decision about self-hosting hasn't been made.

## Related docs

- [shared-components.md](./shared-components.md) — the components that consume these classes/tokens.
- [../design-manifest.md](../design-manifest.md) — token tables + utility-class inventory (same data, manifest form).
- [../screens/library.md](../screens/library.md) — the living gallery at `/library`.
- [routing-and-guards.md](./routing-and-guards.md) — where `/library` sits in the route table.
- `brand-guidelines.html` (repo root) — the original design spec.
