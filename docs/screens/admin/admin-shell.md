# Admin shell (/admin layout)
> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose
`AdminShell` is the persistent chrome around every back-office screen: a top toolbar (brand, global-search stub, "Ir a la tienda" link, notifications stub, profile menu) plus a collapsible grouped sidenav with live count badges. All admin child routes render inside its `<router-outlet />`. It also owns the sign-in/sign-out affordances for the admin session.

## Route & access
- Path: `/admin` (lazy `loadComponent` in `src/app/app.routes.ts`), with all admin screens as children.
- Guard: `adminGuard` on **both** `canActivate` and `canActivateChild` of the `admin` route.
- `adminGuard` (`src/app/core/auth/admin.guard.ts`) awaits `auth.ready` (session hydration), then:
  - signed out → redirects to `/` and lazily opens `LoginDialog` (`panelClass: 'login-dialog-panel'`);
  - signed in but not admin → redirects to `/` with snackbar `"Necesitas permisos de administrador para entrar al panel."` (5000 ms);
  - admin → allow. Admin-ness = `AuthService.isAdmin`, a computed that checks `user.app_metadata.role === 'admin'`.
- No query params of its own. localStorage key: `admin-nav-pinned` (pinned sidenav group).

## Files
- `src/app/admin/admin-shell/admin-shell.ts` — component class, nav model, badge fetches, pin persistence, ⌘K handler.
- `src/app/admin/admin-shell/admin-shell.html` — toolbar + sidenav template (`mat-toolbar`, `mat-sidenav-container`).
- `src/app/admin/admin-shell/admin-shell.scss` — shell styling (`.admin-toolbar`, `.admin-sidenav`, `.nav-row`, `.nav-badge`, `.store-status` …).
- `src/app/admin/admin-shell/admin-shell.spec.ts` — spec (note: `should create` specs across admin fail pre-existing NG0201/ActivatedRoute; not shell-specific).
- `src/app/core/auth/admin.guard.ts` — route guard (see above).
- `src/app/app.routes.ts` — the `/admin` child route table the sidenav must stay in sync with.

## UI anatomy
Top toolbar (`mat-toolbar.admin-toolbar`), left → right:
1. `.brand-bar.admin-top-stripe` — the brand-red gradient stripe (allowed red use).
2. Hamburger icon button (`aria-label="Alternar menú"`) → `toggleSidenav()`.
3. Brand link to `/admin`: logo `assets/images/poke-singles-logo.png` + wordmark `POKE-SINGLES · ADMIN`.
4. Global search (`.topbar-search`): plain `<input type="search">` with placeholder `"Buscar pedido, cliente, SKU…"` and a `⌘K` kbd hint. **Decorative stub** — no handler/control is wired; Cmd/Ctrl+K only focuses it.
5. `.topbar-actions`: link `"Ir a la tienda"` (routerLink `/`, `target="_blank"`), notifications icon button (badge only when `unreadNotifications() > 0` — currently always 0), profile icon button opening `#adminProfileMenu` (`xPosition="before"`).
6. Profile menu: signed out → `"Ingresar"` (opens lazy `LoginDialog`); signed in → display name row, optional disabled row `"Sin permisos admin"`, and `"Cerrar sesión"` → `signOut()` (snackbar `"Sesión cerrada"` 2500 ms, or the error for 4000 ms).

Sidenav (`mat-sidenav mode="side"`, `[opened]="sidenavOpen()"`, `nav.admin-nav` with `aria-label="Administración"`). Sections and items in exact order (label · icon · path):

| Section (key) | Items |
|---|---|
| *(ungrouped, `dashboard`)* | **Dashboard** · `dashboard` · `/admin` (exact) |
| **Catálogo** (`catalogo`, icon `inventory_2`) | **Productos** · `sell` · `/admin/products` (exact, badge `productCount`) · **Agregar producto** · `add_box` · `/admin/products/new` (exact) · **Categorías** · `category` · `/admin/categories` · **Sets** · `collections_bookmark` · `/admin/sets` (badge `setCount`) · **Filtros** · `tune` · `/admin/filters` · **Vendedores** · `storefront` · `/admin/sellers` · **Rifas** · `confirmation_number` · `/admin/raffles` (badge `raffleCount`) |
| **Ventas** (`ventas`, icon `shopping_cart`) | **Pedidos** · `receipt_long` · `/admin/orders` (badge `pendingOrderCount`, tone **amber**) · **Clientes** · `groups` · `/admin/customers` · **Cupones** · `local_offer` · `/admin/coupons` (badge `couponCount`) · **Métodos de envío** · `local_shipping` · `/admin/shipping-methods` |
| **Herramientas** (`herramientas`, icon `build`) | **Reportes** · `analytics` · `/admin/reports` · **Revisión de precios** · `price_check` · `/admin/price-review` · **Library** · `palette` · `/library` (exact) |
| **Información** (`informacion`, icon `info`) | **Páginas** · `description` · `/admin/pages` |
| *(ungrouped, `config`)* | **Configuración** · `settings` · `/admin/config` |

Below the nav: the `"Tienda en línea"` status card (`.store-status__card`) with a green dot. Since `onlineVisitors`/`cartsActive` are always `null` (no source wired), it renders the fallback link `"Ver tienda en vivo →"` to `/` instead of the metrics line `"{{n}} visitantes ahora · {{n}} con carrito activo"`.

**Nav ↔ route cross-check** (against `src/app/app.routes.ts`): every top-level admin child route has a nav item; routes without nav items are all detail/sub-routes reached from their list screens — `products/:id/edit`, `raffles/:id`, `coupons/new`, `coupons/:id/edit`, `orders/:id`, `customers/:id`, `pages/new`, `pages/:id/edit`. No nav item points at a nonexistent route. Note `Library` links **outside** the admin branch (`/library` is a top-level route with **no guard** and no shell).

## Services & backend
Badge counts are best-effort parallel fetches in `ngOnInit` (a failure silently leaves the badge hidden; each signal starts `null` so no `0` flash):
- `ProductsService.list({ page: 1, pageSize: 1 })` → `products` table (`count: 'exact'`) → `productCount` = `result.total`. Default filter excludes inactive, so this is the **active** product count.
- `SetsService.list()` → `sets` table → `setCount` = row count.
- `CouponsService.list()` → `coupons` table → `couponCount` = row count.
- `RafflesService.listSummary()` → RPC `admin_raffles_summary` → `raffleCount` = rows with `status === 'scheduled'`.
- `OrdersService.countPendingOrders()` → `orders` head-count where `status = 'pending'` → `pendingOrderCount` (amber).
Also: `AuthService` (`currentUser`, `isSignedIn`, `isAdmin`, `signOut()`), `MatDialog` (lazy `LoginDialog`), `MatSnackBar`.

## State & data flow
- `sidenavOpen = signal(true)` — hamburger toggles.
- `productCount/raffleCount/couponCount/setCount/pendingOrderCount: signal<number | null>` — badge sources on the `AdminNavItem.count` field; template renders a `.nav-badge` only when `count() !== null` (amber via `badgeTone: 'amber'`).
- `unreadNotifications = signal(0)`, `onlineVisitors`/`cartsActive = signal<number | null>(null)` — intentional stubs.
- `pinnedKey = signal<string | null>` — the one manually pinned-open group, read from/written to localStorage `admin-nav-pinned` (guarded by `isPlatformBrowser`). `toggleGroup(key)` replaces any previous pin (manual expands never stack).
- `currentUrl` — `toSignal` over router `NavigationEnd` events (`urlAfterRedirects`), initial value `router.url`.
- `isOpen(section)` = pinned **or** group-active; `isGroupActive` prefix-matches the URL (query/hash stripped) so detail routes like `/admin/orders/:id` keep their parent group open. Net effect: at most two groups expanded (pinned + active).
- `collapsedAmberCount(section)` — sums only amber badges; shown on a collapsed group header (so the pending-orders backlog stays visible when "Ventas" is closed).
- `@HostListener('document:keydown')`: Cmd/Ctrl+K → `preventDefault()` + focus `#searchInput` (via `viewChild`).

## Behaviors & edge cases
- Badge fetches never block the shell; each `.catch(() => {})`.
- Notifications button always works but only shows snackbar `"Notificaciones — próximamente"` (2500 ms) — no feed exists.
- `notificationsAriaLabel()` returns `"Notificaciones (N sin leer)"` / `"Notificaciones"`.
- `userDisplayName()` prefers `user_metadata.full_name`, then email, then `"Usuario"`.
- Signing out inside `/admin` does not itself navigate away; the guard only runs on the next navigation.
- Nav badges are fetched once at shell init and never refresh while navigating (e.g. marking orders paid doesn't update the amber Pedidos badge until a full shell reload).

## Gotchas / invariants
- The toolbar search is a **stub**: no `(input)`/FormControl/navigation. Don't document or promise search behavior; ⌘K just focuses it.
- `productCount` counts only **active** products (`list()` defaults to `active = true`), while the products screen can show inactives — the badge and the filtered table can disagree by design.
- `raffleCount` counts only `scheduled` raffles; `couponCount` counts every coupon row returned by `CouponsService.list()`.
- Pinned-group persistence writes `localStorage` **directly** (with `isPlatformBrowser` guard) instead of the shared `LocalStorageService` used elsewhere (e.g. add-product) — inconsistent but functional; no try/catch around the direct access, so a storage-disabled browser could throw on `toggleGroup`.
- The `"Tienda en línea"` card is *not* wired to `PresenceService` even though the dashboard has a live presence count — wiring `onlineVisitors`/`cartsActive` flips the card to the metrics line automatically.
- `/library` in the nav leaves the guarded admin branch entirely (public route, designer reference, no shell).
- `adminGuard` runs on **every child navigation** (`canActivateChild`) — each awaits `auth.ready` (already-resolved promise after first hydration, so cheap).
- CLAUDE.md's compact route list is stale vs `app.routes.ts`: it lists `card-types` (now `/admin/filters`) and omits `orders`, `customers`, `sellers`, `shipping-methods`, `price-review`, `pages`, `filters`.

## Related docs
- [Dashboard](./dashboard.md) · [Products list](./products-list.md) · [Add product](./add-product.md) · [Orders](./orders.md) · [Customers](./customers.md) · [Config](./config.md)
- [Routing & guards](../../architecture/routing-and-guards.md) · [Auth & roles](../../architecture/auth-and-roles.md) · [Shared components](../../architecture/shared-components.md)
- [Login dialog](../storefront/login-dialog.md) · [Library](../library.md)
