# Login dialog

> Part of the Poke-Singles docs set. Verified against source on 2026-07-06. Load together with /CLAUDE.md.

## Purpose

The shared authentication dialog (`LoginDialog`) used by both the storefront and the admin shell: three tabs — password sign-in, passwordless magic link, and account creation — plus a Google OAuth button and a forgot-password flow. All Supabase Auth calls go through `AuthService`, which also maps raw Supabase error messages to Spanish copy and logs login/registration activity.

## Route & access

Not a route — a `MatDialog` component, always **lazy-imported** (`await import('../../auth/login-dialog/login-dialog')`) so its Material deps stay out of the initial bundle. Every opener uses the same config: `panelClass: 'login-dialog-panel'`, `autoFocus: 'first-tabbable'`, `restoreFocus: true`.

Openers (complete list, verified by grep):

1. `src/app/user/header/header.ts` — `openLogin()` on the person icon button (`aria-label="Iniciar sesión"`, shown when `!isSignedIn()`).
2. `src/app/admin/admin-shell/admin-shell.ts` — `openLogin()` in the admin top bar.
3. `src/app/core/auth/customer.guard.ts` — `customerGuard`: signed-out visitor hits a customer route (`/account*`) → opens the dialog **and** returns `router.createUrlTree(['/'])` (redirect home; the attempted URL is not preserved).
4. `src/app/core/auth/admin.guard.ts` — `adminGuard`: signed-out visitor hits `/admin*` → dialog + redirect home. (Signed-in non-admins instead get the snackbar "Necesitas permisos de administrador para entrar al panel." with no dialog.)

## Files

- `src/app/auth/login-dialog/login-dialog.ts` — `LoginDialog` component (standalone, selector `app-login-dialog`); typed form groups `SignInForm`, `SignUpForm`, `MagicLinkForm`.
- `src/app/auth/login-dialog/login-dialog.html` — hero + alerts + 3-tab `mat-tab-group` + Google button.
- `src/app/auth/login-dialog/login-dialog.scss` — `:host` sizing (`min(440px, 92vw)`, `max-height: 92dvh`), `.login-dialog__*` blocks, and the official Google Identity button styling (`.gsi-material-button*`).
- `src/app/core/auth/auth.service.ts` — `AuthService`: all auth methods, `currentUser` / `isSignedIn` / `isAdmin` signals, `signedInTick`, `ready` promise, `mapError()` Spanish error mapping, `logActivity()`.
- `src/app/core/supabase/supabase.service.ts` — the `SupabaseClient` (default `createClient` options, so `detectSessionInUrl` is on — required for magic-link/OAuth returns).
- `src/app/core/auth/customer.guard.ts` / `admin.guard.ts` — guard openers (see above).

## UI anatomy

Top to bottom:

1. **Close button** (`.login-dialog__close`, icon `close`, `aria-label="Cerrar"`) → `close()` → `dialogRef.close()` (no result).
2. **Hero** (`.login-dialog__hero`): logo `assets/images/poke-singles-logo.png`, `<h1>` "Bienvenido", subtitle "Inicia sesión para acceder a tu cuenta y gestionar tus pedidos."
3. **Alerts** — `errorMessage()` renders `.login-dialog__alert--error` (`role="alert"`, `--mat-sys-error-container` colors — Danger red per the theme rule, never brand red); `infoMessage()` renders `.login-dialog__alert--info` (`role="status"`, tertiary container).
4. **`mat-tab-group`** (`.login-dialog__tabs`, `animationDuration="180ms"`, centered, non-stretch; per-tab padding trimmed via `::ng-deep` so all three labels fit without pagination chevrons):
   - **Tab "Iniciar sesión"** (`signInForm`): fields "Correo" (errors: "Ingresa un correo válido.") and "Contraseña" (error: "Mínimo 6 caracteres."); submit `.login-dialog__primary` labelled "Iniciar sesión" / "Ingresando…" while `submitting()`; text button "¿Olvidaste tu contraseña?" → `forgotPassword()`.
   - **Tab "Enlace Mágico"** (`magicLinkForm`): hint "Te enviaremos un enlace de acceso a tu correo. Sin contraseña.", field "Correo", submit "Enviar enlace" / "Enviando…".
   - **Tab "Crear cuenta"** (`signUpForm`): fields "Nombre" (error: "Escribe tu nombre."), "Correo" ("Ingresa un correo válido."), "Contraseña" (error: "Usa al menos 6 caracteres."); submit "Crear cuenta" / "Creando…".
5. **Divider** (`.login-dialog__divider`) with "o".
6. **Google button** (`.gsi-material-button`, official Google styling incl. the four-color SVG): "Continuar con Google" → `signInWithGoogle()`. Disabled while `submitting()`.

## Services & backend

All via `AuthService` → Supabase Auth (no app tables touched directly):

- `signInWithPassword(email, password)` → `supabase.auth.signInWithPassword`.
- `signUpWithPassword(email, password, displayName)` → `supabase.auth.signUp` with `options.data: { full_name: displayName }` (lands in `user_metadata.full_name`; a DB trigger materializes profiles elsewhere). On success fires `logActivity('registered')`.
- `signInWithMagicLink(email)` → `supabase.auth.signInWithOtp` with `emailRedirectTo = document.baseURI`. Doubles as signup for new emails (`shouldCreateUser` default true).
- `signInWithGoogle()` → `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: document.baseURI } })` — full-page redirect.
- `resetPassword(email)` → `supabase.auth.resetPasswordForEmail(email, { redirectTo: document.baseURI })`.
- `logActivity('login' | 'registered')` — fire-and-forget RPC **`log_activity(p_event_type)`** feeding the admin Customer Activity report; server resolves the user from the session and captures IP. Logins are deduped server-side within a 10-minute window, so the liberal `SIGNED_IN`-event firing (token refresh, multi-tab, OAuth/magic-link callbacks) is safe.

`AuthService` state (consumed app-wide, not just here): `currentUser` signal (`User | null | undefined` — `undefined` while hydrating), `isSignedIn` computed (`!= null`), `isAdmin` computed (`app_metadata.role === 'admin'`), `signedInTick` (increments on every Supabase `SIGNED_IN` event; lets consumers react once to a fresh login regardless of path — used by `avatar-picker.service.ts`), and `ready` (promise resolving after initial `getSession()` hydration; guards await it before deciding).

## State & data flow

- Component signals: `submitting`, `errorMessage`, `infoMessage`. `beginSubmit()` sets submitting and clears both messages; `showError(msg)` sets the error, clears info, resets submitting.
- Forms (all `nonNullable` controls): `signInForm` (email: required+email; password: required+minLength 6), `magicLinkForm` (email: required+email), `signUpForm` (email, password minLength 6, displayName: required+minLength 2). Invalid submits call `markAllAsTouched()` and bail.
- **Flow outcomes:**
  - `signIn()` success → `dialogRef.close('signed-in')`.
  - `signUp()` — if a session is active immediately (email confirmation off) → `dialogRef.close('signed-up')`; otherwise stays open with info "Cuenta creada. Si activaste la confirmación por correo, revisa tu bandeja."
  - `sendMagicLink()` success → stays open with info "Te enviamos un correo a {email}. Haz clic en el enlace para iniciar sesión."
  - `signInWithGoogle()` → the browser redirects away; the dialog is torn down on return. `submitting` intentionally stays `true` on success (only errors reset it).
  - `forgotPassword()` — requires the sign-in tab's email field; empty → error "Escribe tu correo para enviar el enlace de recuperación." Success info: "Te enviamos un correo para restablecer tu contraseña."
- **Post-login reactions are decoupled from the dialog:** nothing subscribes to the dialog's close result (`'signed-in'` / `'signed-up'` are emitted but unused). The app reacts via `AuthService` signals — e.g. `CartService` has an effect on `auth.currentUser()` that merges the anonymous cart into the DB cart on sign-in, `LoyaltyService` refetches the balance, the header swaps the person icon for the avatar.
- **Redirect handling:** magic link, OAuth, and password-reset all use `document.baseURI` as the return URL — i.e. the app root, not the page the user was on. On return, the Supabase SDK detects the session in the URL fragment (`detectSessionInUrl` default), fires `SIGNED_IN`, and `signedInTick` increments.

## Behaviors & edge cases

- **Error copy** (`AuthService.mapError`, matched against lowercase Supabase messages, quoted verbatim):
  - "invalid login credentials" → "Correo o contraseña incorrectos."
  - "email not confirmed" → "Confirma tu correo antes de iniciar sesión."
  - "user already registered" → "Ya existe una cuenta con este correo."
  - "password should be at least" → "La contraseña debe tener al menos 6 caracteres."
  - "rate limit" → "Demasiados intentos. Espera un momento antes de volver a intentarlo."
  - "network" → "No se pudo conectar. Revisa tu conexión."
  - anything else → "No fue posible completar la acción. Inténtalo de nuevo."
- Magic link and forgot-password keep the dialog open (the user must go to their inbox); only password sign-in and immediate-session signup close it.
- Guard-triggered opens always land the user on `/` — after logging in they are **not** returned to the route they attempted (e.g. `/account/pedidos`); they must navigate again.
- Signup with email confirmation enabled produces no session → no `registered` activity row (RPC sees `auth.uid()` null); those users surface as a `login` event once they confirm.
- Double-submit is guarded (`submitting()` check at the top of every action).

## Gotchas / invariants

- **Always lazy-import `LoginDialog`** when adding a new opener — the established pattern in guards/header/admin-shell exists specifically to keep Material dialog deps out of the initial bundle. Reuse the exact dialog config (`login-dialog-panel`, `autoFocus: 'first-tabbable'`, `restoreFocus: true`).
- **`login-dialog-panel` has no matching style rule** — grep finds the class only at the four `dialog.open` call sites, nowhere in any `.scss`. Sizing actually comes from the component's `:host`. Harmless today, but don't assume the panelClass does anything.
- **Don't rely on the dialog close result** — `'signed-in'` / `'signed-up'` have zero subscribers; react to `auth.currentUser()` / `signedInTick` instead (that's what cart merge and avatar-picker do). `signedInTick` also fires on token refresh and multi-tab events, so consumers must dedupe (see `avatar-picker.service.ts`).
- **`document.baseURI` is the only redirect target** — magic-link/OAuth/reset returns always land on the app root. If deep-link return is ever wanted, it must be added deliberately (e.g. `redirectTo` with a path + state).
- Password minimum is 6 characters in three places (two validators + Supabase's own error) — keep them consistent if the policy changes.
- The error alert uses Material's error container (Danger `#B91C1C` family) — never brand red (`#CE1126`); that's the theme hard rule.
- `AuthService.ready` must be awaited before reading `isSignedIn()`/`isAdmin()` in any new guard — otherwise a hard refresh races session hydration and bounces logged-in users.
- There is no separate `/reset-password` screen — the reset email lands the user back on the app root with a recovery session; no UI currently prompts for the new password (setting a new password after recovery is unhandled).

## Related docs

- [Shell, header & footer](./shell-header-footer.md) — the header opener and signed-in menu / sign-out.
- [Account](./account.md) — behind `customerGuard`, the main destination gated by this dialog.
- [Checkout](./checkout.md) — guest-friendly; locks the email field for signed-in users.
- [Auth & roles](../../architecture/auth-and-roles.md) — `isAdmin` / `app_metadata.role`, guards, session hydration.
- [Admin shell](../admin/admin-shell.md) — the admin-side opener and `adminGuard`.
