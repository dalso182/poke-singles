# Admin — Store configuration (Configuración)

> Part of the Poke-Singles docs set. Verified against source on 2026-07-20. Load together with /CLAUDE.md.

## Purpose

Single admin form that edits the `app_settings` singleton row — the store-wide knobs: USD→CRC exchange rate, SINPE/transfer payment details, order-notification recipients, the weekly price-review parameters, loyalty-points settings, and maintenance mode. Plus a one-off "Operaciones" action that imports the full TCGdex set catalog.

## Route & access

- **Path:** `/admin/config` (lazy `loadComponent` in `src/app/app.routes.ts` → `AdminConfig`).
- **Guards:** `adminGuard` on the `/admin` parent (`canActivate` + `canActivateChild`).
- **Backend enforcement:** `app_settings` RLS allows public `SELECT` (anon + authenticated) but `UPDATE` only when `is_admin()` (policies `app_settings_public_read` / `app_settings_admin_update`). There is no INSERT path — the singleton is seeded by migration and the PK constraint blocks a second row.

## Files

| File | Role |
|---|---|
| `src/app/admin/config/config.ts` | `AdminConfig` component (`selector: 'app-admin-config'`) — reactive form, save, maintenance-image picker, TCGdex import |
| `src/app/admin/config/config.html` | Template: page header + six `<app-form-section>`s + Operaciones panel |
| `src/app/admin/config/config.scss` | `.admin-config` (max-width 800px), `__form`, `__hint`, `__actions`, `__advanced`, `__op`, `__op-text`, `.muted` |
| `src/app/core/settings/app-settings.service.ts` | `AppSettingsService` — cached singleton read + update |
| `src/app/core/catalog/catalog.types.ts` | `AppSettingsRow`, `AppSettingsUpdate` (lines ~974–1014) |
| `supabase/migrations/20260502002700_app_settings.sql` | Table, singleton trick, RLS, seed |
| `supabase/migrations/20260508000700_app_settings_payment_fields.sql` | Payment display fields |
| `supabase/migrations/20260509000500_app_settings_order_emails.sql` | `order_notification_recipients` |
| `supabase/migrations/20260525003500_price_review.sql` | Price-review settings columns (+ queue schema/RPCs) |
| `supabase/migrations/20260525003600_price_review_cron.sql` | Weekly pg_cron job that honors `price_review_enabled` |
| `supabase/migrations/20260528000000_loyalty_points.sql` | Loyalty settings columns (+ ledger/trigger/report RPC) |
| `supabase/migrations/20260704000000_pokeball_redemption.sql` | `pokeball_tiers` column (NOT surfaced on this screen) |
| `supabase/migrations/20260720000000_app_settings_maintenance_image.sql` | `maintenance_image_url` column |

## UI anatomy

1. **`<app-page-header>`** — kicker `"Administración"`, title `"Configuración"`, sub `"Valores globales de la tienda. Los cambios se aplican a clientes y al panel en cuanto se guardan."`
2. **`<mat-progress-bar mode="indeterminate">`** while `loading()`.
3. **`<form [formGroup]="form">`** (`.admin-config__form`) with six `<app-form-section>`s, each with a `.muted.admin-config__hint` intro paragraph and an `<app-form-grid [cols]="2">`:
   - **"Tipo de cambio"** — hint `"Colones por dólar (USD → CRC). Se usará para mostrar precios y/o calcular conversiones cuando lo conectemos."`; one mono outline field **"CRC por 1 USD"** (`exchange_rate_usd_crc`, `type=number`, `min=0`, `step=0.01`, placeholder `510.00`, suffix `CRC`).
   - **"Datos de pago"** — hint `"Estos datos se muestran al cliente en la pantalla de confirmación de pedido cuando paga por SINPE Móvil o transferencia bancaria."`; fields **"Número SINPE Móvil"** (`sinpe_phone`, `type=tel`, placeholder `+506 6345-2039`), **"Número de WhatsApp para comprobantes"** (`whatsapp_number`, hint `"Solo dígitos, con código de país (sin + ni espacios)."`, placeholder `50663452039`), and a span-2 textarea **"Datos para transferencia bancaria"** (`bank_account_info`, rows 4, multi-line bank placeholder).
   - **"Notificaciones de pedidos"** — hint `"Cuando un cliente realiza un pedido, se envía un correo a estas direcciones (separadas por coma) además del correo de confirmación al cliente. Dejar vacío para no notificar."`; span-2 textarea **"Destinatarios"** (`order_notification_recipients`, rows 2, placeholder `ventas@poke-singles.com, diego@poke-singles.com`).
   - **"Revisión de precios"** — hint explains scope: only **singles en NM (Near Mint)** with price ≥ floor are reviewed against TCGplayer market (always NM) converted with the exchange rate; deviations above the threshold in *either direction* land in the *Revisión de precios* queue; weekly auto-run + manual trigger from that screen. Controls: `<app-labeled-toggle formControlName="price_review_enabled">` `"Activar revisión semanal"` (span 2), **"Umbral de desviación"** (`price_review_threshold_pct`, `min=0.01`, `max=100`, `step=0.5`, suffix `%`), **"Piso de valor"** (`price_review_floor_crc`, `min=0`, `step=500`, prefix `₡`).
   - **"Puntos de fidelidad"** — hint: orders award points when they reach **Pagado**, computed on net merchandise (subtotal − discount, *sin incluir el envío*); paid-then-cancelled orders get reversed; `"La canasta de canje de puntos llegará en una fase posterior."` Controls: `<app-labeled-toggle formControlName="loyalty_enabled">` `"Activar puntos de fidelidad"` (span 2), **"Colones por punto"** (`loyalty_colones_per_point`, `min=1`, `step=100`, prefix `₡`, hint `"1 punto por cada ₡1000 gastados (sin envío)."`).
   - **"Modo mantenimiento"** — hint `"Cuando esté activo, la tienda mostrará un mensaje y no aceptará pedidos. La lógica del frontend se conectará después."`; `<app-labeled-toggle formControlName="maintenance_mode">` `"Activar modo mantenimiento"` (span 2), span-2 textarea **"Mensaje a mostrar"** (`maintenance_message`, rows 3, placeholder `"Estamos actualizando el inventario, volvemos en un rato."`), and — only when `imagePickerEnabled` — a span-2 `.admin-config__image-row`: thumbnail preview (`.admin-config__thumb`, max 96×220 px) + ghost `"Quitar"` when an image is set, subtle `<app-btn>` `"Elegir imagen"` / `"Cambiar imagen"` opening `ImagePickerDialog` with `data: { startPath: 'maintenance' }`, and hint `"Opcional: se muestra en la página de mantenimiento en lugar del ícono."`
4. **`.admin-config__actions`** — `<app-btn variant="primary">` `"Guardar cambios"`, disabled when `form.invalid || form.pristine || saving() || loading()`.
5. **"Operaciones"** section (`.admin-config__advanced`, outside the form) — `.admin-config__op` row: bold title `"Importar histórico de sets de TCGdex"`, explanatory hint (one-time, safe to re-run, never overwrites existing sets), and a ghost `<app-btn>` with `<mat-icon>cloud_download</mat-icon>` labeled `"Importar"` / `"Importando…"`; an indeterminate progress bar shows while `importing()`.

## Services & backend

### `AppSettingsService` (`src/app/core/settings/app-settings.service.ts`)

- `get()` — always-fresh read (used by this screen; also by `ReportsService.runPriceReviewNow`). Fetches `app_settings` where `id = true` via `.single()` and refreshes the cache.
- `load(maxAgeMs = 60_000)` — cached read with a 60 s TTL; concurrent callers share one in-flight promise. Used by the maintenance guard, order confirmation, product detail, pokeball dialog.
- `getMaintenance()` — `{ on: !!maintenance_mode, message: maintenance_message, imageUrl: maintenance_image_url }` from the cached row (drives `maintenanceGuard` + the `/maintenance` screen).
- `update(patch: AppSettingsUpdate)` — `UPDATE … WHERE id = true`, returns the row and re-primes the cache.

### `app_settings` — every column, with its migration

Singleton enforcement: `id boolean primary key default true check (id)` — only `true` is legal, so a second row conflicts on the PK. `updated_at` is maintained by trigger `app_settings_set_updated_at` (`tg_set_updated_at()`).

| Key | Type / default | Added by | Consumed by |
|---|---|---|---|
| `exchange_rate_usd_crc` | `numeric(12,4)`, nullable | `20260502002700_app_settings.sql` | Price-review runs (market USD → CRC); add-product suggested pricing (`add-product.ts`) |
| `maintenance_mode` | `boolean not null default false` | `20260502002700` | `maintenanceGuard` (`src/app/core/auth/maintenance.guard.ts`) + `/maintenance` screen |
| `maintenance_message` | `text`, nullable | `20260502002700` | `/maintenance` screen (`src/app/maintenance/maintenance.ts`) |
| `maintenance_image_url` | `text`, nullable | `20260720000000_app_settings_maintenance_image.sql` | `/maintenance` screen — root-relative `/card-images/maintenance/…` path shown in place of the wrench icon |
| `sinpe_phone` | `text`, nullable | `20260508000700_app_settings_payment_fields.sql` | Order-confirmation payment instructions; `send-order-email` edge fn |
| `whatsapp_number` | `text`, nullable | `20260508000700` | Order confirmation + product detail `wa.me` links (both fall back to `'50663452039'` when unset); `send-order-email` |
| `bank_account_info` | `text`, nullable | `20260508000700` | Order confirmation transfer block; `send-order-email` |
| `order_notification_recipients` | `text not null default ''` | `20260509000500_app_settings_order_emails.sql` | Edge fns `send-order-email`, `send-signup-email`, `send-raffle-result` (comma-separated; garbage entries dropped server-side; empty = no admin notifications) |
| `price_review_threshold_pct` | `numeric(5,2) not null default 10.00`, check `> 0 and <= 100` | `20260525003500_price_review.sql` | `admin_record_price_check` comparisons (manual runner + `price-check` edge fn) |
| `price_review_floor_crc` | `numeric(12,2) not null default 5000.00`, check `>= 0` | `20260525003500` | Qualifying-product filter (`price >= floor`) |
| `price_review_enabled` | `boolean not null default true` | `20260525003500` | Gate in `ReportsService.runPriceReviewNow` (throws `PRICE_REVIEW_DISABLED`) and inside the `price-check-weekly` pg_cron body (`20260525003600`, Monday `0 10 * * 1` UTC = 04:00 CR) — flipping it off disables cron without unscheduling |
| `loyalty_enabled` | `boolean not null default false` | `20260528000000_loyalty_points.sql` | `award_or_reverse_loyalty_points()` trigger (awards gated; **reversals run regardless**) |
| `loyalty_colones_per_point` | `numeric(12,2) not null default 1000` | `20260528000000` | Same trigger: `floor((subtotal − discount) / per_point)` points on pending→paid |
| `pokeball_tiers` | `jsonb not null`, default 4-tier array (`poke`/1→1, `super`/2→3, `ultra`/3→5, `master`/4→10) | `20260704000000_pokeball_redemption.sql` | `open_pokeball()` RPC + the account Pokédex pokeball dialog. **Not editable from this screen** — tune by updating the row directly |
| `updated_at` | `timestamptz not null default now()` | `20260502002700` | trigger-maintained |

### Maintenance tester whitelist (`maintenance_testers` table)

Not an `app_settings` column on purpose: that row is anon-readable (`using (true)`) and
read with `select('*')`, so emails there would leak to every visitor. Instead
`20260723000000_maintenance_testers.sql` adds a table (`email` PK) with a single
admin-only RLS policy (no anon visibility) and a `security definer` RPC
`maintenance_bypass_allowed()` → `is_admin() OR lower(jwt email) ∈ whitelist`.

- Edited here via the "Accesos de prueba" comma-separated textarea in the maintenance
  section (mirrors `order_notification_recipients` UX). Saved only when dirty —
  `AppSettingsService.setMaintenanceTesters()` replaces the whole list (filtered delete
  for pg-safeupdate, normalized: trim/lowercase/dedupe).
- Consumed by `maintenanceGuard`: signed-in non-admins get one RPC call, memoized per
  user id (`canBypassMaintenance()`), so whitelist edits apply to a tester's *next*
  session/refresh, not mid-session.
- Tester entrance on `/mantenimiento`: a near-invisible dot pinned bottom-right opens the
  shared `LoginDialog`; after close, if signed in, it navigates `/` and the guard decides.
- Testers are NOT admins: `/admin` still bounces them (`adminGuard` role check).

### TCGdex set import

`onImportTcgdexSets()` → `confirm()` with the verbatim prompt `"Importar todos los sets de TCGdex que aún no existen en la base. Esta operación es típicamente de una sola vez. ¿Continuar?"` → `SetsService.syncFromTcgdex()` (`src/app/core/catalog/sets.service.ts`), which lists every TCGdex set and inserts those whose `code` isn't in `sets` (never overwrites; skips `EXCLUDED_SERIES` = TCG Pocket; swallows per-set errors). Returns `{ added, backfilled, skipped, failed, excluded }`, summarized in a snackbar joined with `' · '`: `"N sets agregados"`, plus conditionally `"N totales completados"`, `"N ya existían"`, `"N excluidos (TCG Pocket)"`, `"N fallaron"` (duration 6000 ms).

## State & data flow

- Signals: `current = signal<AppSettingsRow | null>(null)`, `loading`, `saving`, `importing` (boolean signals, default false), `maintenanceImageUrl = signal<string | null>(null)` (the picked image — NOT a form control; announcement-edit pattern), plus `imagePickerEnabled = imageBrowser.isEnabled()` gating the image row.
- `form` — `fb.nonNullable.group` with controls exactly matching the 12 form-editable keys (`maintenance_image_url` is the 13th editable key, carried by the signal). Validators: `exchange_rate_usd_crc` `min(0)`; `price_review_threshold_pct` `required, min(0.01), max(100)` (initial 10); `price_review_floor_crc` `required, min(0)` (initial 5000); `loyalty_colones_per_point` `required, min(1)` (initial 1000).
- Constructor calls `bootstrap()`: `settings.get()` → `current.set(row)` → `maintenanceImageUrl.set(row.maintenance_image_url)` → `form.patchValue(...)` (nullables coalesced to `''`) → `form.markAsPristine()`. Errors snackbar (`'Error desconocido'` fallback, `'OK'`, 5000 ms).
- `onSave()` (no-op if invalid): builds an `AppSettingsUpdate` from `getRawValue()` — text fields are `trim() || null`; `order_notification_recipients` is trimmed but kept as a string (its column is `not null`); numbers via `Number(...)`; `exchange_rate_usd_crc` maps `null`/`''` → `null`; `maintenance_image_url` comes from the signal. Then `settings.update(patch)`, `current.set(updated)`, `markAsPristine()`, snackbar `"Configuración guardada"` (`'OK'`, 3000 ms).
- `openMaintenanceImagePicker()` — opens `ImagePickerDialog` (880 px, `data: { startPath: 'maintenance' }` so it opens inside — creating if needed — `/card-images/maintenance/`); on pick sets `maintenanceImageUrl` to the root-relative `result.url` and `form.markAsDirty()` (that's what enables "Guardar cambios"). `clearMaintenanceImage()` — sets it `null` + `markAsDirty()`.
- Component providers pin `MAT_FORM_FIELD_DEFAULT_OPTIONS` to `{ floatLabel: 'always' }` — zoneless workaround: async `patchValue()` doesn't notify CD, so resting outline labels would cover prefilled values until focused.

## Behaviors & edge cases

- **Save is all-or-nothing:** one `UPDATE` writes every form field, not a diff — concurrent edits by two admins last-write-wins per save, whole-row.
- **Dirty tracking** gates the button: after save/bootstrap the form is pristine, so "Guardar cambios" stays disabled until an actual edit.
- **Immediate propagation with a lag:** consumers using `load()` see changes within the 60 s TTL (the maintenance guard may allow navigation for up to a minute after enabling maintenance); `update()` refreshes only the saving admin's cache instance.
- **Clearing the exchange rate** (empty field) stores `null`; a later price-review run then fails fast with `NO_EXCHANGE_RATE`.
- **Import is idempotent** and confirm-gated; the button disables and relabels while `importing()`.
- **Empty `order_notification_recipients`** disables admin notification emails (customer confirmation still sends).

## Gotchas / invariants

- **Stale hint copy (two places):** the maintenance section still says `"La lógica del frontend se conectará después."` even though `maintenanceGuard` + `/maintenance` are fully wired, and the exchange-rate hint says `"cuando lo conectemos"` even though price review and add-product already consume the rate. The toggles are live — don't treat them as inert.
- **Stale loyalty hint:** `"La canasta de canje de puntos llegará en una fase posterior."` — redemption shipped (Pokéball tiers, migration `20260704000000`); points are spendable today.
- **`pokeball_tiers` is an `app_settings` key with no admin UI.** It's in `AppSettingsRow` but deliberately excluded from `AppSettingsUpdate`, so this form can't clobber it; tuning requires a direct row update (SQL/Studio).
- **Disabling `loyalty_enabled` does not stop reversals** — the trigger claws back points on cancellation regardless of the flag (by design, to avoid stranding points earned while it was on). Only *awarding* is gated.
- **Disabling `price_review_enabled` leaves the cron job scheduled** — the job body checks the flag each Monday and returns early; re-enabling needs no re-scheduling.
- `onSave()` compares `raw.exchange_rate_usd_crc === ''` even though the control is typed `number | null` — harmless (number inputs can surface `''`), but don't "clean it up" without keeping the empty-string path.
- The `id = true` singleton trick means every read/update filters `.eq('id', true)`; never insert into `app_settings`.
- Threshold/floor DB checks (`> 0`, `>= 0`) are mirrored by form validators; the **floor form allows 0 but the threshold cannot be 0** (`min(0.01)`) — matching the DB `check (… > 0)`.
- The exchange rate is public-readable by design (`app_settings_public_read` grants anon SELECT of the whole row) — never add customer-private data to this table.
- The Operaciones panel sits **outside** `<form>`; importing doesn't touch form dirtiness or the save button.

## Related docs

- [price-review.md](./price-review.md) — the queue these thresholds feed; manual-run overrides don't persist here
- [reports.md](./reports.md) — the Puntos report reading the loyalty ledger these settings drive
- [order-detail.md](./order-detail.md) — the pending→paid transition that triggers point awards
- [sets.md](./sets.md) — where imported TCGdex sets are managed
- [../storefront/order-confirmation.md](../storefront/order-confirmation.md) — displays `sinpe_phone` / `whatsapp_number` / `bank_account_info`
- [../storefront/maintenance.md](../storefront/maintenance.md) — consumes `maintenance_mode` / `maintenance_message`
- [../storefront/account-pokedex.md](../storefront/account-pokedex.md) — consumes `pokeball_tiers`
- [../../architecture/loyalty-and-pokedex.md](../../architecture/loyalty-and-pokedex.md) — points economy
- [../../architecture/data-model.md](../../architecture/data-model.md) — `app_settings` in context
- [../../design-manifest.md](../../design-manifest.md) — `app-page-header`, `app-form-section`, `app-form-grid`, `app-labeled-toggle`, `app-btn` props
