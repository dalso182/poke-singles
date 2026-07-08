# Account page (/account)

> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose

The signed-in customer's self-service hub: a sticky profile rail (avatar, name, email, member-since chip) plus one content panel at a time — personal data, shipping address, order history, Poke-Monedas (loyalty) balance + ledger, and the Pokédex. Only one panel renders at a time so page height stays flat regardless of how long the order/points ledgers grow. Profile state is shared with the header through `ProfilesService` / `LoyaltyService` signals, so edits here update the site chrome instantly.

## Route & access

- Paths (all lazy-load the same `Account` component, all behind `customerGuard`):
  - `/account` → Datos panel (default)
  - `/account/direccion` → route data `{ initialView: 'direccion' }`
  - `/account/pedidos` → `{ initialView: 'pedidos' }`
  - `/account/puntos` → `{ initialView: 'puntos' }`
  - `/account/pokedex` → `{ initialView: 'pokedex' }`
- Defined in `src/app/app.routes.ts` under the empty-path `UserShell` branch (also gated by `maintenanceGuard` at the shell level). `initialView` binds via `withComponentInputBinding()` (enabled in `src/app/app.config.ts`).
- `customerGuard` (`src/app/core/auth/customer.guard.ts`): awaits `AuthService.ready`, allows if signed in; otherwise lazy-opens `LoginDialog` (panelClass `login-dialog-panel`) and returns a `UrlTree` to `/`. No returnUrl — after logging in the user is not bounced back to `/account`.
- Entry points:
  - Header account dropdown (`src/app/user/header/header.html`): "Mi cuenta" → `/account`; the Poke-Coins chip → `/account/puntos`; "Canjear" → `/account/pokedex`.
  - Mobile navigation drawer (`src/app/user/navigation/navigation.ts`): "Mi cuenta" → `/account`.
  - Footer "Mi cuenta" column (`src/app/user/footer/footer.ts`): "Mi cuenta" → `/account`, "Mis órdenes" → `/account/pedidos`.
  - Order confirmation (`src/app/user/order-confirmation/order-confirmation.html`): "Ver mis pedidos →" → `/account/pedidos` (only when signed in).

## Files

- `src/app/user/account/account.ts` — `Account` component: view switcher, both forms, orders + points paging/filtering, sign-out.
- `src/app/user/account/account.html` — rail + `@switch (view())` panel template.
- `src/app/user/account/account.scss` — `.account__*`, `.acc-*` styles; scoped navy literals (`$navy = var(--mat-sys-primary, #1e3a8a)`, `$navy-dark: #172e6e`, `$blue-soft: #e8edf8`).
- `src/app/user/account/avatar-picker/avatar-picker.service.ts` — `AvatarPickerService`: opens the picker + persists the choice; also the post-login onboarding auto-prompt (activated by `UserShell`).
- `src/app/user/account/avatar-picker/avatar-picker-dialog.{ts,html,scss}` — `AvatarPickerDialog`: searchable, infinite-scroll grid of all ~1,025 Pokémon.
- `src/app/user/account/pokedex/*` — Pokédex panel (own doc: [account-pokedex.md](./account-pokedex.md)).
- `src/app/core/auth/profiles.service.ts` — `ProfilesService`: reactive profile cache + `profiles` table reads/writes.
- `src/app/core/orders/orders.service.ts` — `OrdersService.getMyOrders()` (customer slice; file also holds checkout + admin methods).
- `src/app/core/loyalty/loyalty.service.ts` — `LoyaltyService`: shared balance signal, ledger history, `openPokeball`.
- `src/app/core/auth/auth.service.ts` — session signals, `signOut()`.
- `src/app/shared/user-avatar/user-avatar.ts` — `<app-user-avatar>` (Pokémon mood portrait → Google photo → initials).
- `src/app/shared/load-more/load-more.ts` — `<app-load-more>` "Cargar más" button.
- `src/app/shared/table/controls/date-range/date-range.ts` — `<app-date-range>` filter (two-way `start`/`end` as `YYYY-MM-DD` or null).
- `src/app/shared/validators/name.validator.ts`, `phone.validator.ts` — `nameValidator()` (letters/spaces/dots, unicode), `phoneValidator()` (exactly 8 digits).

## UI anatomy

Top to bottom (`.account`):

1. **Header** (`.account__header`): eyebrow "Cuenta", `<h1>` "Mi cuenta". Indeterminate `<mat-progress-bar>` while `loading()`.
2. **Two-column layout** (`.account__layout`, `280px + 1fr`, single column ≤900px):
   - **Rail** (`.account__rail` sticky / `.acc-rail-card` with `.brand-bar` gradient strip):
     - `.acc-identity`: avatar button (`.acc-avatar`, opens picker, `aria-label` "Cambiar Pokémon") wrapping `<app-user-avatar [maxInitials]="1">`; underlined link "Cambiar Pokémon" (`.acc-avatar-link`); `displayName()`; email; `.acc-since` chip "Cliente desde {{ created_at | date: 'MMM y' }}".
     - `.acc-nav` items (anchor + icon): "Datos personales" (person), "Dirección de envío" (place), "Mis pedidos" (shopping_bag), "Poke-Monedas" (coin image `assets/images/coin-sm.png`), "Mi Pokédex" (catching_pokemon). Active item gets `.is-active` ($blue-soft bg, navy text).
     - `.acc-rail-foot`: "Cerrar sesión" button (`.acc-logout`, Danger red `--danger`, never brand red).
   - **Content** (`.account__content #contentEl`), `@switch (view())`:
     - **`datos`** — form `personalForm` in `.acc-panel`: head "Datos personales" / "Usamos estos datos para confirmar pedidos y coordinar el SINPE." Fields: "Correo" (disabled, lock suffix, hint "Para cambiar tu correo, contáctanos."), "Nombre" (`full_name`, error "Solo se permiten letras y puntos."), "Teléfono" (`phone`, `maxlength="8"`, error "El teléfono debe tener 8 dígitos."). Submit `.acc-save-btn`: "Guardar cambios" / "Guardando…", disabled while invalid/pristine/saving.
     - **`direccion`** — form `addressForm`: head "Dirección de envío" / "Se usa para pre-llenar el checkout. Puedes editarla en cualquier pedido." Fields: "Dirección (línea 1)", "Línea 2 (opcional)", "Cantón / ciudad", "Provincia" (`mat-select`, empty option "— Selecciona —", the 7 `provinces`: San José, Alajuela, Cartago, Heredia, Guanacaste, Puntarenas, Limón), "Notas para el repartidor (opcional)" (textarea). Same save button.
     - **`pedidos`** — head "Mis pedidos" / "Historial de compras y estado de cada envío.", plus "{{ ordersTotal() }} pedidos" badge when > 0. `<app-date-range>` filter (`.acc-filter`, shown when `ordersTotal() > 0 || ordersFiltered()`). Empty copy: "No hay pedidos en ese rango de fechas." (filtered) / "Aún no has hecho un pedido." Otherwise `.acc-order` rows — each an `<a>` to `['/checkout/confirmation', order.id]` with `queryParams: { email: order.customer_email }` — showing `#{{ order_number }}`, status pill `.order-status order-status--{status}` (pill styles live in `_brand-utilities.scss`), date (`mediumDate`), total `₡{{ total | number: '1.0-0' }}`, chevron. `<app-load-more>` while `ordersHasMore()`.
     - **`puntos`** — head "Poke-Monedas" / "Ganas Poke-Monedas con cada compra confirmada." Hero (`.acc-points-hero`, amber gradient; `--negative` modifier turns the figure Danger red) with coin image + balance. Same date-range filter pattern. Empty copy: "No hay movimientos en ese rango de fechas." / "Aún no tienes movimientos de Poke-Monedas." Ledger under "Historial" label: `.acc-points-row` with sparkle icon (`auto_awesome`; `--negative` variant), `pointsLabel(tx)`, date, signed amount (`+` prefix for positives; negatives Danger red). `<app-load-more>` while `pointsHasMore()`.
     - **`pokedex`** — `@defer (when view() === 'pokedex')` renders `<app-pokedex (coinsSpent)="onCoinsSpent()" />` (placeholder: progress bar). See [account-pokedex.md](./account-pokedex.md).
3. **Avatar picker dialog** (opened from the rail, width 720px / maxWidth 95vw / maxHeight 85vh): title "Elige tu poke favorito", search field (placeholder "Buscar por nombre o número…", clear button aria "Limpiar búsqueda"), tile grid with dex-number placeholder behind each portrait, empty copy "No encontramos ningún Pokémon con “{{ searchControl.value }}”.", footer "{{ filtered().length }} Pokémon" + "Cancelar". Infinite scroll grows by `PAGE = 60` tiles via an `IntersectionObserver` on a bottom `#sentinel` (root = closest `mat-dialog-content`, `rootMargin: '300px'`). Search matches display name (accent-insensitive `normalize()`) or dex number. Clicking a tile closes the dialog with that number.

## Services & backend

- `ProfilesService` → `profiles` table (RLS self-only; explicit `eq('id', user.id)` filter):
  - `ensureLoaded()` on bootstrap; `profile` readonly signal; `avatarPokemonNumber` computed.
  - `updateMine(patch: ProfileUpdate)` — `savePersonal()` sends `{ full_name, phone }`; `saveAddress()` sends `{ default_shipping_address }` (`ShippingAddress` object or `null`); avatar save sends `{ avatar_pokemon_number }`.
  - Self-heals a missing profile row (INSERT `{ id, full_name }` from session metadata) if `handle_new_user` never fired.
  - Column-level grants (migration `20260704000000_pokeball_redemption.sql`): clients may only UPDATE/INSERT `full_name`, `phone`, `default_shipping_address`, `avatar_pokemon_number` (+ `id` on insert). `caught_pokemon_numbers` is server-only.
- `OrdersService.getMyOrders({ limit, offset, from, to })` → `orders` table, RLS-scoped to own rows, `select('*', { count: 'exact' })`, newest-first, `.range()` paging, `.gte/.lte('created_at', …)` when a date bound is set. Returns `{ rows: OrderRow[], total }`; `total` reflects the filtered set.
- `LoyaltyService` → `loyalty_transactions` table (RLS `loyalty_self_read`):
  - `balance` shared readonly signal (null = signed out/not loaded); `ensureLoaded()` / `refresh()`; `getMyBalance()` is a client-side SUM of all `amount` rows (can be negative).
  - `getMyHistory({ limit, offset, from, to })` — same paging/count/filter idiom as orders. Rows are `LoyaltyTransactionRow` (`kind`: `'earn' | 'reversal' | 'adjust' | 'redeem'`).
- `AuthService` — `currentUser` signal (undefined = hydrating, null = signed out), `ready` promise, `signOut()`.
- `AvatarPickerService.openAndSave(current)` — opens `AvatarPickerDialog`, persists a changed pick via `profiles.updateMine`, snackbars "Avatar actualizado".
- No RPCs are called directly by this page (the Pokéball spend inside the Pokédex panel calls `open_pokeball` — see the Pokédex doc).

## State & data flow

- Constants: `ORDERS_PAGE_SIZE = 10`, `POINTS_PAGE_SIZE = 20`.
- Router input: `initialView = input<AccountView | undefined>()` where `AccountView = 'datos' | 'direccion' | 'pedidos' | 'puntos' | 'pokedex'`. Read once in `ngOnInit` as `this.initialView() ?? 'datos'` (the `?? 'datos'` guards the known `withComponentInputBinding` footgun where routes without the data key bind `undefined` over the default).
- View: `view = signal<AccountView>('datos')`. `select(view)` sets the signal and `Location.replaceState()`s the URL (`/account` for datos, `/account/{view}` otherwise) — deliberately **not** a router navigation, which would recreate the component and re-run the bootstrap fetches. On mobile (`matchMedia('(max-width: 900px)')`) it `afterNextRender`-scrolls `#contentEl` (`viewChild contentEl`) into view.
- Profile: `profile = this.profiles.profile` (shared signal); `email` computed from `auth.currentUser()?.email`; `displayName` computed = trimmed `full_name` → email local part → `'Cliente'`.
- Orders: `myOrders` signal, `ordersTotal`, `ordersLoadingMore`, `ordersHasMore` computed (`length < total`), date filter `ordersFrom`/`ordersTo` (local `YYYY-MM-DD` strings from `app-date-range`), `ordersFiltered` computed. `dayBounds()` converts local calendar days to inclusive UTC instants (`T00:00:00` → ISO, `T23:59:59.999` → ISO) so "hoy" means the customer's day. `reloadOrders()` restarts from page one on filter change; `loadMoreOrders()` appends the next page.
- Points: mirror set — `points` computed from `loyalty.balance() ?? 0`, `pointsHistory`, `pointsTotal`, `pointsLoadingMore`, `pointsHasMore`, `pointsFrom`/`pointsTo`, `pointsFiltered`, `reloadPoints()`, `loadMorePoints()`.
- Forms: `personalForm` (`full_name` + `nameValidator()`, `phone` + `phoneValidator()`), `addressForm` (`line1`, `line2`, `city`, `province`, `address_notes`; no validators). Independent so each section saves separately; both `markAsPristine()` after bootstrap patch and after save.
- Save flags: `savingPersonal`, `savingAddress`, plus page-level `loading`.
- Bootstrap (`ngOnInit` → `bootstrap()`): awaits `auth.ready`, then `Promise.all` of `profiles.ensureLoaded()`, `orders.getMyOrders({ limit: 10 })` (`.catch` → empty), `loyalty.ensureLoaded()` (`.catch` → 0), `loyalty.getMyHistory({ limit: 20 })` (`.catch` → empty). Patches both forms from the profile / `default_shipping_address`.
- Sign-out reactivity: a constructor `effect` navigates to `/` the instant `auth.currentUser() === null` (covers logout from the header menu or another tab — Supabase broadcasts `SIGNED_OUT`); destroying the component clears all loaded PII. `undefined` (still hydrating) is skipped.
- Pokéball feedback loop: `Pokedex` emits `coinsSpent` after the modal closes having opened ≥1 ball → `onCoinsSpent()` re-fetches page one of the points history (keeping the active date filter) so the new `'redeem'` row is on top; the balance signal itself was already updated by `LoyaltyService.openPokeball`. Failures here are swallowed (non-critical).
- Labels: `statusLabel()` maps order status → "Pendiente de pago" / "Pagado" / "Enviado" / "Completado" / "Cancelado". `pointsLabel(tx)` prefers `tx.description`, else by kind: "Puntos ganados" (earn), "Puntos revertidos" (reversal), "Ajuste" (adjust), "Poke-Monedas canjeadas" (redeem). `shortRef(orderNumber)` → `#N`.
- Errors: `errorMessage(err)` extracts `.message` else "Error desconocido"; surfaced via `MatSnackBar` ("OK", 5000 ms; success toasts "Datos actualizados" / "Dirección actualizada" at 3000 ms; "Sesión cerrada" 2500 ms).
- Avatar picker auto-prompt (in `AvatarPickerService`, activated by `UserShell` injecting it): a browser-only `effect` keyed off `auth.signedInTick()` opens the picker once per fresh login when the user is not admin, has `avatar_pokemon_number == null`, and hasn't been prompted this session (`promptedUsers` set, `lastHandledTick`). Waits for the correct user's profile before deciding; opens via `untracked()`.

## Behaviors & edge cases

- Hard refresh: `customerGuard` and `bootstrap()` both await `auth.ready` so RLS-scoped reads don't come back empty before the session hydrates.
- Orders/points fetch failures during bootstrap degrade to empty lists (each has a `.catch` fallback); a profile fetch failure throws to the snackbar.
- The date-range filter row stays rendered while a filter is active even with 0 matches so it can always be cleared; hidden only for customers with no rows at all.
- `saveAddress()` persists a `ShippingAddress` only when `line1`, `city`, and `province` are all filled; anything less writes `null` to `default_shipping_address` (a partial address would be rejected at checkout anyway). `line2`/`notes` empty-string → `null`.
- Negative points balance is legitimate (a reversal clawing back already-spent points); `.acc-points-hero--negative` styles it Danger red.
- Order rows deep-link to the confirmation page with `?email=` so the guest-lookup path (`get_guest_order`) works even if the session hiccups; signed-in users get the direct RLS fetch there.
- Panel switching is `replaceState`-only, so browser Back after switching panels leaves the page (it never pushed history entries) — but each panel URL is refresh/deep-link safe because it has a real route.
- `savePersonal`/`saveAddress` guard re-entry (`invalid || saving`).

## Gotchas / invariants

- **Leftover debug log**: `console.debug('[account] profile fetched', profile)` in `bootstrap()` (account.ts:217) ships to production consoles.
- **`initialView` is read only in `ngOnInit`** — the component doesn't react to later input changes. Fine today (each `/account/*` path is a distinct route config, so Angular recreates the component on router navigation between them), but a route-config merge would break panel deep-linking silently.
- **`select()` bypasses the router** (`Location.replaceState`), so the Router's internal state still believes it's on the original URL; a subsequent relative navigation or `routerLinkActive` elsewhere may not match the visible panel. Intentional trade-off to avoid re-fetch on panel switch.
- **Silent partial-address discard**: entering only a city and hitting save shows "Dirección actualizada" while actually writing `null` — no warning that the partial input was dropped.
- **Rail nav items are `<a>` without `href`/`routerLink`** (click handlers only) — not keyboard-focusable / no native link semantics.
- **`ordersHasMore` trusts `total`**: both use the filtered count, consistent — but appending pages while the date filter changes mid-flight is unguarded (last write wins; `reloadOrders` and `loadMoreOrders` share `ordersLoadingMore` so the button path is safe, the `(startChange)`/`(endChange)` reload path is not).
- **Balance vs. history can disagree briefly**: the hero figure comes from the shared `balance` signal (updated instantly by `open_pokeball`'s `new_balance`), while the ledger list refreshes separately via `onCoinsSpent()`.
- Brand-red rule respected: logout + negative amounts use `--danger`, never `#CE1126`.
- CLAUDE.md drift: its "Out of scope right now" list still includes "Customer order history" — the Pedidos panel implements it (uncommitted working-tree state as of 2026-07-06). CLAUDE.md's route table also omits the four `/account/*` deep-link routes.
- `provinces` is the source of truth for the dropdown; the value stored is the display string (e.g. `"San José"`, accented).

## Related docs

- [account-pokedex.md](./account-pokedex.md) — the Pokédex panel + Pokéball redemption modal.
- [login-dialog.md](./login-dialog.md) — what `customerGuard` opens for signed-out visitors.
- [order-confirmation.md](./order-confirmation.md) — target of each order row link.
- [checkout.md](./checkout.md) — consumes `default_shipping_address` for prefill.
- [shell-header-footer.md](./shell-header-footer.md) — header dropdown / footer links into this page.
- [../../architecture/routing-and-guards.md](../../architecture/routing-and-guards.md) — `customerGuard`, `withComponentInputBinding`.
- [../../architecture/loyalty-and-pokedex.md](../../architecture/loyalty-and-pokedex.md) — loyalty ledger + economy.
- [../../architecture/data-model.md](../../architecture/data-model.md) — `profiles`, `orders`, `loyalty_transactions`.
