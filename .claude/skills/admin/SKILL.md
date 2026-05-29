---
name: admin
description: >-
  The Poke-Singles admin panel (the AdminShell branch, behind adminGuard). Use this whenever
  you work on back-office screens: the admin shell/sidenav, the product list (paginated table
  with search + filters), the product edit + add-product forms (TCGdex card/set typeaheads,
  image picker, card-type multi-select), categories / card-types / sets CRUD, the coupons admin
  (list with filters + soft-delete-with-undo, add/edit form), the raffles admin (Activas/
  Completadas list, RaffleDetail with participants/payment/draw), the dashboard (KPI tiles +
  live visitor count + 30-day trend sparklines + recent orders), the customers admin
  (`/admin/customers` list + per-customer detail), the price-review queue
  (`/admin/price-review` card-by-card triage against TCGplayer market), `/admin/config`
  (exchange rate, maintenance, price-review settings), and the server-side PHP image-picker
  endpoints. Trigger this for admin
  routing/guards, the TCGdex-driven add-product flow, and the image browser dialog. For the
  RPCs, RLS, and tables behind these screens, pair with the `database` skill.
---

# Admin panel

Everything under `src/app/admin/`, entered at `/admin` via **AdminShell**
(`admin/admin-shell/` — toolbar with profile menu + sidenav). `canActivate: [adminGuard]`
redirects unsigned users to `/` (shows LoginDialog) and non-admins to `/` with a snackbar.
Admin status = `app_metadata.role === 'admin'` (→ `database` skill for `is_admin()`).

## Admin routes

| Path | Component | Notes |
|---|---|---|
| `/admin/` | Dashboard | KPI tiles (orders/sales/customers + live visitors), 30-day trend sparklines, recent orders, latest-registrations + recent-activity panels, pending-orders + raffle tiles |
| `/admin/products` | ProductsList | paginated table, search + filters |
| `/admin/products/new` | AddProduct | TCGdex typeahead + set filter, image picker |
| `/admin/products/:id/edit` | ProductEdit | quick-update card + full form |
| `/admin/categories` | Categories | inline-edit CRUD |
| `/admin/card-types` | CardTypes | taxonomy CRUD (Full Art, VMAX, …) |
| `/admin/sets` | Sets | expandable rows, find-or-create from TCGdex, detail dialog |
| `/admin/coupons` | Coupons | list + active/inactive/expired/deleted filters, soft-delete-with-undo |
| `/admin/coupons/new`, `/:id/edit` | CouponEdit | type-reactive form (PERCENTAGE / FIXED_ON_THRESHOLD) |
| `/admin/raffles` | Raffles | Activas / Completadas toggle, "Agregar rifa" |
| `/admin/raffles/:id` | RaffleDetail | participants + payment, draw winner |
| `/admin/customers` | Customers | list: search (name/email/phone) + pagination, order_count / total_spent / last_order |
| `/admin/customers/:id` | CustomerDetail | profile + saved address + stats + order history (rows → `/admin/orders/:id`) |
| `/admin/reports` | Reports | 5-tab hub: Pedidos por cliente, Actividad de clientes, Búsquedas, Cupones, Puntos (see Reports below) |
| `/admin/price-review` | PriceReview | Card-by-card triage of products whose store price drifts from TCGplayer market (see Price review below) |
| `/admin/config` | AdminConfig | exchange rate, maintenance flag (gates the storefront via `maintenanceGuard` → `/mantenimiento`; admins bypass), price-review settings, loyalty points ratio |

## Shared table system

Every admin list/table screen composes one shared primitive library at
`src/app/shared/table/` (selectors `app-*`) — **never per-screen table CSS or one-off cell
markup.** The engine stays `mat-table`, styled by the global `.app-table` class (`+ --comfy`
60px / `--cozy` 76px rows) in `src/styles/_admin-table.scss`. Primitives: `app-page-header`,
`app-filter-bar`, `app-table-card`, `app-pill-tabs` / `app-underline-tabs` (tabs with optional
count badges), `app-pagination-footer` (restyled mat-paginator behaviour, **1-based** page),
`app-search-input`, `app-dropdown`, `app-date-range` (flat date-range filter built on native
`<input type="date">`, ISO `[(start)]`/`[(end)]`), `app-labeled-toggle`, `app-toggle`, `app-checkbox`,
`app-editable-input`, `app-icon-btn`, `app-btn`, and cells `app-pill` / `app-money` /
`app-stock` / `app-thumb`. Cell modifier classes `.is-mono / .is-dim / .is-right / .is-center`;
slug chips use global `.app-slug-chip`. Tokens + the brand-red rule for these → `theme` skill.

**Rule:** need a new cell type? add it to the library so every table gets it — don't style
locally. Inline-edit screens (Categorías, card-types, Métodos de envío) bridge their per-row
`FormGroup`s to `app-editable-input`/`app-toggle` with small `val()`/`setText()`/`setNum()`
helpers (keeps validation + dirty tracking). Detail-page inner tables (RaffleDetail
participants, OrderDetail items) apply `.app-table` directly — **no** `app-table-card`, since
they already sit in a `mat-card` panel. **Sets** is a series-grouped accordion (not a flat
table): the `mat-expansion-panel` is re-skinned (`hideToggle` + glyph chip / count / "Expandido"
pill / rotating chevron, driven by the panel's own `expanded` via a `#panel` ref) over a grid of
set-cards (code / glyph / name / date); clicking a card still opens the Material edit dialog.

**Toggles:** the admin uses `app-toggle` everywhere, **never `mat-slide-toggle`.** In tables
bind `[on]` + `(change)` (or `[(on)]`); in reactive forms use `app-labeled-toggle` — it's a
`ControlValueAccessor`, so `<app-labeled-toggle formControlName="x">` is a drop-in. Productos
"Destacado" stays `app-checkbox` (a checkbox, not a toggle). The migration's **only**
behavioural addition was **tab count badges** — Pedidos via `OrdersService.countByStatus()`
(grouped head-counts), the rest computed from already-loaded rows; everything else (filters,
search debounce, server pagination, soft-delete+undo, raffle draw) was preserved as-is.

## Shared form system

Every admin **create/edit form** composes layout shells from `src/app/shared/forms/`
(`app-back-header`, `app-form-section`, `app-sub-section`, `app-form-grid`, `app-form-footer`,
`app-selected-card-preview`) plus the table system's `app-btn` / `app-labeled-toggle`. The
Material controls themselves (`mat-form-field`, `mat-select`, `mat-checkbox`, `mat-datepicker`)
are **kept** and reskinned globally by `_admin-forms.scss` (scoped to `app-admin-shell`) →
`theme` skill. Add `class="is-mono"` for slug/price/ID fields and
`panelClass="admin-form-overlay"` on every select/datepicker so its overlay panel is styled.

Reskinned forms: add-product, product-edit, coupon-edit, page-edit, config, and the
Métodos-de-envío inline add-bar — **reskin only**, same fields/validators/flows preserved (TCGdex
autofill, image-picker suffix, slug gen, coupon type-conditional validators, page HTML live
preview, config single-save, raffle/card conditional fields). `app-labeled-toggle` gained an
optional `helper` line for the form "toggle-row". `app-dropdown` is now a real `mat-select` (was
a native `<select>`, whose OS-drawn list can't be styled).

**Cliente detail** (`/admin/customers/:id`) reuses `app-back-header` + `app-table-card` (info +
KPI cards, monogram avatar) + the `.app-table` order history — no new components.

## Dashboard

`/admin/` (AdminDashboard) leads with five KPI tiles — **Total Orders, Total Sales, Total
Customers, Inventory Value, People Online** — then a 2-up panel grid: 30-day **sales/orders
trend** sparklines, a **recent-orders** panel, and two customer panels — **Últimos registros**
(newest sign-ups, by `created_at`, shows registration date) and **Actividad reciente**
(most recently active, by `last_sign_in_at`, shows last-login `d/MM HH:mm` or "Nunca").
**Inventory Value** ("Valor de inventario") shows `₡<compact>` of `sum(price × quantity)` over
active, in-stock products — non-clickable (no inventory drilldown route). The original
operational tiles (pending orders, active raffles incl. a "¡Sorteo hoy!" amber alert) sit
below. Tiles use the allowed palette (blue/green/amber/indigo/teal) — **never brand red**
(→ `theme` skill).

- **Headline data** comes from one RPC, `admin_dashboard_stats()` (totals + 30-day series),
  via `DashboardService` (`src/app/core/dashboard/`). → `database` skill.
- **People Online** is live, not from the DB: `PresenceService` (`src/app/core/presence/`)
  counts storefront visitors over a Supabase **Realtime presence** channel; the UserShell
  announces each shopper. → `database` skill (Realtime presence).
- **Sparklines** are a dependency-free inline-SVG component, `src/app/shared/sparkline/`
  (responsive, non-scaling line stroke + an HTML end-dot).
- Recent orders reuse `OrdersService.listOrders({ pageSize: 8 })`.
- Both customer panels reuse `CustomersService.listCustomers({ pageSize: 8 })`; "Actividad
  reciente" passes `sort: 'active'` (→ the RPC's `p_sort` param). Rows link to
  `/admin/customers/:id`. Panels share `.recent-user__*` styles.

## Add / edit product

New-product form uses TCGdex card + set **typeaheads** (`shared/card-typeahead/` with set
filter; `shared/set-typeahead/` over cached `SetsService.list`), the image picker, a default
"Singles" category, and a multi-select for card-types. ProductEdit offers a quick-update card
plus the full form. Catalog services live in `src/app/core/catalog/` (`ProductsService`,
`CategoriesService`, `SetsService`, `CardTypesService`, `CouponsService`, `TcgdexCardsService`).

**Duplicate-card warning** (add-product only): picking a TCGdex card fires
`ProductsService.listByCardRef(card.id)` and renders an amber banner if that card already exists
as one or more products (any condition/variant/language — admin RLS sees inactive rows too). The
SKU whose slug matches the current form's slug is flagged as the exact duplicate / restock target
(via the `exactDuplicate` computed off a `currentSlug` mirror, so it re-evaluates live as
condition/variant/language change); other matches read as "ya está en el catálogo". Each row links
to its edit page. Non-blocking — the hard duplicate-slug stop stays at submit (`slugInUse`). Manual
mode has no `card_ref`, so no banner. Banner uses amber tokens (`--accent-amber*`/`--amber-text`),
never brand red.

## Coupons admin

CRUD at `/admin/coupons` (list with filters + search + soft-delete-with-undo) and the shared
add/edit form with type-reactive validators (`FIXED_ON_THRESHOLD` requires
`min_purchase_amount`) plus an optional **Nombre** label (shown in the list under the code + in
the Cupones report). The coupon **logic** (validation, discount calc, redemption) is in Postgres
RPCs — see the `database` skill. Admin CRUD just writes the `coupons` rows.

## Raffles admin

A raffle is a product in the Rifas category; the **draw date** is set on the admin product form
and saved via `RafflesService.upsert`. `/admin/raffles` lists Activas/Completadas;
`/admin/raffles/:id` (RaffleDetail) shows participants + payment status, lets the admin **draw
the winner** (blocked until entries are paid — `draw_raffle` raises `UNPAID_ENTRIES`), and copy
participant names for the wheel. Draw mechanics, `rifas_listing`, and exclusion rules →
`database` skill. Customer-facing `/rifas` → `storefront` skill.

## Customers admin

`/admin/customers` (Customers) lists **registered accounts** — searchable (name/email/phone)
and paginated, showing each customer's order_count, total_spent (realized revenue), and last
order. `/admin/customers/:id` (CustomerDetail) shows the profile, saved shipping address, the
same stats, and full order history (rows link to `/admin/orders/:id`). `CustomersService`
(`src/app/core/customers/`) wraps two admin RPCs — `admin_customers` (list) and `admin_customer`
(detail) — which are needed because customer email lives in `auth.users`, not on `profiles`
(→ `database` skill).

The Clientes nav item pointed here before the screen existed (a dead link); it now resolves.
Guests who checked out without an account don't appear here — they live in the Pedidos screen.

## Reports

`/admin/reports` (Reports) is a tabbed hub — a `app-page-header` + `app-pill-tabs` switcher over
five self-contained read-only report components, each reusing the shared table system +
`app-date-range` filter and backed by `ReportsService` (`src/app/core/reports/`):

- **Pedidos por cliente** — per-customer order totals (# orders, # products, total spent);
  customer search + date range; sort by spend / orders / recency.
- **Actividad de clientes** — login / order / registration events with IP + timestamp; filter
  by customer, date, IP.
- **Búsquedas** — storefront search terms with match count + customer (or *Invitado*) + IP;
  filter by customer type (Todos / Registrados / Invitados), keyword, customer, date, IP.
- **Cupones** — per-coupon usage (# orders, total **discount given**, total **order revenue**)
  with an **Editar** action → that coupon's edit page.
- **Puntos** — every loyalty-points transaction (date · customer · email · tipo · signed
  points · source pedido); customer search + date range; sort recientes / mayor cantidad.
  Reversals (negative) render in the Danger error color. Data side → `database` skill.

Mirrors the `customers`/`orders` screen patterns (signals + debounce + effect → refresh). The
data collection (event tables, `log_activity`/`log_search`/`client_ip`, `place_order_v8`) and
the report RPCs live in the `database` skill. Search logging is fired from the storefront header
box; login/registration logging from `AuthService` — both → `database` (Reports) / `storefront`.

## Price review

`/admin/price-review` (PriceReview) is a **card-by-card triage surface** — not a paginated
table — for products whose store price has drifted from the TCGplayer market signal. One
flagged card at a time: image (180×237) on the left, identity + facts + commit on the right,
centered with `max-width: 700px` so it doesn't stretch on wide monitors. Lives at its own
top-level admin route (a feature, not a sub-report) with a `price_check` icon in the sidenav,
right after Reportes.

**Run flow.** Page-header button "Ejecutar revisión ahora" opens an **options panel** above the
card with the threshold % and floor ₡ pre-filled from `app_settings.price_review_*`; a live
qualifying-count line ("N cartas singles en NM serán revisadas con este piso") updates as the
floor changes (250 ms debounce). Whatever the admin enters there is used **for that one run
only** — `app_settings` is not touched. "Iniciar revisión" kicks off
`ReportsService.runPriceReviewNow(progress, overrides)`; the header swaps to a progress chip
`scanned / total · flagged` while the loop fetches each card from TCGdex and writes to
`price_reviews` via `admin_record_price_check`. Three-state machine in the component:
`idle | configuring | running`.

**Scope (intentional + visible).** The check considers only **active singles in NM condition
with `card_ref` and `price ≥ floor`**. The runner pre-fetches the singles category id via
`from('categories').eq('slug', 'singles')` once per session (memoized). A muted line under the
page header reads "Solo cartas singles en NM (Near Mint)" so the admin doesn't wonder why
LP/MP stock never shows up. Same scope on the cron path's edge function. (TCGplayer's published
`marketPrice` is NM by convention — comparing other conditions to it generates false positives.)

**Card body.** Two-column grid (`auto | minmax(0, 1fr)`). Left: `app-thumb` 180px. Right:
identity (name, full set name on its own line, then `card_number · variant · condition · language`),
a facts row with three cells sharing one baseline (`Tu precio` / `Mercado (TCGplayer)` /
`Diferencia`) where the money values are bumped to 19px via a local `::ng-deep .money` override
so they sit on the same grid; the Diferencia cell stacks the **CRC delta** as the primary value
("+₡20 905") with the **percentage pill** below as a secondary qualifier (red = over, amber =
under, color carries direction). A small "**↗** Ver en TCGplayer" link sits inline next to the
Mercado price — prefers the deep `/product/<id>` link when `tcgplayer_product_id` was
snapshotted on the row, falls back to a search URL composed of `name + card_number + set_name`
when TCGdex has no productId for that card (older e-card / promo sets). Below the card sits a
muted **`REVISANDO CARTA X DE Y`** counter; Y is the queue size when the batch started (anchored
once, doesn't shrink as cards are processed), reset to the new pending count after a fresh run.

**Commit row** (full-width column under the facts): a `mat-form-field` "Precio sugerido"
pre-filled with the row's `suggested_price` (already rounded to the nearest ₡100), then
Ignorar / Aceptar buttons split with `justify-content: space-between` — Ignorar pinned to the
left edge, Aceptar to the right — so they can't be confused under a quick click. Aceptar
commits whatever value is in the input (editable before accepting); Ignorar hides the row
until the next check rebuilds the queue.

**Pieces:**
- `src/app/admin/price-review/price-review.{ts,html,scss}` — the component.
- `src/app/core/reports/reports.service.ts` — runner + `priceReviewSummary` / `priceReviewNext`
  / `priceReviewIgnore` / `priceReviewAccept` / `priceReviewQualifyingCount` + a memoized
  `singlesCategoryId()` helper.
- `src/app/core/catalog/tcgplayer-pricing.ts` — shared `firstTcgplayerVariant` /
  `tcgplayerMarketUsd` / `tcgplayerUpdatedAt` helpers (extracted from add-product so both the
  suggested-price autofill and the runner read the SAME data the same way).
- `/admin/config` → new "Revisión de precios" form section: enabled toggle, threshold %,
  floor ₡. Helper text spells out the NM-only scope.
- DB + cron + edge function → `database` skill.

## Image picker (admin)

The product forms have a folder-icon suffix on the **URL de la imagen** field that opens a
Windows-Explorer-style modal to browse the `/card-images/` tree on SiteGround, create folders,
upload images into the current folder, and pick one. Uploading does **not** auto-select — the
new file appears (briefly highlighted) and the admin clicks it.

- **Service / dialog:** `src/app/core/images/image-browser.service.ts` (`list()`/`upload()`/
  `createFolder()`) + `src/app/shared/image-picker/image-picker-dialog.{ts,html,scss}`. The
  dialog returns + stores **relative** URLs (cutover-safe).
- **Config per env:** `environment*.ts` `images.listUrl` is **root-relative**
  (`/card-images/list-images.php`) → same-origin in prod, and rides the `/card-images` dev proxy
  (`proxy.conf.mjs`) on localhost (forwards to the password-protected host with `.env.local`
  creds `IMAGES_HTTP_USER` / `IMAGES_HTTP_PASSWORD`). Upload/create URLs are derived from
  `listUrl`. Empty `listUrl` = picker disabled.

### PHP endpoints (no Node on SiteGround)

`server/list-images.php` (listing), `server/upload-image.php` (multipart upload),
`server/create-folder.php` (mkdir) — all live at the ROOT of the host's `card-images/` folder.
`scripts/upload-images.mjs` pushes every `server/*.php` there via `npm run images:upload` or
`images:upload:endpoints`. Location-aware (`__DIR__`) — move the folder, no edits.

- **Bound check:** all resolve `path` against `realpath()` and refuse anything outside their own
  directory (`..` can't escape); folder names slugified to one safe segment.
- **Upload safety:** validates real MIME (`finfo`), accepts only
  `image/{webp,png,jpeg,gif,avif}`, and **derives the saved extension from the detected type**
  (a disguised `.php` payload can't be written executable). Filename slugified + de-duplicated
  (never overwrites). Returns `{name,path,url,size,mtime}` (same shape as the listing).
- **Admin-gated:** each endpoint `require`s `server/_supabase-auth.php` → `require_admin()`. The
  SPA sends the admin's Supabase token in the **`X-Supabase-Token`** header (custom — `Authorization`
  is taken by the dev proxy's Basic auth); PHP validates via token introspection
  (`GET /auth/v1/user`, requires `app_metadata.role === 'admin'`). No server-side secret —
  `server/auth-config.php` holds only the public URL + publishable key. The images themselves are
  static (no PHP) so they stay public for the storefront. Deploy details → `deploy` skill.
