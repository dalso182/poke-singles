# Routing & guards

> Part of the Poke-Singles docs set. Verified against source on 2026-07-20. Load together with /CLAUDE.md.

## Purpose

Defines how every URL in the app resolves: the full lazy route table in `src/app/app.routes.ts`, the router providers in `src/app/app.config.ts` (including `withComponentInputBinding()` and its undefined-default footgun), and the three functional guards (`adminGuard`, `customerGuard`, `maintenanceGuard`) that gate the admin panel, the account area, and the whole storefront during maintenance mode.

## Scope

- **In scope:** `src/app/app.routes.ts`, `src/app/app.config.ts`, `src/app/core/auth/admin.guard.ts`, `src/app/core/auth/customer.guard.ts`, `src/app/core/auth/maintenance.guard.ts`, and how routed components consume router-bound inputs.
- **Out of scope:** what each screen does (see `docs/screens/**`), the auth session machinery behind `AuthService.ready` / `isAdmin()` (see [auth-and-roles](./auth-and-roles.md)), the `app_settings.maintenance_mode` flag storage (see [data-model](./data-model.md)).

## Key files

| File | Role |
|---|---|
| `src/app/app.routes.ts` | The single route table. Every route is lazy (`loadComponent`). |
| `src/app/app.config.ts` | `provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling(...))`, `provideHttpClient(withFetch())`, `provideAnimationsAsync()`, `provideBrowserGlobalErrorListeners()`. |
| `src/app/core/auth/admin.guard.ts` | `adminGuard` — gates `/admin` (`canActivate` + `canActivateChild`). |
| `src/app/core/auth/customer.guard.ts` | `customerGuard` — gates the `/account*` routes. |
| `src/app/core/auth/maintenance.guard.ts` | `maintenanceGuard` — gates the entire UserShell branch. |
| `src/app/core/settings/app-settings.service.ts` | `AppSettingsService.getMaintenance()` used by `maintenanceGuard` (cached, 60 s TTL). |

## How it works

### Top-level ordering (load-bearing)

The `routes` array has four top-level entries **in this order**:

1. `admin` — AdminShell branch
2. `library` — designer reference, no shell, no guard
3. `mantenimiento` — standalone maintenance screen, no shell, **not gated** (it is the guard's redirect target)
4. `''` — UserShell branch (the storefront catch-all)

**Specific paths must come before the empty-path UserShell.** The UserShell parent has `path: ''` with children, so if it came first the router would try to match `/admin`, `/library`, and `/mantenimiento` inside the storefront and mis-route them.

### Full route table

All components are lazy-loaded via `loadComponent: () => import(...).then(m => m.X)`.

#### `/admin` — AdminShell (`canActivate: [adminGuard]`, `canActivateChild: [adminGuard]`)

| Path (under `/admin`) | Component | Notes |
|---|---|---|
| `''` | `AdminDashboard` | `pathMatch: 'full'` |
| `products` | `ProductsList` | `pathMatch: 'full'` |
| `products/new` | `AddProduct` | |
| `products/:id/edit` | `ProductEdit` | |
| `raffles` | `Raffles` | `pathMatch: 'full'` |
| `raffles/:id` | `RaffleDetail` | |
| `auctions` | `Auctions` | `pathMatch: 'full'` |
| `auctions/:id` | `AuctionDetail` | `:id` = product uuid |
| `categories` | `Categories` | |
| `sellers` | `Sellers` | `pathMatch: 'full'` |
| `sellers/:id` | `SellerDetail` | Per-seller consignment payouts (Sellado / Singles) |
| `filters` | `Filters` | |
| `coupons` | `Coupons` | `pathMatch: 'full'` |
| `coupons/new` | `CouponEdit` | Same component as edit |
| `coupons/:id/edit` | `CouponEdit` | |
| `shipping-methods` | `ShippingMethods` | |
| `orders` | `Orders` | `pathMatch: 'full'` |
| `orders/:id` | `OrderDetail` | |
| `customers` | `Customers` | `pathMatch: 'full'` |
| `customers/:id` | `CustomerDetail` | |
| `reports` | `Reports` | `pathMatch: 'full'` |
| `price-review` | `PriceReview` | |
| `sets` | `Sets` | |
| `pages` | `PagesList` | `pathMatch: 'full'` |
| `pages/new` | `PageEdit` | Same component as edit |
| `pages/:id/edit` | `PageEdit` | |
| `config` | `AdminConfig` | Exported class is `AdminConfig` (file `admin/config/config.ts`) |

There is **no** `/admin/card-types` route. `src/app/admin/card-types/card-types.ts` still exists on disk but is unrouted (superseded by `/admin/filters`).

#### `/library` and `/mantenimiento` (no shell)

| Path | Component | Notes |
|---|---|---|
| `library` | `Library` | Designer reference gallery — see [../screens/library.md](../screens/library.md). No guard. |
| `mantenimiento` | `Maintenance` | Redirect target of `maintenanceGuard`. Deliberately **not** gated — it is the fallback, and gating it would loop. See [../screens/storefront/maintenance.md](../screens/storefront/maintenance.md). |

#### `''` — UserShell (`canActivate: [maintenanceGuard]`, `canActivateChild: [maintenanceGuard]`)

| Path | Component | Route data / guards |
|---|---|---|
| `''` | `Home` | `pathMatch: 'full'` |
| `products` | `CardList` | Query-param inputs: `sets`, `types`, `tipo`, `sort`, `categoria` |
| `buscar` | `SearchResults` | Query-param inputs: `q`, `sort`, `sets`, `types` |
| `rifas` | `Rifas` | |
| `subastas` | `Subastas` | |
| `subastas/:slug` | `SubastaDetail` | `slug` is `input.required<string>()`. **No auth guard** — bidding gates sign-in at action time (in-place LoginDialog). |
| `ofertas` | `CardList` (reused) | `data: { onSaleOnly: true, basePath: '/ofertas' }` — flips CardList into discounted-only mode |
| `categoria/:categorySlug` | — redirect | Function `redirectTo`: `inject(Router).createUrlTree(['/products'], { queryParams: { categoria: params['categorySlug'], ...queryParams } })`. Legacy category URLs become the `?categoria=` facet on `/products`, preserving incoming query params (e.g. `?tipo=`). |
| `products/:slug` | `Detail` | `slug` is `input.required<string>()` |
| `account` | `Account` | `canActivate: [customerGuard]`. No `initialView` data → Datos panel. |
| `account/direccion` | `Account` | `customerGuard`, `data: { initialView: 'direccion' }` |
| `account/pedidos` | `Account` | `customerGuard`, `data: { initialView: 'pedidos' }` |
| `account/puntos` | `Account` | `customerGuard`, `data: { initialView: 'puntos' }` |
| `account/pokedex` | `Account` | `customerGuard`, `data: { initialView: 'pokedex' }` |
| `cart` | `CartPage` | **No guard** — anonymous carts are supported (localStorage). |
| `checkout` | `Checkout` | **No guard** (see Gotchas). |
| `checkout/confirmation/:id` | `OrderConfirmation` | `id` is `input.required<string>()`; also reads an `email` query-param input (default `''`). |
| `info/:slug` | `StaticPage` | `slug` is `input.required<string>()`. CMS pages from the admin Páginas screen. |

### Router providers (`app.config.ts`)

```ts
provideRouter(
  routes,
  withComponentInputBinding(),
  withInMemoryScrolling({
    scrollPositionRestoration: 'enabled',   // forward nav scrolls to top; back/forward restores
    anchorScrolling: 'enabled',
  }),
)
```

`provideHttpClient(withFetch())` exists **only** to lazy-load `assets/data/pokemon.json` for the avatar picker; all other data goes through the Supabase client. `provideAnimationsAsync()` supplies Material animations.

### `withComponentInputBinding()` — the undefined-default footgun

Route params, query params, **and route `data`** bind directly to component `input()`s. The footgun: on any route where a bound key is *absent*, the router explicitly writes `undefined` into the input, **overriding the input's declared default**.

Concrete case (`src/app/user/card-list/card-list.ts`):

```ts
readonly basePath = input<string>('/products');   // default is a lie under the router
// ...
protected readonly effectiveBasePath = computed<string>(
  () => this.basePath() ?? '/products',           // the mandatory guard
);
```

On `/products` (no `basePath` in route data) `basePath()` returns `undefined`, not `'/products'`. Before the `?? '/products'` guard was added, filter navigation built `navigate(['undefined', ...])` → `NG04008`, silently breaking every filter on `/products`.

Same pattern in `Account` (`src/app/user/account/account.ts`):

```ts
readonly initialView = input<AccountView | undefined>();
// ngOnInit:
this.view.set(this.initialView() ?? 'datos');
```

**Rule: every router-bound input that is missing on at least one route mapping to the component must be read through `?? fallback`.** Query-param inputs behave the same way but reading them with a fallback at the use site is the established fix — do not switch them to `queryParamMap`.

Note `onSaleOnly = input<boolean>(false)` on CardList is read raw (`this.onSaleOnly()`); on `/products` it arrives `undefined`, which is falsy, so it happens to work — but any strict `=== false` comparison would break.

### The three guards

All three are functional `CanActivateFn`s and all begin with `await auth.ready` so a hard refresh does not race Supabase session hydration (without it a logged-in admin would be bounced off `/admin` on F5).

#### `adminGuard` (`admin.guard.ts`)

Applied as both `canActivate` and `canActivateChild` on the `admin` branch.

1. `await auth.ready`
2. Not signed in → dynamically `import('../../auth/login-dialog/login-dialog')` (keeps the dialog + Material deps out of the initial bundle), opens `LoginDialog` with `panelClass: 'login-dialog-panel'`, `autoFocus: 'first-tabbable'`, `restoreFocus: true`, and returns `router.createUrlTree(['/'])`.
3. Signed in but `!auth.isAdmin()` → `MatSnackBar` "Necesitas permisos de administrador para entrar al panel." (action "OK", `duration: 5000`) and returns `createUrlTree(['/'])`.
4. Admin → returns `true`.

#### `customerGuard` (`customer.guard.ts`)

Applied via `canActivate` on `/account` and each `account/*` deep-link route only.

1. `await auth.ready`
2. Signed in → `true`.
3. Signed out → lazy-opens the same `LoginDialog` (same options) and returns `createUrlTree(['/'])`. There is no returnUrl mechanism — after login the user is on `/`.

#### `maintenanceGuard` (`maintenance.guard.ts`)

Applied as `canActivate` + `canActivateChild` on the empty-path UserShell branch (so it runs on every storefront navigation, including child-to-child).

1. `await auth.ready`
2. `auth.isAdmin()` → `true` (admins bypass so they can preview the store and reach `/admin/config` to turn maintenance off; `/admin` itself is not under this guard).
3. `await settings.getMaintenance()` → reads `app_settings.maintenance_mode` through `AppSettingsService.load()`, which caches the singleton row with a **60,000 ms default TTL** (`load(maxAgeMs = 60_000)`) and coalesces concurrent calls, so the guard does not round-trip per navigation.
4. Maintenance on → returns `createUrlTree(['/mantenimiento'])`; otherwise `true`.

### Guard return semantics

Every deny path returns a `UrlTree` (never `false`), so a blocked navigation always lands somewhere sensible instead of cancelling in place. All guards are `async` (return `Promise<boolean | UrlTree>`); the router awaits them.

## Contracts & conventions

- **Every route is lazy.** New screens use `loadComponent: () => import('...').then(m => m.X)`; no eager components in the table.
- **New admin screens** go inside the `admin` children array (guard inherited via `canActivateChild`); **new storefront screens** go inside the UserShell children (maintenance-gated automatically). Standalone/no-shell screens (like `/library`) must be inserted **above** the empty-path UserShell entry.
- **Route `data` keys in use:** `onSaleOnly: boolean` + `basePath: string` (CardList/`/ofertas`), `initialView: 'direccion' | 'pedidos' | 'puntos' | 'pokedex'` (Account).
- **Guarded input reads:** router-bound inputs are read with `?? fallback` (see footgun above).
- **URL sync without navigation:** `Account.select(view)` switches panels via `location.replaceState(view === 'datos' ? '/account' : '/account/' + view)` — the URL updates but the router never re-runs, so `initialView` only matters on initial navigation / hard refresh.
- **Snackbar/dialog from guards:** guards may inject `MatDialog` / `MatSnackBar`; keep dialog components lazily imported inside the guard body.

## Gotchas / invariants

- **Ordering invariant:** `admin`, `library`, `mantenimiento` must precede the empty-path UserShell entry, or the storefront catch-all swallows them.
- **`/mantenimiento` is intentionally unguarded** — anyone can visit it even when maintenance is off (it just renders the maintenance screen). Guarding it would create a redirect loop.
- **`customerGuard`'s docstring says "(e.g. /account, /cart, /checkout)" but the route table only applies it to the `/account*` routes.** `/cart` and `/checkout` are deliberately reachable anonymously (anon carts live in localStorage); the comment overstates its usage.
- **Maintenance flag latency:** because `AppSettingsService.load()` caches for 60 s, flipping maintenance mode on can take up to a minute to affect an already-browsing visitor (and their next navigation).
- **No returnUrl:** both auth guards dump the user on `/` after opening the login dialog; the originally requested URL is lost.
- **`withComponentInputBinding` overrides input defaults with `undefined`** on routes missing the key — the single most common routing bug in this codebase. Always `?? fallback` (see CardList `effectiveBasePath`, Account `initialView`).
- **Dead component:** `src/app/admin/card-types/` is still on disk and still imports the shared table primitives, but no route points at it. CLAUDE.md's compact route table is stale: it lists `card-types` and omits `sellers`, `filters`, `shipping-methods`, `orders(/: id)`, `customers(/:id)`, `price-review`, `pages`, `/ofertas`, `/checkout(+confirmation/:id)`, `/info/:slug`, `/mantenimiento`, the `categoria/:categorySlug` redirect, and the `account/*` deep links. Trust `app.routes.ts` / this doc.
- **The scroll behavior is global** (`withInMemoryScrolling` on the root router), so programmatic navigations from the footer, header, etc. all scroll to top on forward nav.

## Related docs

- [auth-and-roles.md](./auth-and-roles.md) — `AuthService.ready`, `isSignedIn()`, `isAdmin()`, the login dialog.
- [data-model.md](./data-model.md) — `app_settings` (maintenance flag), `profiles`.
- [shared-components.md](./shared-components.md) — components the routed screens compose.
- [../screens/storefront/card-list.md](../screens/storefront/card-list.md), [../screens/storefront/account.md](../screens/storefront/account.md) — the two canonical router-input consumers.
- [../screens/storefront/maintenance.md](../screens/storefront/maintenance.md), [../screens/admin/admin-shell.md](../screens/admin/admin-shell.md), [../screens/library.md](../screens/library.md).
