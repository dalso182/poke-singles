---
name: commit-and-document
model: sonnet
description: Use when the user asks to "commit work and update docs if necessary", "wrap up", "save progress", or any phrasing that implies "I'm done with this batch of changes — commit them and refresh docs if they're stale". Reviews the working tree, routes each doc update to its correct home (a domain skill under `.claude/skills/`, the per-screen/subsystem docs under `docs/`, the slim `CLAUDE.md`, or `README.md`) and updates only where the diff actually changes behavior, stages explicit paths (never `git add -A`), composes a thematic commit message in the project's style, and creates the commit. Skips when the user only asks for a docs update without a commit, or wants to commit without docs review.
---

# commit-and-document

Wrap-up routine for "I'm done with this slice of work — commit it cleanly." Two halves:

1. **Doc refresh.** Read the diff and update *only* the docs this batch made stale. Docs now
   live in four places — route each change to the right one (see step 3). Skip everything the
   batch didn't touch.
2. **Targeted commit.** Stage explicit paths to keep `.env.local`, build artifacts, IDE config,
   and other clutter out. Compose a 1-line title in the project's existing style, plus a short
   bulleted body explaining the *why*.

## Doc layout (read this first)

The project docs were split for context efficiency. Know where things live before refreshing:

- **`CLAUDE.md`** (repo root) — **slim, always-on.** Stack, conventions, the two hard
  guardrails, a high-level directory + route map, the "Out of scope" list, and a skill index.
  It is loaded on *every* turn, so keep it lean. Most feature work does **not** belong here.
- **`.claude/skills/<name>/SKILL.md`** — domain detail, loaded on demand. Six skills:
  `database`, `storefront`, `admin`, `theme`, `deploy`, `migration`. This is where domain-level
  "this is now stale" updates land.
- **`docs/`** — per-screen and per-subsystem reference docs, one file per screen
  (`docs/screens/<area>/<screen>.md`) plus cross-cutting subsystem docs
  (`docs/architecture/<subsystem>.md`). Index with routes: `docs/README.md`. These carry the
  exact identifiers (signal/method names, RPCs, copy, gotchas) — the deepest layer, and the
  one most likely to go stale when a screen changes.
- **`README.md`** — for humans (setup, status, command/route reference, user-facing capability).
- **`.claude/skills/README.md`** — index of the skills themselves.

## When to invoke

- "commit work, also update docs if necessary"
- "save the work" / "commit" / "wrap this up and commit"
- "commit and clean up the docs"
- "ok push that out" *(but stop at commit — never push unless the user explicitly asks)*

Don't invoke when:
- The user wants only a docs change, not a commit.
- A merge conflict, rebase, or repaired-history operation is in flight.

## Steps

### 1. Survey the working tree

Run in parallel:

```
git status -s
git diff --stat
git log -5 --oneline
```

Read the diff stat to identify which files changed. Read the recent log to learn the project's
commit-message style — typically 1-line titles in the form `Theme1, theme2, theme3`
(comma-separated phrase per concern; match the existing case style).

If the working tree is clean, tell the user "Nothing to commit." and stop.

### 2. Decide what's been worked on

Group the diff into themes — each a coherent piece of work: a new feature, a bug fix, a
refactor, a migration, or a doc-only change. The commit title strings the themes together with
commas. Aim for 5–80 characters; under 70 is ideal, but the project tolerates longer when
several themes ship together.

### 3. Route each doc update to its correct home

This is the part that changed with the doc split. **Default to the domain skill.** Touch
`CLAUDE.md` only for genuinely always-on facts — re-bloating it defeats the whole point.

For each diff theme, route by what changed:

| What changed | Where it's documented |
|---|---|
| RPC, schema, RLS, trigger, edge function, TCGdex cache, coupon/raffle **data** logic, type regen | `database` skill |
| Customer screen, product tile/grid, search UI, cart UX, `/account`, `/rifas`, login dialog | `storefront` skill |
| Admin screen, add-product flow, image picker / PHP endpoint, coupons/raffles **admin** UI, config | `admin` skill |
| Brand utility class, palette/font/density change, Material override, the brand-red rule | `theme` skill |
| Deploy flow/flags, env tier, `.htaccess`, self-hosted images, the deploy guard | `deploy` skill |
| OpenCart import pipeline, category map, cutover steps, URL/301 strategy | `migration` skill |
| Screen-level behavior (UI anatomy, signals, service calls, edge cases, gotchas) | the matching `docs/screens/<area>/<screen>.md` (or `docs/architecture/<x>.md`) — see below |
| A **new domain skill** was created this session | add a row to `.claude/skills/README.md` **and** the skill index in `CLAUDE.md` |

**Always sweep the `docs/` tree.** For every screen or subsystem the diff touches, open its doc
(find it via the `docs/README.md` index) and:

- Fix facts the diff made stale — renamed signals/methods, changed RPC names or params, new/
  removed UI, changed copy, new query params or settings keys.
- **Prune Gotchas the commit fixed** and add new ones the change introduced.
- Bump the doc's "Verified against source on <date>" line to today.
- **New screen or route** → create a new doc following the same 9-section template as its
  siblings (Purpose · Route & access · Files · UI anatomy · Services & backend · State & data
  flow · Behaviors & edge cases · Gotchas / invariants · Related docs) **and** add a row to the
  `docs/README.md` index.
- **Removed screen** → delete its doc and its index row; fix any docs that linked to it.

Skills stay high-level; the `docs/` file is where exact identifiers live. If the diff is
backend-only, the sweep may land in `docs/architecture/` (data-model, backend-rpcs-and-functions,
commerce-flow…) instead of a screen doc.

Update **`CLAUDE.md` itself only** when the batch changes something always-on:

- A new project-wide **convention** (→ Conventions section).
- A new hard **guardrail** (and mirror it into the relevant skill — guardrails are intentionally
  duplicated).
- A new top-level route **category** or directory worth the high-level map.
- A **stack** change (new framework or major dependency).
- An item moving **on/off the "Out of scope" list** (e.g. checkout ships → drop it from the list).

Within whichever file you pick, refresh *only* the stale bits — describe it accurately for a
future Claude that's never seen this codebase, nothing more. Ask of a skill: does its body still
describe this domain correctly? If a `SKILL.md` body is creeping past ~500 lines, that's the
signal to split detail into a `references/` subfolder, **not** to cram more in.

**Don't update anything** for purely cosmetic tweaks, internal refactors that don't change
behavior, or one-off bug fixes that don't change the mental model. If no doc is stale after this
pass, that's a valid outcome — say "docs already match" in the summary and move on.

### 4. Refresh `README.md` only where the diff changes user-facing capability

The README documents what a user sees ("what a shopper can do", "what an admin can do") plus the
status checklist and command/route reference. Walk the themes and refresh **only**:

- A new customer-facing flow → mention it in the relevant section + flip its status line
  (⬜ → ✅) if it was tracked as pending.
- A new admin button / flow → mention it in the admin section.
- A new command, route, or env step → update the relevant table / `## Running` / `## Deploying`.

**Don't update README.md** for internal refactors, RLS migrations the user doesn't see, or
back-end-only optimizations. Some overlap with the skills is fine — README is for humans.

### 5. Stage explicit paths

Drive `git add` from `git status -s` with **specific filenames**, never `git add -A` / `git add .`.
Always exclude (unless the user asks otherwise):

- `.env*` files (could contain credentials)
- `.claude/settings.local.json`, `.vscode/`, `.mcp.json`, `.idea/` (local tooling)
- `*.zip`, `*.tar.gz` (backup archives — including any doc-restructure bundle)
- `supabase/.temp/`, `node_modules/`, `dist/`, `card-images/` (tooling state, build output, the
  gitignored image cache)
- Untracked top-level paths whose purpose is unclear, and any binary not part of the session's work

**Include** project docs the session changed: the slim `CLAUDE.md`, any edited
`.claude/skills/<name>/SKILL.md`, `.claude/skills/README.md`, `README.md`, and any
edited/created files under `docs/` — these are tracked, shared project files. New skills the session created at `.claude/skills/<feature>/SKILL.md` get
committed too. Downloaded marketplace skills can stay untracked unless the user wants them shared.

For tracked-modified files use `git add -u <path>` or list them; for new files, `git add <path>`
explicitly. After staging, run `git status -s` again and show the user the staged list before
committing.

### 6. Compose the commit message

Title: comma-separated themes in the project's case style (match `git log -5 --oneline`).

Body: short bullets explaining the *why* of each theme, not the *what* — preserve context the
diff doesn't show (motivation, follow-ups, why this approach). Use a HEREDOC:

```
git commit -m "$(cat <<'EOF'
<title>

- <theme 1>: <why> + <key files or shape>
- <theme 2>: <why>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Include the `Co-Authored-By` trailer when Claude wrote significant amounts of the diff.

### 7. Run the commit

Don't skip hooks (`--no-verify`) or bypass signing unless asked. If a pre-commit hook fails, the
commit didn't happen — fix the issue, re-stage if needed, run a fresh commit. **Never** `--amend`
after a hook failure (it would clobber the previous commit). On success, run
`git log -1 --stat | head -8` and report:

> Committed as `<short-sha>` on `<branch>` — `<files-changed-count>` files, `+<ins>/−<del>`.

### 8. Don't push

Even if the user said "ok push that out", stop at commit unless they explicitly typed `push` or
said "push to remote". Pushing is visible to others and force-pushes can't be undone — require
explicit authorization.

## Worked example (post-split)

User: "wrap this up and commit"

1. `git status -s` shows: a new migration adding the `orders` table + a `place_order_v8` tweak,
   a new `src/app/user/checkout/` component with a buyer-info form, SINPE Móvil instructions copy,
   and a small cart-page summary edit.
2. Themes: orders schema + place_order redemption, checkout screen + buyer form, SINPE instructions.
3. Route the docs:
   - **`database` skill** → add the `orders` table to the schema overview; bump the `place_order`
     version note (it already documents that RPC).
   - **`storefront` skill** → add the `/checkout` screen + buyer-info form + where SINPE
     instructions render; note the cart-page summary tweak.
   - **`CLAUDE.md`** → remove "Checkout" from the *Out of scope* list (it shipped). Nothing else
     in CLAUDE.md changes — resist touching it further.
   - **`docs/`** → create `docs/screens/storefront/checkout.md` from the sibling template + add
     its row to `docs/README.md`; update `docs/screens/storefront/cart-page.md` (summary tweak)
     and `docs/architecture/commerce-flow.md` + `docs/architecture/backend-rpcs-and-functions.md`
     (place_order v8); prune any gotcha this batch fixed.
   - **`README.md`** → add a shopper-facing checkout bullet; flip the ⬜ Checkout status line to ✅.
   - `theme` / `admin` / `deploy` / `migration` skills → untouched; the diff doesn't affect them.
4. Stage explicit paths: the migration, the checkout component files, the edited `database` +
   `storefront` SKILL.md, `CLAUDE.md`, `README.md`, and the touched `docs/` files. Exclude
   `.env.local`, `supabase/.temp/`, etc.
5. Title (project style): `Checkout: orders + place_order redemption, buyer form, SINPE instructions`.
   Body: 3 bullets on the why.
6. `git commit -m "$(cat <<'EOF' … EOF)"` succeeds.
7. Report the sha / stat. Don't push.
