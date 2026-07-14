# Add card condition to raffles (form + storefront)

## Context
A raffle prize is a single Pokémon card, so its **condition** (NM / LP / MP / HP / DMG —
what Diego calls the "status of the card") matters to buyers. Today it's missing in two
places:

1. **Admin form** (`add-product`, category = Rifas): the Condición `<mat-select>` is gated
   behind `@if (isCardCategory())`, and `CARD_CATEGORY_SLUGS = ['singles','graded']` —
   `rifas` is excluded, so the field never shows. On submit, `condition` is forced to
   `null` for any non-card category, so even a manually set value wouldn't persist.
2. **Storefront** (`/rifas` → `app-raffle-card`): the `rifas_listing` view doesn't select
   `p.condition`, the `RaffleCardItem` type lacks the field, and the card never renders it.

Outcome: an admin can set a condition when creating/editing a raffle, and shoppers see a
condition pill on the raffle card (matching the product card). Existing raffles with no
condition simply show no pill — nothing breaks.

## Approach
Expose `p.condition` on the `rifas_listing` view (new migration, appended column), thread it
through the `RaffleCardItem` type and `database.types.ts`, and render a condition pill on the
raffle card reusing the global `.condition-pill` classes. In the form, add a dedicated
"Condición" select **inside the existing "Datos de la rifa" section** (rather than widening
`isCardCategory()`, which would also unhide Pokémon/rareza/número/variante and the card-types
panel — not wanted for raffles), and persist `condition` when `isRaffle()`.

## Steps

1. **Migration — add `condition` to `rifas_listing`.**
   New file `supabase/migrations/20260528000100_rifas_listing_condition.sql`. `CREATE OR
   REPLACE VIEW public.rifas_listing …` re-stating the **current** definition from
   `20260525001000_raffle_market_price.sql` verbatim, with `p.condition` appended as the
   last selected column (CREATE OR REPLACE only allows adding columns at the end). Keep
   `with (security_invoker = false)`, the same joins/filters/order, and re-`grant select …
   to anon, authenticated`. Apply with `npm run db:push:dev` (per project workflow — NOT MCP
   apply_migration). Pull current fn/view defs first in case the shared dev DB has drifted.

2. **`RaffleCardItem` type — add the field.**
   `src/app/core/catalog/catalog.types.ts` (interface at ~line 166). Add
   `condition: string | null;` (place it near `card_number` / `set_name`, mirroring the card
   identity fields). `listRaffles()` does `select('*')` + cast, so no service change needed.

3. **`database.types.ts` — add to the generated `rifas_listing` Row.**
   `src/app/core/supabase/database.types.ts` (Row at ~line 1335). Add
   `condition: string | null` to the `rifas_listing.Row` block. (Hand-edit is fine here; a
   full type regen is out of scope and would churn unrelated lines.)

4. **Raffle card — render the condition pill.**
   `src/app/shared/raffle-card/raffle-card.ts`: add a `conditionClass(condition: string |
   null): string` method copied from `product-card.ts:54-63` (returns
   `condition-pill condition-pill--<nm|lp|mp|hp>`).
   `src/app/shared/raffle-card/raffle-card.html`: next to the `metaLine()` block (~line
   20-22), render `@if (raffle().condition) { <span [class]="conditionClass(raffle().condition)">{{ raffle().condition }}</span> }`.
   No new SCSS — `.condition-pill` lives globally in `src/styles/_brand-utilities.scss`.
   (Match how product-card/cart place the pill; keep it on the card identity line.)

5. **Form — show a Condición field for raffles.**
   `src/app/admin/add-product/add-product.html`: inside the `@if (isRaffle())` "Datos de la
   rifa" section (~line 238-258 grid), add a `<mat-form-field>` with
   `<mat-select formControlName="condition" panelClass="admin-form-overlay">` — an empty `—`
   option plus `@for (c of conditions; …)`, identical to the existing card-section control
   (html ~line 162-170). The `condition` form control and `conditions = CONDITION_OPTIONS`
   already exist, so no TS additions for the control itself.

6. **Form — persist condition for raffles on submit.**
   `src/app/admin/add-product/add-product.ts` (~line 517): change
   `condition: isCard ? raw.condition || null : null` to
   `condition: (isCard || this.isRaffle()) ? raw.condition || null : null` so a raffle's
   condition is saved. Verify the create payload (`this.products.create({…})`) is the only
   spot that zeroes condition; the edit-load path already patches the `condition` control
   from the loaded product row, so editing an existing raffle will populate the new select.

## Files to modify / create
- `supabase/migrations/20260528000100_rifas_listing_condition.sql` — **new**; adds `p.condition` to the view.
- `src/app/core/catalog/catalog.types.ts` — add `condition` to `RaffleCardItem`.
- `src/app/core/supabase/database.types.ts` — add `condition` to `rifas_listing.Row`.
- `src/app/shared/raffle-card/raffle-card.ts` — add `conditionClass()`.
- `src/app/shared/raffle-card/raffle-card.html` — render the condition pill.
- `src/app/admin/add-product/add-product.html` — Condición select in the raffle section.
- `src/app/admin/add-product/add-product.ts` — persist `condition` when `isRaffle()`.

## Reused utilities
- `conditionClass()` at `src/app/shared/product-card/product-card.ts:54` — copy into raffle-card (same NM/LP/MP/HP→pill-modifier mapping).
- `CONDITION_OPTIONS` at `src/app/core/catalog/catalog.types.ts:863` — already imported in add-product as `conditions`; drives the new select's options.
- `.condition-pill` / `--nm/--lp/--mp/--hp` classes in `src/styles/_brand-utilities.scss` — global, no new CSS.
- Existing `isRaffle()` computed at `add-product.ts:162` — gates both the new field and the persist branch.

## Verification
1. `npm run db:push:dev` applies the migration cleanly; `select condition from rifas_listing limit 1;` returns the column.
2. `npm test` green (watch the known pre-existing RouterLink `should create` failures — not ours).
3. `npm start` (Diego runs the server on :4242 himself — don't start a parallel one):
   - **Admin:** `/admin/raffles` → "Agregar rifa" → the "Datos de la rifa" section now shows a **Condición** select; pick e.g. LP, fill required fields, save. Re-open that raffle in edit → the select shows LP.
   - **Storefront:** `/rifas` → the raffle card for that prize shows an **LP** condition pill on the identity line; a raffle left at `—` shows no pill.
4. Confirm brand red didn't leak — the condition pills use their own palette, not `#CE1126`.

## Out of scope
- Changing `rifas_listing`'s `security_invoker = false` posture or its active/price filters — pre-existing, leave as-is.
- Widening `isCardCategory()` / `CARD_CATEGORY_SLUGS` to include rifas (would unhide unrelated card fields).
- Adding condition to the admin raffles **table** list (`raffles.ts`/`.html`) or the `admin_raffles_summary` RPC — the request is the form + storefront listing only.
- A full `database.types.ts` regen.
- Backfilling condition on existing raffle products (they stay null → no pill until edited).
