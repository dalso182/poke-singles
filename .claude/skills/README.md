# Claude Code skills — Poke-Singles

This directory holds **project skills**: focused reference docs Claude Code loads
*on demand* when a task matches, instead of carrying everything in context all the time.

## Why this exists

`CLAUDE.md` (repo root) is injected into **every** Claude Code turn, so it's kept lean —
stack, conventions, the two hard guardrails, a directory map, and an index pointing here.
Everything domain-specific lives in the skills below and loads only when relevant. This keeps
the always-on context small (~1.5k tokens instead of ~8.5k) so more of the window is free for
actual work.

Rule of thumb: **CLAUDE.md = always true / always needed. A skill = true only sometimes.**

## The skills

| Skill | Covers | Reach for it when… |
|---|---|---|
| `database` | Supabase/Postgres data layer: schema, RLS + `is_admin()`, migrations, RPCs (search, coupons, place_order, draw_raffle), edge functions, TCGdex cache, type regen | You touch anything below the UI — even UI-shaped questions whose answer is a view, RPC, or policy |
| `storefront` | Customer UI (UserShell): home rails, product card + grids, `/buscar` search UI, hover preview, cart drawer/page, `/account`, `/rifas`, login dialog | You change anything a shopper sees |
| `admin` | `/admin` panel (adminGuard): product CRUD + add-product TCGdex flow, image picker + PHP endpoints, categories/card-types/sets, coupons admin, raffles admin + draw, config | You work on a back-office screen |
| `theme` | Vault Light brand system: `src/styles/`, palette, fonts, density, Material overrides, the brand-red rule, `/library` | You touch styling, color, typography, or component appearance |
| `deploy` | SiteGround SFTP deploy, env tiers, `.htaccess`, self-hosted card images, the deploy guard, SPA-only constraint | You ship the app or its assets, or wrangle environments |
| `migration` | OpenCart 3.0 → Supabase import, category map, match pipeline, cutover prep, URL/301 strategy | You import legacy data or plan cutover |

Skills cross-reference each other (e.g. a coupon's RPC contract is in `database`; its admin
form is in `admin`; its customer apply/remove UX is in `storefront`). When a task spans layers,
more than one may load.

### Workflow skills (not domain reference)

| Skill | Does | Triggers on |
|---|---|---|
| `commit-and-document` | Wrap-up routine: refresh stale docs (routing each change to the right skill / `CLAUDE.md` / `README.md`), stage explicit paths, compose a thematic commit, and commit (never pushes) | "commit", "wrap up", "save progress" |

`commit-and-document` is the skill that keeps this whole structure current: its doc-refresh step
knows the layout above and routes each diff theme to its correct home, defaulting to the domain
skill and touching the slim `CLAUDE.md` only for always-on facts. If you add or rename a domain
skill, update that skill's routing table too.

## How a skill gets used

Claude Code reads each skill's `name` + `description` (the YAML frontmatter) into context and
auto-invokes the matching one when a task fits. The descriptions are written slightly "pushy"
on purpose, because the current tendency is to *under*-trigger skills. If a skill isn't kicking
in when it should, edit its `description` — that's the trigger, not the body.

## Adding or changing a skill

- One directory per skill; the folder name is the skill name. The doc must be `SKILL.md`.
- Frontmatter needs `name` and `description`. Put **all** "when to use this" guidance in
  `description`; keep the body to *what it covers / how things work*.
- Keep a `SKILL.md` body under ~500 lines. If it grows past that, split detail into a
  `references/` subfolder and point to it from `SKILL.md`.
- You can bundle helper `scripts/` alongside a `SKILL.md` if a workflow has repeatable commands.
- After editing, start a fresh Claude Code session (or check `/context`) so changes register.

## Guardrails are duplicated on purpose

The brand-red rule and the "never deploy to the live OpenCart root" rule live in **both**
`CLAUDE.md` and their skills (`theme`, `deploy`). That's intentional: they must stay visible
even on turns where the relevant skill hasn't loaded. Don't "deduplicate" them.

## Relationship to README.md

The repo `README.md` is for humans (setup, status, command reference) and is read on demand,
so it doesn't cost Claude context. There's some intentional overlap with these skills; if you
ever want them in sync, trim the README's deep sections and point at the skills the way
`CLAUDE.md` does.
