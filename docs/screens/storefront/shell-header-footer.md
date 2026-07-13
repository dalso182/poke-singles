# Storefront shell, header, navigation & footer

> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose

`UserShell` is the customer-facing chrome that wraps every storefront route: a sticky header (brand, search box, cart button, account menu), a left navigation sidenav (collapsible icon rail on desktop, slide-over drawer on mobile), a right-side cart drawer, the footer, and the global card hover-preview overlay. It also runs three storefront-wide side effects on init: the first-visit welcome dialog, Realtime presence tracking for the admin "people online" counter, and the post-login favorite-Pokémon picker prompt.

## Route & access

- The shell is the `path: ''` top-level route in `src/app/app.routes.ts`, lazy-loaded (`UserShell`), guarded by `maintenanceGuard` (`canActivate` + `canActivateChild`) — see [maintenance](./maintenance.md).
- Children: `''` (Home), `products`, `buscar`, `rifas`, `ofertas` (CardList with route data `{ onSaleOnly: true, basePath: '/ofertas' }`), `categoria/:categorySlug` (redirect to `/products?categoria=…`, preserving query params), `products/:slug`, `account` (+ `account/direccion|pedidos|puntos|pokedex` with route data `initialView`, all under `customerGuard`), `cart`, `checkout`, `checkout/confirmation/:id`, `info/:slug`.
- No auth is required for the shell itself; header/nav adapt to auth state.
- Route-order invariant (per CLAUDE.md and the routes file): `admin`, `library`, and `mantenimiento` must precede this empty-path config or the router mis-matches them.

## Files

- `src/app/user/user-shell/user-shell.ts` — shell component: breakpoint logic, nav rail state (persisted), cart drawer binding, scroll reset, welcome-dialog/presence/avatar-picker bootstrapping.
- `src/app/user/user-shell/user-shell.html` — `<app-header>` + `mat-sidenav-container` with nav sidenav, cart-drawer sidenav (`position="end"`), `router-outlet`, `<app-footer>`, `<app-card-preview-overlay>`.
- `src/app/user/user-shell/user-shell.scss` — 80px-header height math (`calc(100vh - 80px)`), rail width transition (76px ↔ 264px, 260ms), cart drawer width (360px, max 90vw).
- `src/app/user/header/header.ts` / `.html` / `.scss` — `Header` component: search, cart button, login/account dropdown, social icons.
- `src/app/user/header/header.spec.ts` — smoke spec (passes; router provided via `provideRouter([])`).
- `src/app/user/navigation/navigation.ts` / `.html` / `.scss` — `Navigation` component: sectioned nav with inline SVG icon literals, accordion (expanded) / hover flyout (collapsed), category facet links.
- `src/app/user/footer/footer.ts` / `.html` / `.scss` — `Footer` component: link columns, brand mark + socials, trust stats, fine print.
- `src/app/shared/user-avatar/user-avatar.ts` / `.html` / `.scss` — `UserAvatar`: resolves the avatar image chain (Pokémon mood portrait → Google photo → initials).
- `src/app/shared/social-icons/social-icons.ts` / `.html` / `.scss` — `SocialIcons`: static Instagram / Facebook / WhatsApp icon links.
- `src/app/core/presence/presence.service.ts` — `PresenceService`: Supabase Realtime presence channel `'online'`.
- Consumed services (documented elsewhere): `CartService`, `AuthService`, `LoyaltyService`, `SearchLogService`, `LocalStorageService`, `WelcomeDialogService`, `AvatarPickerService`, `ProfilesService`, `PokemonService`, `CategoriesService`, `CardTypesService`.

## UI anatomy

### Header (`app-header`, sticky, 80px)

Top to bottom / left to right:

1. `.brand-bar` — the thin brand-red gradient strip above the toolbar (one of brand red's allowed uses).
2. `mat-toolbar.app-header`:
   - `.header-left` — menu icon button (`aria-label="Toggle navigation"`, emits `toggleNav` output → `UserShell.toggleSidenav()`); brand link to `/` with `assets/images/poke-singles-logo.png` (65×65) and eyebrow text "Poke-Singles" (`.brand-eyebrow--inline`).
   - `.search-field` — outlined `mat-form-field` with `<input matInput placeholder="Buscar cartas…">`; submits on `keyup.enter` or the suffix search icon button (`aria-label="Buscar"`). Next to it, a `.search-help` icon button (`help_outline`, `aria-label="Ayuda de búsqueda"`) whose `matTooltip` is `searchHelpText`: "Busca por: nombre de la carta, Pokémon, set (nombre o código), número, número/total (p. ej. 15/151), tipo (Fire, Water…), ilustrador, marca de regulación o tipo de carta (Full Art, VMAX…)." (tooltip class `search-help-tooltip`, position `below`).
   - `.header-actions`:
     - `.cart-btn` (`shopping_cart`, `aria-label="Carrito"`) with `.cart-count` text badge shown when `cartCount() > 0`. Click calls `onCartClick()` which only opens the drawer — it never navigates to `/cart` (the drawer's "Ver carrito completo" button does that).
     - Signed out: `.header-profile-btn` (`person`, `aria-label="Iniciar sesión"`) → `openLogin()` lazy-imports and opens `LoginDialog` (`panelClass: 'login-dialog-panel'`).
     - Signed in: `.acct` custom dropdown — trigger `.acct-trigger` (`aria-haspopup="menu"`, `aria-label="Cuenta"`) shows `<app-user-avatar>` in a 40px circle plus an `expand_more` caret that rotates when open. When `menuOpen()`:
       - `.acct-backdrop` — full-screen fixed click-catcher that closes the menu (no document listeners).
       - `.acct-pop` (288px, `role="menu"`, arrow tip `.acct-tip`):
         - Identity block `.acct-id`: avatar again, `userDisplayName()` (metadata `full_name` → email → "Usuario"), email.
         - Poke-Coins card `.acct-coins` (amber gradient): `.acct-coins-main` links to `/account/puntos` — coin image `assets/images/coin-sm.png`, label "Poke-Coins", balance `points()` + unit "coins"; sibling chip `.acct-coins-redeem` "Canjear" (icon `redeem`) links to `/account/pokedex`. Two sibling anchors on purpose — anchors can't nest.
         - Items `.acct-items`: "Mi cuenta" → `/account` (icon `account_circle`); "Panel admin" → `/admin` (icon `shield_person`, only when `isAdmin()`); divider; "Cerrar sesión" button (icon `logout`, `.acct-item--danger` — Danger red `var(--danger)`, deliberately NOT brand red).
     - `<app-social-icons class="header-social">` — Instagram / Facebook / WhatsApp.

### Navigation sidenav (`app-navigation`)

Hosted in the left `mat-sidenav`. Two visual modes driven by the required input `expanded` (host classes `.expanded` / `.collapsed`): a 264px labeled panel or a 76px icon rail (collapsed labels become right-side `matTooltip`s; section labels render as "·").

Sections (from the `sections()` computed):

- key `top` (no label): "Home" → `/` (exact).
- "Explorar": "Todo" → `/products` (no params); "Singles" → `/products?categoria=singles`; "Sellado" → `/products?categoria=sellado` (+ children); "Rifas" → `/rifas`; "Ofertas" → `/ofertas`; "Accesorios" → `/products?categoria=accesorios` (+ children).
- "Cuenta": "Carrito" → `/cart` (live `cartCount()` badge — `.nav-meta` expanded, `.nav-badge` collapsed); "Mi cuenta" → `/account`; "Admin" → `/admin` (only when `AuthService.isAdmin()`).
- "Información": "Sobre nosotros" → `/info/sobre-nosotros`; "Políticas de envío" → `/info/politica-pedidos-envios`.

Items with `children` (Sellado / Accesorios sub-types loaded from the DB) are disclosure parents: in the expanded panel they toggle a `.children-accordion` (child links + "Ver todo en {{ item.label }}" `.see-all` row); in the collapsed rail they open a hover `.flyout` positioned at `flyoutTop()`/`flyoutLeft()` with a `.flyout-card`, `.flyout-header`, scroll area capped by `flyoutMaxHeight()`, the same child links, and the same "Ver todo en …" row. All 14 nav icons are inline SVG literals (`nav-home`, `nav-cards`, `nav-raffle`, `nav-ofertas`, `nav-cart`, `nav-account`, `nav-admin`, `nav-category`, `nav-box`, `nav-dice`, `nav-info`, `nav-truck`, `nav-chevron`) registered via `MatIconRegistry.addSvgIconLiteral` in the constructor. Bottom of the panel: `.nav-footer` with `<app-social-icons class="nav-social">`.

### Cart drawer sidenav

Second `mat-sidenav` (`position="end"`, `mode="over"`, class `user-shell-cart-drawer`, 360px / max 90vw) containing `<app-cart-drawer>`. Opened state binds to `CartService.drawerOpen`; `(closedStart)` calls `CartService.closeDrawer()`. See the cart-drawer doc.

### Content area & footer

`mat-sidenav-content.user-shell-content` holds `.user-shell-main` (24px padding, `min-height: 100%` so the footer sits below the fold before data loads) with the `router-outlet`, then `<app-footer>`, then `<app-card-preview-overlay>` (global hover preview).

### Footer (`app-footer`, `.site-footer`)

1. `.brand-bar` strip (aria-hidden).
2. `.footer-grid` — three `nav.footer-col` columns from the `columns` array:
   - "Tienda": "Ofertas" → `/ofertas`; "Nuevos ingresos" → `/products?sort=recent`; "Rifas" → `/rifas`; "Sobre nosotros" → `/info/sobre-nosotros`.
   - "Información": "Estado de cartas" → `/info/estado-de-cartas`; "Métodos de pago y envío" → `/info/metodos-pago-envio`; "Política de pedidos y envíos" → `/info/politica-pedidos-envios`.
   - "Mi cuenta": "Mi cuenta" → `/account`; "Mis órdenes" → `/account/pedidos`.
   Links support an alternate external form (`href`, new-tab, `rel="noopener"`) but every current entry is internal (`route`).
3. `.mid-row` — `.brand-mark` (logo 40×40 + `.socials`: three inline `.social-tile` anchors to Instagram `https://www.instagram.com/pokesingles/`, Facebook `https://www.facebook.com/pokesingles`, WhatsApp `https://wa.me/50663452039`) and `.stats` from the hardcoded `stats` array: "2021" / "Desde", "10,000+" / "Cartas vendidas", "6,500+" / "Pedidos realizados".
4. `.fine-print` — "© {{ year }} Poke-Singles Costa Rica · Todos los derechos reservados" and "Pokémon es propiedad de Nintendo / Creatures / Game Freak".

### UserAvatar (`app-user-avatar`)

Presentational; the parent supplies the circular container. Renders either `.user-avatar__img` or `.user-avatar__initials`. Input `maxInitials` (default 2; `/account` uses 1). Source priority: chosen Pokémon mood portrait chain → Google photo (`user_metadata.avatar_url` or `.picture`) → initials (fallback "U"). Mood derives from the live cart total via `avatarMoodForTotal(cart.total())`: `< 5000` CRC → Normal, `< 20000` → Happy, `< 50000` → Joyous, `>= 50000` → Joyous shiny. Hover tooltip (only while a Pokémon portrait shows) via `avatarMoodMessage`: "¡Pura vida! ¿Armamos el carrito?" / "¡Qué chiva lo que llevás!" / "Uffff!!, carrito de miedo 🔥" / shiny: "¡Este carrito brilla como yo, mae! ✨".

## Services & backend

- `CartService` — `drawerOpen` (readonly signal), `itemCount` (computed), `total` (computed), `openDrawer()`, `closeDrawer()`. Backed by `carts`/`cart_items` (see cart docs).
- `AuthService` — `currentUser`, `isSignedIn`, `isAdmin` signals; `signOut()`; `ready` promise; `signedInTick` (used by `AvatarPickerService`).
- `LoyaltyService` — `balance` readonly signal; `ensureLoaded()` fetches `SELECT amount FROM loyalty_transactions` (RLS `loyalty_self_read` scopes to the user) and sums client-side. Loaded lazily the first time the account menu opens while signed in; cleared to `null` on sign-out by an effect in the service.
- `SearchLogService.logSearch(term)` — fire-and-forget: RPC `count_search_products({ q })` then RPC `log_search({ p_term, p_found })`. Failures only `console.error`; navigation is never blocked.
- `PresenceService.joinAsVisitor()` — Supabase Realtime channel `'online'`, presence key = random string (`Math.random().toString(36)` + timestamp); on `SUBSCRIBED` it `track({ role: 'visitor', at: Date.now() })`. No backing table; the admin dashboard counts via `watchOnlineCount()` (subscribes without tracking) and `teardown()`. Browser-guarded, idempotent, never leaves until the tab closes.
- `WelcomeDialogService.maybeOpen()` — see [dialogs](./dialogs.md).
- `AvatarPickerService` — instantiated in the shell constructor purely for its constructor effect: after a fresh `SIGNED_IN` tick, if the loaded profile (`profiles.avatar_pokemon_number`) is null, the user isn't admin, and this user wasn't already prompted this session, it auto-opens `AvatarPickerDialog` (720px). Saves via `ProfilesService.updateMine({ avatar_pokemon_number })`; snackbars "Avatar actualizado" / error.
- `Navigation` data: `CategoriesService.list({ activeOnly: true })` (table `categories`) and `CardTypesService.list({ activeOnly: true, categoryId })` (table `card_types`) to build Sellado/Accesorios children.
- `ProfilesService.avatarPokemonNumber` (from `profiles`) + `PokemonService.portraitUrlChain(n, mood)` feed `UserAvatar`.

## State & data flow

**UserShell**
- Constants: `HANDSET_QUERY = '(max-width: 719.98px)'`, `NAV_EXPANDED_KEY = 'pokesingles.nav.expanded'` (localStorage, `'1'`/`'0'`, via `LocalStorageService` — SSR-safe, swallow-errors wrapper).
- `isHandset` — `toSignal` of `BreakpointObserver.observe(HANDSET_QUERY)`.
- `railExpanded` (signal, initial from storage; default collapsed), `mobileOpen` (signal).
- Computeds: `navMode` (`'over'` handset / `'side'` desktop), `navOpened` (handset: `mobileOpen()`; desktop: always `true` — the rail changes width, never closes), `navExpanded` (handset drawer is always the full labeled panel).
- `toggleSidenav()` — handset toggles `mobileOpen`; desktop toggles `railExpanded` and persists.
- `@HostListener('document:keydown.escape') onEscape()` — closes mobile drawer, or collapses the desktop rail (persisting `'0'`).
- `onNavOpenedChange(open)` — syncs `mobileOpen` when Material closes the drawer itself (backdrop/Esc in `over` mode).
- Effect: on every `navExpanded()` change, `animateContentReflow()` runs `updateContentMargins()` on the `MatSidenavContainer` every animation frame for 300ms outside the zone — because Material only recomputes content margins on change detection, and the 260ms CSS width transition doesn't trigger it per-frame.
- Router `Scroll` events subscription: closes the mobile drawer after navigation, and scrolls the nested `MatSidenavContent` element to top on fresh navigations (`!e.position && !e.anchor`). The document scroller never scrolls — the real scroll region is inside `mat-sidenav-content`; `withInMemoryScrolling` wouldn't reach it. Anchor scrolling / back-forward restoration are NOT wired.

**Header**
- Signals: `menuOpen`; computed `points` = `loyalty.balance() ?? 0`. `toggleMenu()` lazily calls `loyalty.ensureLoaded()` (errors swallowed) when opening while signed in.
- `onSearch(query)` — trims; if non-empty, logs the search and navigates to `/buscar` with `queryParams: { q }`.
- `signOut()` — closes menu, `auth.signOut()`; snackbar "Sesión cerrada" (2.5s) or the error text (4s, action "OK").

**Navigation**
- Input: `expanded` (required boolean, owned by the shell).
- Signals: `subtypeChildren` (record keyed by `'sellado'`/`'accesorios'`), `hoveredKey`, `flyoutTop`, `flyoutLeft`, `flyoutMaxHeight`, `openSections` (`ReadonlySet<string>` of open accordion keys); `currentUrl` (toSignal of `NavigationEnd` → `router.url`).
- `childActiveOptions: IsActiveMatchOptions = { paths: 'exact', queryParams: 'subset', matrixParams: 'ignored', fragment: 'ignored' }` — a sub-type leaf is active only when path AND `?tipo=` match.
- Active logic is manual, not `routerLinkActive`, for top-level items: `itemMatchesUrl` treats every `/products` item as active only when the URL's `?categoria=` equals the item's (null = "Todo"); other paths use exact or prefix match. Children still use `routerLinkActive`.
- Effect: in expanded mode, auto-opens the accordion section containing the active leaf (never auto-closes).
- Flyout timing: `onParentLeave` closes after an 80ms `setTimeout` (`leaveTimer`, cleared on re-enter and on destroy). `positionFlyout` estimates card height (`CARD_PAD 24` + `HEADER 45` + `36`/row + `SEE_ALL 49`), clamps within a 12px viewport `MARGIN`, and caps the scroll area.
- `onParentClick`: collapsed rail → navigate to the category landing (flyout still offers sub-types); expanded → toggle accordion.
- `subtypeSlug()` strips the category prefix from a `card_type` slug (`sellado-booster-box` → `booster-box`) to build `?tipo=` values; mirrors CardList's function of the same name.

**UserAvatar**
- `step` signal indexes the `sources()` candidate list; `(error)` on the `<img>` advances it (`onError`). An effect resets `step` to 0 whenever the avatar number, current user, or mood changes. `showingPokemon` = `step() < pokemonSources().length`.

## Behaviors & edge cases

- **Responsive**: shell breakpoint 719.98px (rail ↔ over-drawer). The header has its own 599px breakpoint: hides the "Poke-Singles" eyebrow, the search-help button, and the header social icons; shrinks the logo to 48px; search field flexes to fill.
- **Desktop rail default**: collapsed (storage key absent ≠ `'1'`). State survives reload via localStorage.
- **Mobile drawer**: always the full labeled panel; auto-closes after every navigation and via backdrop/Esc.
- **Signed-out header**: person icon opens `LoginDialog`; no coins/account menu. Signed-in: avatar dropdown. Admin additionally sees "Panel admin" (header menu) and "Admin" (nav Cuenta section).
- **Coins chip**: shows `0` while the balance is loading or failed (`balance() ?? 0`) — there is no loading state on the chip.
- **Nav sub-types**: if loading categories/card_types throws, Sellado/Accesorios silently degrade to plain links (no children).
- **Empty search**: whitespace-only queries are ignored (no navigation, no log).
- **Cart badge**: header `.cart-count` and nav badges render only when count > 0.
- **Footer**: fully static; no services, no loading states. `year` computed once at construction.
- **Presence**: every storefront tab counts as one visitor (including signed-in admins browsing the store); nothing is untracked until tab close.

## Gotchas / invariants

- **Header cart icon never navigates** — drawer-only by design; `/cart` is reached from the drawer's "Ver carrito completo", the nav "Carrito" item, or direct URL.
- **Footer does NOT use `SocialIcons`** — it duplicates the same three links inline (`.socials` / `.social-tile`). Changing a social URL requires editing both `src/app/shared/social-icons/social-icons.html` and `src/app/user/footer/footer.html`.
- **Footer links to `/info/metodos-pago-envio`, which is not seeded by any migration** (seeded slugs: `sobre-nosotros`, `estado-de-cartas`, `bienvenida`, plus the renamed `politica-pedidos-envios`). Unless an admin created that page in `/admin/pages`, the link lands on the static-page "Página no encontrada" state.
- **Footer stats are hardcoded marketing copy**, not derived from data.
- **Escape is a document-level listener** on the shell — pressing Esc anywhere (including inside an open Material dialog) also collapses the desktop rail / closes the mobile drawer.
- **`NAV_EXPANDED_KEY` prefix differs** from other storage keys in the app (`pokesingles.nav.expanded` vs e.g. `welcome:dismissed:v1`); there is no single storage-key convention.
- **The 80px header height is load-bearing**: `user-shell.scss` hardcodes `calc(100vh - 80px)`; changing header height requires updating both files.
- **Scroll position is managed manually** on the nested `MatSidenavContent`; adding anchors or expecting back-button scroll restoration will not work without extra wiring.
- **The rail-width reflow loop** (300ms rAF loop calling `updateContentMargins()`) exists because the 260ms width transition is pure CSS; removing either side desynchronizes content margin from the rail.
- **Presence counts admins as visitors** when they browse the storefront (`joinAsVisitor` tracks `role: 'visitor'` unconditionally); the dashboard's `watchOnlineCount` only excludes the watching (non-tracking) admin channel.
- **CLAUDE.md drift**: CLAUDE.md's brand-red rule says `.price--sale` uses brand red, but `src/styles/_brand-utilities.scss` styles `.price--sale` with `var(--accent-amber)`. Not a shell issue per se, but the shell docs inherit the rule — trust the code/theme skill.
- `header.spec.ts` passes since 2026-07-13 (`provideRouter([])` added to its TestBed) — a new failure there IS a regression.

## Related docs

- [dialogs](./dialogs.md) — welcome + card-conditions dialogs opened from this shell/its children
- [cart-drawer](./cart-drawer.md), [cart-page](./cart-page.md)
- [login-dialog](./login-dialog.md)
- [account](./account.md), [account-pokedex](./account-pokedex.md)
- [static-page](./static-page.md) — targets of the nav/footer `/info/*` links
- [maintenance](./maintenance.md) — the guard wrapping this shell
- [../../architecture/routing-and-guards.md](../../architecture/routing-and-guards.md)
- [../../architecture/auth-and-roles.md](../../architecture/auth-and-roles.md)
- [../../architecture/loyalty-and-pokedex.md](../../architecture/loyalty-and-pokedex.md)
- [../../architecture/shared-components.md](../../architecture/shared-components.md)
