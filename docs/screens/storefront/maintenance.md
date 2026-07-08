# Maintenance page

> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose

The full-page maintenance screen at `/mantenimiento`, shown to non-admin visitors while `app_settings.maintenance_mode` is on. It lives outside `UserShell` (no header/nav/footer) and is the redirect target of `maintenanceGuard`, which gates the entire customer storefront. If maintenance is off, the page bounces straight back to `/` so the route is never a dead page.

## Route & access

- **Path:** `/mantenimiento` — top-level route in `src/app/app.routes.ts`, lazy `loadComponent` → `Maintenance`. **No guard on the route itself** — it is the fallback, so gating it would loop.
- **Ordering invariant** (comment in `app.routes.ts` verbatim): "Standalone maintenance screen (no shell). Redirect target of maintenanceGuard; must come before the empty-path UserShell so the catch-all doesn't swallow it. Not itself gated — it's the fallback." The empty-path UserShell route matches everything under `/`, so `/mantenimiento` (like `/admin` and `/library`) must be declared **above** it or the router would render UserShell (and re-run `maintenanceGuard`) instead.
- **Who gets sent here:** `maintenanceGuard` is `canActivate` + `canActivateChild` on the empty-path UserShell route — every storefront navigation. Admins bypass. `/admin/*` and `/library` are **not** gated by maintenance.

## Files

- `src/app/maintenance/maintenance.ts` — `Maintenance` component (standalone, selector `app-maintenance`); constant `FALLBACK_MESSAGE = 'Estamos actualizando el inventario, volvemos en un rato.'` (mirrors the placeholder in the admin config form).
- `src/app/maintenance/maintenance.html` — the static page (`.maintenance` block).
- `src/app/maintenance/maintenance.scss` — full-viewport centered layout on `var(--surface-page)`; `.maintenance__logo`, `.maintenance__icon`, `.muted`.
- `src/app/core/auth/maintenance.guard.ts` — `maintenanceGuard` (`CanActivateFn`).
- `src/app/core/settings/app-settings.service.ts` — `AppSettingsService` (`load()` TTL cache, `getMaintenance()`, `get()`, `update()`).
- `src/app/app.routes.ts` — route declaration + ordering comment.
- Admin side: `/admin/config` (`src/app/admin/config/`) writes `maintenance_mode` / `maintenance_message` via `AppSettingsService.update()`.

## UI anatomy

Rendered only once `ready()` is true (avoids a flash of the fallback copy before the settings fetch resolves):

1. `<main class="maintenance">` — flex column, centered, `min-height: 100vh`.
2. Logo `assets/images/poke-singles-logo.png` (`.maintenance__logo`, 56 px tall).
3. `mat-icon` "build" (`.maintenance__icon`, 64 px, `--text-tertiary`).
4. `<h1>` "En mantenimiento".
5. `<p class="muted">{{ message() }}</p>` — the admin-authored `maintenance_message`, or the fallback "Estamos actualizando el inventario, volvemos en un rato." when blank/whitespace.

No buttons, links, or countdown — the only exit is the automatic bounce when maintenance turns off.

## Services & backend

- `AppSettingsService.getMaintenance()` → `{ on: !!maintenance_mode, message: maintenance_message }`, derived from `load()`.
- `AppSettingsService.load(maxAgeMs = 60_000)` — cached read of the **`app_settings`** singleton row (`select('*').eq('id', true).single()`; the table's PK is the boolean `id = true`). Returns the cached row when younger than 60 s; concurrent callers share one in-flight request. This cache is why the guard doesn't round-trip on every navigation.
- `app_settings` is readable by anon (the storefront needs it pre-login); writes go through `update()` from `/admin/config` (admin-gated by RLS).
- `maintenanceGuard` additionally awaits `AuthService.ready` (initial `getSession()` hydration) so `isAdmin()` is reliable on a hard refresh.

## State & data flow

- **Guard flow** (`maintenanceGuard`): `await auth.ready` → `auth.isAdmin()` ⇒ allow → else `await settings.getMaintenance()` → `on === false` ⇒ allow → else `router.createUrlTree(['/mantenimiento'])`.
- **Component signals:** `ready` (starts `false`; set `true` in `finally`), `message` (starts at `FALLBACK_MESSAGE`).
- **Component flow** (`resolve()` in the constructor): fetch `getMaintenance()`; if `on` is false → `router.navigate(['/'])` and return (page never renders); otherwise set `message` to the trimmed admin message or the fallback.
- No inputs, effects, or reload triggers — one fetch per instantiation. The component usually hits the guard-warmed cache, so no second network round-trip.

## Behaviors & edge cases

- **Admin preview:** admins pass the guard even with maintenance on, so they can browse the store and reach `/admin/config` to turn it off. If an admin manually visits `/mantenimiento` while maintenance is on, they see the page like anyone else (the component doesn't check roles).
- **Direct visit with maintenance off:** silent redirect to `/` (blank screen for the instant the settings resolve, since nothing renders until `ready()`).
- **Toggle latency:** turning maintenance on/off propagates via the 60 s `load()` TTL and only takes effect on the next router navigation — an already-rendered product page keeps working until the visitor navigates. Similarly, a visitor parked on `/mantenimiento` isn't auto-released; they escape on their next reload/navigation once the cache expires. Note `update()` (admin save) refreshes the cache immediately *in the admin's own tab*.
- **Settings fetch failure in the guard:** `getMaintenance()` rejects → the guard promise rejects → navigation is cancelled (neither storefront nor maintenance page). The component's `resolve()` has no `catch` either — on failure it renders with the fallback message thanks to the `finally` (and skips the redirect check).
- Not gated by `maintenanceGuard` (by design): `/mantenimiento` itself, `/admin/*` (own `adminGuard`), `/library`.

## Gotchas / invariants

- **Route order is load-bearing:** `/mantenimiento` (and `/admin`, `/library`) must stay above the empty-path UserShell route in `app.routes.ts` — the CLAUDE.md rule "Specific paths must come before the empty-path UserShell" exists because the shell route matches `''` with children and would otherwise mis-match these paths.
- **Never add `maintenanceGuard` to the `/mantenimiento` route** — with maintenance on it would redirect to itself. The component's own off-state bounce is the only redirect logic it needs.
- **`FALLBACK_MESSAGE` is duplicated by convention** with the admin config form's placeholder ("Mirrors the placeholder shown in the admin config form" — comment in `maintenance.ts`). Change both together.
- The guard treats *any* truthy `maintenance_mode` as on (`!!s.maintenance_mode`); the message is used only when non-blank after `trim()`.
- Guard checks run per navigation, not per session — don't cache the guard's decision anywhere; the 60 s TTL in `AppSettingsService.load()` is the intended (and only) caching layer.
- The screen deliberately has **no UserShell chrome** — don't wrap it in the shell or add nav links; it must stay usable while the rest of the storefront is considered "down".
- `app_settings` is a singleton row keyed `id = true`; all reads/writes use `.eq('id', true)`.

## Related docs

- [Shell, header & footer](./shell-header-footer.md) — the UserShell branch this guard protects.
- [Login dialog](./login-dialog.md) — `AuthService.ready` / `isAdmin()` used by the guard.
- [Routing & guards](../../architecture/routing-and-guards.md) — full route table and guard ordering.
- [Auth & roles](../../architecture/auth-and-roles.md) — the `app_metadata.role === 'admin'` bypass.
- [Data model](../../architecture/data-model.md) — the `app_settings` singleton.
- Admin config screen: [Config](../admin/config.md) — where `maintenance_mode` / `maintenance_message` are edited.
