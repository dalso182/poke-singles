# Auth & roles

> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose

How a visitor becomes a session, how a session becomes a profile row, and how the single `admin` role is asserted end-to-end: Supabase Auth on the client (`AuthService`), the `profiles` table + `handle_new_user()` trigger on the database, `is_admin()` in RLS, and the signup notification edge function.

## Scope

- **In scope:** `src/app/core/auth/auth.service.ts`, `src/app/core/auth/profiles.service.ts`, `src/app/core/supabase/supabase.service.ts`, the login dialog's use of AuthService, the `is_admin()` / `app_metadata.role` pattern, profile row lifecycle (`handle_new_user`), `supabase/functions/send-signup-email`.
- **Out of scope:** guard mechanics (see [routing-and-guards](./routing-and-guards.md)), login dialog UI (see [../screens/storefront/login-dialog.md](../screens/storefront/login-dialog.md)), RLS policies on commerce tables (see [data-model](./data-model.md)).

## Key files

| File | Role |
|---|---|
| `src/app/core/supabase/supabase.service.ts` | `SupabaseService` — the one typed client: `createClient<Database>(url, anonKey)` from `environment.supabase`; throws at construction if url/anonKey are blank. |
| `src/app/core/auth/auth.service.ts` | Session signals, login/signup/sign-out methods, Spanish error mapping, activity logging. |
| `src/app/core/auth/profiles.service.ts` | Reactive cache of the current user's `profiles` row + self-heal insert. |
| `src/app/auth/login-dialog/login-dialog.ts` | Shared `LoginDialog` (tabs: sign-in, magic link, sign-up) — the only UI that calls the sign-in methods. |
| `supabase/migrations/20260501205916_initial_catalog_schema.sql` | Defines `public.is_admin()`. |
| `supabase/migrations/20260505000000_add_profiles.sql` | `profiles` table, RLS, original `handle_new_user()` + `on_auth_user_created` trigger, backfill. |
| `supabase/migrations/20260510000200_handle_new_user_notify.sql` | Current `handle_new_user()` — adds the pg_net call to the edge function. |
| `supabase/functions/send-signup-email/index.ts` | Edge function that emails admins about each new signup via Resend. |
| `supabase/migrations/README.md` | Documents the admin-promotion SQL (quoted below). |

## How it works

### The Supabase client

`SupabaseService` is a root-provided wrapper exposing `readonly client: SupabaseClient<Database>`. Constructor reads `environment.supabase.{url, anonKey}` and throws `[SupabaseService] Missing supabase.url / anonKey...` if either is blank — so an unconfigured environment fails fast at first injection. Everything auth-related goes through `this.supabase.client.auth`.

### Session state — `AuthService`

Signals:

- `currentUser: Signal<CurrentUser>` where `CurrentUser = User | null | undefined` — **`undefined` means "initial session still resolving"**, `null` means definitively signed out. Consumers that react to auth in effects must skip the `undefined` state (both `ProfilesService` and `CartService` do: `if (user === undefined) return;`).
- `isSignedIn = computed(() => this._currentUser() != null)` — note `!=` so `undefined` also counts as not signed in.
- `isAdmin = computed(...)` — reads `(user.app_metadata as { role?: string }).role === 'admin'`. Client-side convenience only; the database enforces the same claim via `is_admin()`.
- `signedInTick: Signal<number>` — increments on every Supabase `SIGNED_IN` event. This is the only way to react once to a *fresh* login regardless of path (password, magic-link redirect, OAuth redirect), because redirect logins restore the session as `INITIAL_SESSION` and look identical to a page reload from `currentUser()`'s perspective. Caveat: `SIGNED_IN` also fires on token refresh and multi-tab syncs, so consumers must dedupe (e.g. `avatar-picker.service.ts` keys its welcome flow off the tick but guards against re-runs).
- `ready: Promise<void>` — resolves when `hydrateInitialSession()` (a `getSession()` call) completes. **All route guards `await auth.ready`** before reading `isSignedIn()` / `isAdmin()`; on hydration failure the user is set to `null` (signed out), never left `undefined`.

The constructor also subscribes to `onAuthStateChange`, keeping `currentUser` in sync, and on `SIGNED_IN` fires a best-effort `rpc('log_activity', { p_event_type: 'login' })` for the admin Customer Activity Report (the RPC dedupes logins within a 10-minute window server-side, so liberal firing is safe).

### Login methods

All return `Promise<AuthActionResult>` (`{ error: string | null }`) with errors already mapped to Spanish:

| Method | Supabase call | Notes |
|---|---|---|
| `signInWithPassword(email, password)` | `auth.signInWithPassword` | |
| `signUpWithPassword(email, password, displayName)` | `auth.signUp` with `options.data.full_name` | On success fires `log_activity('registered')` (no-op if email confirmation is on — no session yet). |
| `signInWithGoogle()` | `auth.signInWithOAuth({ provider: 'google', options.redirectTo })` | `redirectTo` = `document.baseURI`. |
| `signInWithMagicLink(email)` | `auth.signInWithOtp` with `options.emailRedirectTo` | Doubles as signup for new emails (`shouldCreateUser` defaults true). Session returns in the URL fragment; the SDK auto-detects it on load. |
| `signOut()` | `auth.signOut()` | |
| `resetPassword(email)` | `auth.resetPasswordForEmail(email, { redirectTo })` | |

`mapError()` translates by substring match: "invalid login credentials" → "Correo o contraseña incorrectos.", "email not confirmed" → "Confirma tu correo antes de iniciar sesión.", "user already registered" → "Ya existe una cuenta con este correo.", "password should be at least" → "La contraseña debe tener al menos 6 caracteres.", "rate limit" → "Demasiados intentos. Espera un momento antes de volver a intentarlo.", "network" → "No se pudo conectar. Revisa tu conexión.", fallback "No fue posible completar la acción. Inténtalo de nuevo."

The shared `LoginDialog` (`src/app/auth/login-dialog/`) is the only sign-in UI: tabs for password sign-in (email + password ≥ 6 chars), magic link ("Te enviamos un correo a {email}. Haz clic en el enlace para iniciar sesión."), and sign-up (adds `displayName`, min length 2). Guards lazy-import and open it with `panelClass: 'login-dialog-panel'`.

### The admin role — `app_metadata.role`

Single role, one value: `role: 'admin'` inside `auth.users.raw_app_meta_data` (surfaced in the JWT as `app_metadata`). `app_metadata` is server-controlled — users cannot write it (unlike `user_metadata`), which is what makes the claim trustworthy.

Database side (`20260501205916_initial_catalog_schema.sql`):

```sql
create or replace function public.is_admin()
returns boolean language sql stable as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;
```

Note it reads `app_metadata ->> 'role'`, **not** the bare `auth.jwt() ->> 'role'` claim (that one holds the Postgres role, always `authenticated`). Every admin RLS policy is `using (public.is_admin())`.

Promotion is a one-off SQL bootstrap (no dashboard UI, per `supabase/migrations/README.md`):

```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb
where email = '<admin email>';
```

**The user must sign out and back in** for the claim to land in their JWT (and therefore in `AuthService.isAdmin()`).

### Profile row lifecycle

`public.profiles` (from `20260505000000_add_profiles.sql`) is keyed 1:1 to `auth.users` (`id uuid primary key references auth.users(id) on delete cascade`) with `full_name`, `phone`, `default_shipping_address jsonb`, `created_at`, `updated_at` (maintained by trigger `profiles_set_updated_at` → `tg_set_updated_at()`). Later migrations add columns such as `avatar_pokemon_number` (exposed via `ProfilesService.avatarPokemonNumber`).

RLS policies: `profiles_self_read` / `profiles_self_insert` / `profiles_self_update` (all `id = auth.uid()`, role `authenticated`) plus `profiles_admin_all` (`public.is_admin()` for all commands). No anon access.

**Creation — trigger `on_auth_user_created` → `handle_new_user()`** (current definition in `20260510000200_handle_new_user_notify.sql`, `security definer`, `set search_path = public`):

1. Inserts `profiles (id, full_name)` with `full_name = coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name')` — Google supplies both keys, password signup sends `full_name`, magic link leaves it null.
2. Then, inside a `begin/exception when others then null` block, reads two Vault secrets — `signup_email_url` and `supabase_anon_key` — and if both exist fires `extensions.http_post` (pg_net, async) to the `send-signup-email` edge function with body `{"user_id": <new.id>}` and `Authorization: Bearer <anon key>`. Any failure is swallowed: **email notification can never block account creation**. If the Vault secrets are missing (per-environment setup via `vault.create_secret`), notification is silently skipped.

The original migration also backfilled profiles for pre-existing users (`on conflict (id) do nothing`).

**Self-heal — `ProfilesService.fetchMine()`:** if a signed-in user has no profile row (pre-trigger account, or the trigger failed), the service inserts one client-side from session metadata (`full_name` from `user_metadata.full_name`/`.name`) — allowed by `profiles_self_insert`. So application code may assume a profile row exists *after* `ensureLoaded()` resolves, but not before.

### `ProfilesService` — the reactive profile cache

- `profile: Signal<ProfileRow | null>` — `null` = signed out or not yet loaded.
- A constructor `effect` tracks `auth.currentUser()`: skips `undefined`, clears the cache on `null`, and (re)loads when the user id changes (`loadedUserId` guards against a stale cache when the signed-in user switches).
- `ensureLoaded()` is idempotent and cheap — header, `/account`, and checkout all call it.
- `getMine()` coalesces concurrent fetches through a single `inflight` promise.
- Reads use `.eq('id', user.id).maybeSingle()` — the explicit id filter (rather than relying on RLS scoping alone) avoids 406s from `.single()`, and `maybeSingle()` returns null cleanly when the row is missing (triggering self-heal).
- `updateMine(patch)` updates by id, throws `'No hay sesión activa.'` without a session, and refreshes the signal — so header chrome and `/account` stay in sync from one write.

### How the rest of the app consumes auth state

- **Guards** (`adminGuard`, `customerGuard`, `maintenanceGuard`): `await auth.ready`, then read `isSignedIn()` / `isAdmin()` synchronously. See [routing-and-guards](./routing-and-guards.md).
- **`CartService`** (`src/app/core/cart/cart.service.ts`): effect on `currentUser()` — signed out = localStorage cart (`cart:v1`), signed in = `cart_items` table; on sign-in anonymous items merge into the DB cart (quantities summed, capped at stock) and localStorage is cleared.
- **`ProfilesService`**: effect as above.
- **`UserAvatar`** (`shared/user-avatar`): reads `auth.currentUser()?.user_metadata` (`avatar_url` / `picture`) as the Google-photo fallback behind the chosen Pokémon portrait.
- **`Account`**: an effect navigates to `/` when `currentUser()` becomes `null` (sign-out while on the page).
- **`avatar-picker.service.ts`**: keys the first-login avatar prompt off `signedInTick()`.

## Contracts & conventions

- **Never read `currentUser()` in an effect without handling `undefined`** (hydration in flight). The tri-state is deliberate.
- **Guards must `await auth.ready`** before any decision.
- **Client `isAdmin()` is cosmetic/UX; RLS `is_admin()` is the enforcement.** Both read the same JWT claim, so they cannot disagree for a given token — but a freshly promoted admin needs a new token (sign out/in).
- All auth methods return `{ error: string | null }` with user-facing **Spanish** messages; UI shows them verbatim.
- Activity logging (`log_activity` RPC) is fire-and-forget — wrap in try/catch, never block auth flows.
- Profile access never passes the user id from application state for authorization; RLS + explicit `eq('id', user.id)` from the live session is the pattern.
- Redirect URLs for OAuth/magic-link/reset all derive from `document.baseURI` (`getAppBaseUrl()`), so they follow the deployed origin automatically (dev vs `new.` vs cutover domain).

## Gotchas / invariants

- **`SIGNED_IN` over-fires** (token refresh, multi-tab, redirect callbacks). Anything hanging off `signedInTick` or the auth-state callback must be idempotent or deduped; `log_activity` dedupes server-side (10-minute window).
- **Magic link creates accounts implicitly** — there is no "user not found" path; a typo'd email becomes a new empty account with a null-name profile.
- **`signUpWithPassword`'s `log_activity('registered')` is a no-op when email confirmation is enabled** (no session → `auth.uid()` null in the RPC); those users appear as a `login` after confirming.
- **Profile `full_name` is null for magic-link signups** until the user edits `/account`; code must not assume a name exists.
- **Admin claim latency:** `raw_app_meta_data` promotion only takes effect after re-login (JWT re-issue). Same for demotion — an admin keeps admin RLS power until their token expires or they sign out.
- **`handle_new_user` is defined twice in migration history** — the `20260510000200` version supersedes `20260505000000`. When editing it again, pull the *live* definition first (dev DB can run ahead of the repo; see the database skill / memory note).
- **`send-signup-email` requires `verify_jwt = false`** in `supabase/config.toml` (pg_net calls carry the anon key, not a user JWT). Its required env vars: `RESEND_API_KEY`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`, `STORE_PUBLIC_URL` (plus auto-injected `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). Recipients come from `app_settings.order_notification_recipients` (comma-separated, validated/lowercased); zero recipients → `{ ok: true, sent: 0 }`, no email.
- **The signup email hardcodes** `LOGO_URL = 'https://www.poke-singles.com/logo.png'` and defaults `STORE_PUBLIC_URL` to `https://new.poke-singles.com` — both need attention at cutover.
- **`profiles` has no anon-readable policy** — any storefront surface for other users' data (e.g. leaderboards) must go through a dedicated RPC/view, not the table.
- Casts like `(this.supabase.client as any).from('profiles')` appear where generated types lag the schema — regenerate `database.types.ts` rather than adding more casts.

## Related docs

- [routing-and-guards.md](./routing-and-guards.md) — the guards that consume this state.
- [data-model.md](./data-model.md) — `profiles` columns, RLS across tables, `app_settings`.
- [backend-rpcs-and-functions.md](./backend-rpcs-and-functions.md) — `log_activity`, edge functions.
- [commerce-flow.md](./commerce-flow.md) — cart merge on sign-in, checkout identity.
- [../screens/storefront/login-dialog.md](../screens/storefront/login-dialog.md), [../screens/storefront/account.md](../screens/storefront/account.md).
