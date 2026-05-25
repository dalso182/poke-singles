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
  (`/admin/customers` list + per-customer detail), `/admin/config` (exchange rate,
  maintenance), and the server-side PHP image-picker endpoints. Trigger this for admin
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
| `/admin/` | Dashboard | KPI tiles (orders/sales/customers + live visitors), 30-day trend sparklines, recent orders, pending-orders + raffle tiles |
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
| `/admin/config` | AdminConfig | exchange rate, maintenance flag |

## Dashboard

`/admin/` (AdminDashboard) leads with four KPI tiles — **Total Orders, Total Sales, Total
Customers, People Online** — then 30-day **sales/orders trend** sparklines and a
**recent-orders** panel, with the original operational tiles (pending orders, active raffles
incl. a "¡Sorteo hoy!" amber alert) kept below. Tiles use the allowed palette
(blue/green/amber/teal) — **never brand red** (→ `theme` skill).

- **Headline data** comes from one RPC, `admin_dashboard_stats()` (totals + 30-day series),
  via `DashboardService` (`src/app/core/dashboard/`). → `database` skill.
- **People Online** is live, not from the DB: `PresenceService` (`src/app/core/presence/`)
  counts storefront visitors over a Supabase **Realtime presence** channel; the UserShell
  announces each shopper. → `database` skill (Realtime presence).
- **Sparklines** are a dependency-free inline-SVG component, `src/app/shared/sparkline/`
  (responsive, non-scaling line stroke + an HTML end-dot).
- Recent orders reuse `OrdersService.listOrders({ pageSize: 8 })`.

## Add / edit product

New-product form uses TCGdex card + set **typeaheads** (`shared/card-typeahead/` with set
filter; `shared/set-typeahead/` over cached `SetsService.list`), the image picker, a default
"Singles" category, and a multi-select for card-types. ProductEdit offers a quick-update card
plus the full form. Catalog services live in `src/app/core/catalog/` (`ProductsService`,
`CategoriesService`, `SetsService`, `CardTypesService`, `CouponsService`, `TcgdexCardsService`).

## Coupons admin

CRUD at `/admin/coupons` (list with filters + search + soft-delete-with-undo) and the shared
add/edit form with type-reactive validators (`FIXED_ON_THRESHOLD` requires
`min_purchase_amount`). The coupon **logic** (validation, discount calc, redemption) is in
Postgres RPCs — see the `database` skill. Admin CRUD just writes the `coupons` rows.

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
