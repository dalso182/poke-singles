# Product detail (/products/:slug)
> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose
The single-product page: a large card image with hover shine, a buy panel (price, stock, quantity stepper, add-to-cart, WhatsApp photo request), a spec grid (condición/idioma/variante/ilustrador), and — for Pokémon cards — a "Detalles de combate" section rendered from the cached TCGdex payload (HP, attacks, abilities, weakness/resistance/retreat, ex/VMAX rules). Trainer/Stadium/Energy cards get an "Efecto" section instead. There is **no related-products rail** and **no reviews** — the page ends at the optional "Notas del vendedor".

## Route & access
- Path: `/products/:slug` → `Detail` (lazy, child of `UserShell`, behind `maintenanceGuard` only — public, no auth guard). Declared in `src/app/app.routes.ts` **after** the plain `/products` route.
- The `:slug` param binds to the component via `withComponentInputBinding()`: `readonly slug = input.required<string>()`.
- No query params, no route data.
- Raffle products (category = `rifas`) have no detail page: if the fetched product's `category_id` equals `ProductsService.raffleCategoryId()`, the component immediately `router.navigate(['/rifas'])`.
- Reached from `<app-product-card>` tiles (grids, home rails, search), cart line links, and order-confirmation item links.

## Files
- `src/app/user/detail/detail.ts` — `Detail` component + local view-model interfaces `TcgdexAttack`, `TcgdexAbility`, `TcgdexTypedValue` (typed mirrors of the TCGdex SDK shapes the template consumes).
- `src/app/user/detail/detail.html` — breadcrumb, not-found, hero (image + buy panel), combat section, effect section, seller notes.
- `src/app/user/detail/detail.scss` — `.hero` (440px/1fr grid, sticky image ≥1100px), `.price-block`/`.price-tick`, `.spec-grid`, `.hp-bar`, `.attack`, responsive breakpoints at 1099/720/520px.
- `src/app/user/detail/detail.spec.ts` — spec (note: listed in memory as one of the pre-existing NG0201 `should create` failures).
- `src/app/shared/pipes/or-dash.pipe.ts` — `OrDashPipe` (`| orDash`): renders `—` (em dash) for null/undefined/`''`/empty array so every field keeps its slot (pre-orders arrive mostly null); pair with `.dash`/`.is-dash` styling.
- `src/app/shared/energy-chip/energy-chip.ts` — `EnergyChip` (`<app-energy-chip [type] [size] [withLabel]>`) + exported helpers `energyTypeColor()`, `energyTypeFg()`, `energyTypeName()` and the `ENERGY_TYPE_META` map (icons under `assets/images/types/{icon}.png`; aliases Dark/Darkness, Electric/Lightning, Steel/Metal).
- `src/app/core/catalog/products.service.ts` — `getBySlug()`, `getCardTypeIds()`, `raffleCategoryId()`.
- `src/app/core/catalog/tcgdex-cards.service.ts` — `TcgdexCardsService.get(cardRef)`.
- `src/app/core/catalog/sets.service.ts`, `card-types.service.ts` — cached list lookups.
- `src/app/core/cart/cart.service.ts` — `CartService.add()`.
- `src/app/core/settings/app-settings.service.ts` — WhatsApp number source.
- `src/app/core/catalog/catalog.types.ts` — `CONDITION_OPTIONS`, `LANGUAGE_OPTIONS`, `VARIANT_OPTIONS`, `ProductRow`, `CardTypeRow`, `SetRow`, `AppSettingsRow`.

## UI anatomy
1. **Breadcrumb** — `.breadcrumb`: home icon (`aria-label="Inicio"`) › "Cartas" (links `/products`) › set name (when loaded) › product name.
2. **Loading** — `<mat-progress-bar mode="indeterminate">` while `loading()`.
3. **Not found** — `.detail-not-found`: "No encontramos esta carta." + stroked button "Volver al catálogo" → `/products`.
4. **Hero** (`.hero`, 2-col grid):
   - **Left** `.card-image-wrap` (sticky at ≥1100px): `.card-image` (aspect 5/7, hover `scale(1.02)` + `.card-image-shine` sweep). `p.image_url` truthy → plain `<img [src]="p.image_url">`; else `.is-placeholder` gradient with "Sin imagen". Below: `.trust-strip` — "Verificación de autenticidad" / "Inspeccionada a mano. Toploader incluido en cartas sobre ₡8,000.".
   - **Right** `.buy-panel`:
     - `.eyebrow` — set name (orDash).
     - `<h1 class="card-name">` — name + `<app-energy-chip [type]="primaryType()" [size]="24">` and a second chip for `p.type2`.
     - `.meta-row` (only if `card_number || rarity || regulation_mark`): `#{{card_number}}/{{set.printed_total}}` · rarity · `REG {{regulation_mark}}` (each orDash).
     - `.tags` — one amber `.tag` pill per assigned card-type (`tags()`).
     - **Price block** `.price-block` topped by `.price-tick` (brand-bar gradient — a sanctioned brand-red use): sale (`sale_price != null && sale_price < price`) → `.price.on-sale` ₡sale + struck `.price-original`; else `.price` ₡price; `price` falsy → `.price--tba` "Precio a consultar". Stock chip: `.stock-dot` `in` (green) / `out` (brand red) + `stockLabel()` — "Agotada" at qty ≤ 0, else "Solo {n} disponible"/"…disponibles". Actions: `.qty-stepper` (aria-labels "Restar"/"Sumar", hidden when qty 0) + `.cta` button `ctaLabel()` — "Añadir al carrito" / disabled "Agotada". Below: `.secondary-btn` "Pedir fotos adicionales" → `whatsappLink()` (new tab, `assets/images/whatsapp-icon.png`).
     - **Spec grid** `.spec-grid` (4 cols, 2 below 720px): "Condición" — value pill classed `condition-pill--nm|--lp|--mp|--hp` (HP **and** DMG share `--hp`), sub-line `conditionSub()` = the descriptive half of `CONDITION_OPTIONS` ("Near Mint", "Lightly Played", …); "Idioma" — `languageLabel()` ("Inglés"/"Español"/"Japonés"); "Variante" — `variantLabel()` ("Normal"/"Holo"/"Reverse Holo"/"1ª edición"/"Promo"); "Ilustrador" — name + link "Más de este ilustrador" → `/buscar?q={illustrator}`.
     - **Service strip** `.service-strip`: "Envío a todo CR" / "Correos o courier · 2-4 días" and "Cambios 7 días" / "Si la condición no calza".
     - **Format legality** `.format-strip` (only when `legal_standard !== null || legal_expanded !== null`): badges "Standard" / "Expanded", `.is-legal` green with check icon, otherwise Danger-red palette (NOT brand red).
5. **"Detalles de combate"** (`.combat`, only when `isPokemon()`):
   - `.hp-bar` — gradient from `--type-color` (via `energyTypeColor(primaryType())`): "HP" value, "Tipo" (chip + `energyTypeName()` + optional `stage` / "evoluciona de {evolveFrom}"), "Pokédex" `#{{dexNumber()}}` + optional `card.suffix`.
   - `.abilities` — eyebrow `a.type`, name, effect.
   - `.attacks` — per attack: cost chips (or `—`), name, effect, `.attack-damage` (value or "Sin daño"). No attacks → `.attack--empty` "Sin ataques registrados".
   - `.combat-row` — "Debilidad" (first weakness only, chip `withLabel` + multiplier colored by type), "Resistencia" (first only), "Costo de retirada" (N Colorless chips from `retreatChips()`).
   - `.rule-callout` per `rules()` entry — "★ Regla" + text.
6. **"Efecto"** — rendered when `(item() || cardEffect()) && !attacks().length` (Trainer/Stadium/Energy, or rare attack-less Pokémon): `item()` → `.effect-box` with item name eyebrow + effect; else plain `cardEffect()` text.
7. **"Notas del vendedor"** — `p.description` when present.

## Services & backend
- `ProductsService.getBySlug(slug)` — direct select on **`products`** by `slug` (`maybeSingle`). RLS `products_public_read` (active ∧ price > 0 ∧ (raffle ∨ quantity > 0)) applies — see Gotchas.
- `ProductsService.raffleCategoryId()` — memoised from `CategoriesService.list()` (**`categories`** table); drives the raffle bounce.
- `TcgdexCardsService.get(product.card_ref)` — **`card_details`** table (source-neutral cache of the TCGdex payload, keyed `card_ref`, written by the admin add-product flow). Skipped when `card_ref` is null.
- `SetsService.list()` — **`sets`** (session-cached signal); the component finds `product.set_id` in the list.
- `CardTypesService.list({ activeOnly: true })` — **`card_types`**; intersected with `ProductsService.getCardTypeIds(product.id)` (**`product_card_types`**) to build `tags()`.
- `AppSettingsService.get()` — **`app_settings`** singleton row, for `whatsapp_number`. Wrapped in `.catch(() => null)` so a settings failure never breaks the page.
- `CartService.add(product.id, qty())` — signed-out: localStorage `cart:v1`; signed-in: **`cart_items`** insert (or update via `setQuantity`). New lines open the cart drawer automatically; errors return a Spanish message shown in a snackbar (4000 ms).

## State & data flow
- Input: `slug` (required, route param).
- Signals: `product: ProductRow | null`, `card: TcgdexCard | null`, `set: SetRow | null`, `tags: CardTypeRow[]`, `settingsRow: AppSettingsRow | null`, `loading` (starts `true`), `notFound`, `qty` (stepper value, starts 1).
- Computeds: `isPokemon` (`(card.category ?? product.category) === 'Pokemon'`), `attacks`, `abilities`, `weaknesses`, `resistances`, `rules`, `item`, `cardEffect`, `weakness`/`resistance` (first entry only — design shows one of each), `retreatChips` (fixed-length array for `@for`), `primaryType` (`product.type1 ?? card.types[0]`), `dexNumber` (`card.dexId[0]`), `whatsappLink` (wa.me URL; number from settings with fallback `'50663452039'`; prefilled text "Hola, quiero más fotos de {name} {set} #{card_number}." URL-encoded).
- Constant maps (private): `LANGUAGES`, `VARIANTS` from the option lists; `CONDITION_SUBS` = label part after `' — '`.
- Flow: `ngOnInit` → `bootstrap()`: `getBySlug` → not found / raffle bounce / set `product`; then **parallel** `Promise.all` of card_details, sets, card_types, product_card_types, app_settings; errors → snackbar (`errorMessage(err)` or "Error desconocido", "OK", 5000 ms); `finally` clears `loading`.
- `incQty(max)` clamps to `p.quantity`; `decQty()` floors at 1. `onAddToCart()` → `cart.add(product.id, qty())`.
- No effects, no URL state beyond the slug; there is no reload trigger — data is fetched once per component instantiation (navigating between two product slugs creates a new instance because the param changes the route, but same-slug re-entry won't refetch).

## Behaviors & edge cases
- **Sold out**: `quantity ≤ 0` → stock dot `out` (brand red), label "Agotada", stepper hidden, CTA disabled reading "Agotada". No AGOTADA image badge on this page (that's the grid tile's `.product-card--sold-out::after`) — in practice anon users can't reach a sold-out non-raffle detail page anyway (RLS hides the row → "No encontramos esta carta.").
- **Missing data** never collapses layout: every field pipes through `orDash` and gets `.is-dash` gray mono styling (pre-orders render with dashes everywhere).
- **No TCGdex cache row** (`card_ref` null or `card_details` miss): combat data falls back to product columns where mirrored (`category`, `type1/type2`), HP/attacks/dex show dashes or the "Sin ataques registrados" empty card.
- **Add-to-cart failure** (stock exceeded etc.): snackbar with the service's Spanish error, e.g. "Solo hay {n} en stock.", "Producto no disponible."
- **Images**: `products.image_url` stores a self-hosted relative path (`/card-images/<serie>/<set>/<localId>.webp`, see `src/app/core/images/card-image-url.ts`) and is bound **directly** to `<img src>` — the browser resolves it against the origin. The `resolveHostedSrc()`/`tcgdexImageToHostedPath()` helpers are used at admin/import time, not here.
- Responsive: hero stacks below 1100px (image un-sticks, max-width 440px); spec grid 2-col and hp-bar stacks below 720px; combat-row stacks below 520px.

## Gotchas / invariants
- **No card-conditions dialog trigger here.** The condition value in the spec grid is a plain div; the "Ver guía de condiciones" modal (`CardConditionsDialogService`) is only wired on `<app-product-card>` and `<app-raffle-card>` pills. If detail should match, it's an intentional add, not a regression fix.
- **RLS shapes "not found"**: `getBySlug` hits `products` directly (not the `products_search` view), so anon/customer sessions get `null` for inactive, unpriced, or sold-out non-raffle products → "No encontramos esta carta.". An **admin session** bypasses via `products_admin_all` and *can* view (and add to cart) inactive/sold-out products here.
- **Raffle bounce is client-side**: raffle rows pass public RLS regardless of quantity, so the explicit `category_id === raffleCategoryId()` check + `/rifas` redirect is the only thing keeping raffles off this page.
- `.stock-dot.out` uses `var(--brand-red)` — outside the sanctioned uses. The current token-file rule (`_brand-tokens.scss`) allows **two** uses (brand-bar gradient, AGOTADA badge); sale prices moved to `--accent-amber`, so this file's `.price-tick` and `.price.on-sale` brand-red usages (commented in-file as "allowed (sale price)") are stale against the token file too — see the stragglers list in [Theming](../../architecture/theming.md). CLAUDE.md's "three uses incl. `.price--sale`" is likewise stale.
- `AppSettingsService.get()` is the **always-fresh** read (the 60 s-TTL cache is `load()`), so every detail visit re-fetches `app_settings` just for the WhatsApp number.
- The drawer only opens for **new** cart lines: `CartService.add()` routes an existing line through `setQuantity()`, which doesn't call `openDrawer()`. Pressing "Añadir al carrito" twice gives no visible feedback the second time (no snackbar, no drawer).
- `qty()` is clamped against the stock at click time via the stepper, but never re-clamped if the product data were refreshed; `CartService` re-validates against `stock` anyway.
- Attacks/abilities are tracked by `name` in `@for` — a card with two identically-named attacks would collide (TCGdex data makes this unlikely but not impossible).
- Only the **first** weakness/resistance is displayed (`weakness()`/`resistance()`), and only `dexId[0]` — deliberate design choices, not data loss bugs.
- `isPokemon()` prefers the TCGdex `card.category` and falls back to `ProductRow.category` (mirrored at import) so a transient `card_details` miss doesn't hide the combat section; pre-orders (both null) hide it.
- The CTA hover color `#172e6e` is a hardcoded brand-blue-dark (in-file comment: "no token yet").

## Related docs
- [Card list](./card-list.md)
- [Search results](./search-results.md)
- [Cart drawer](./cart-drawer.md)
- [Rifas](./rifas.md)
- [Dialogs](./dialogs.md)
- [Shared components](../../architecture/shared-components.md)
- [Data model](../../architecture/data-model.md)
- [Routing & guards](../../architecture/routing-and-guards.md)
