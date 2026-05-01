---
name: commit-and-document
model: haiku
description: Use when the user asks to "commit work and update readme/claude file if necessary", "wrap up", "save progress", or any phrasing that implies "I'm done with this batch of changes — commit them and refresh docs if they're stale". Reviews the working tree, updates README.md / CLAUDE.md only where the diff actually changes user-facing or architecturally-relevant behavior, stages explicit paths (never `git add -A`), composes a thematic commit message in the project's style, and creates the commit. Skips when the user only asks for a docs update without a commit, or wants to commit without docs review.
---

# commit-and-document

Wrap-up routine for "I'm done with this slice of work — commit it cleanly." Two halves:

1. **Doc refresh.** Read the diff, decide what (if anything) in `README.md` and `CLAUDE.md` is now stale, and update *only* those bits. Skip docs that don't change because of this batch.
2. **Targeted commit.** Stage explicit paths to keep `.env.local`, build artifacts, IDE config, and other clutter out. Compose a 1-line title in the project's existing style, plus a short bulleted body explaining the *why*.

## When to invoke

- "commit work, also update README and CLAUDE.md if necessary"
- "save the work"
- "commit"
- "wrap this up and commit"
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

Read the diff stat to identify which files changed. Read the recent log to learn the project's commit-message style — tend to be 1-line titles in the form `Theme1, theme2, theme3` (comma-separated phrase per concern; lowercase or sentence-case depending on existing style).

If the working tree is clean (no staged, modified, or untracked files), tell the user "Nothing to commit." and stop.

### 2. Decide what's been worked on

Group the diff into themes. Each theme corresponds to a coherent piece of work:

- A new feature (e.g., "image upload on school logo").
- A bug fix (e.g., "fix matter-create silent-bail").
- A refactor (e.g., "extract sticker grid into shared component").
- A migration (e.g., "teacher role RLS").
- A doc-only change.

The commit title strings the themes together with commas. Aim for 5–80 characters; under 70 is ideal but the project tolerates longer when several themes ship together.

### 3. Refresh `CLAUDE.md` only where the diff changes architecture

Walk through each diff theme and ask: *does CLAUDE.md still describe this accurately for a future Claude that's never seen this codebase?* Refresh **only** these:

- A new RPC was added → add it to the RPC list with its security model + powering UI.
- A new screen / route was added → add it to the route map.
- A capability was added or a role's set changed → update the Roles + capabilities section.
- A new SQL helper / RLS pattern landed → update the Role helpers bullet.
- Trigger renames or behavior changes → reflect in the trigger bullet.
- An existing flow's user-facing language changed → keep the description in sync.

**Don't update CLAUDE.md** for purely cosmetic SCSS tweaks, internal refactors that don't change behavior, or one-off bug fixes that don't change the mental model.

### 4. Refresh `README.md` only where the diff changes user-facing capability

The README documents user-facing concerns ("what a student can do", "what an admin can do"). Walk through diff themes and ask: *does the README still describe what the user sees?* Refresh **only** these:

- A new admin button / flow → mention it in the relevant `**Section** —` bullet.
- A new role with admin access → mention what they can/can't do.
- A new content concept (reward set, capability) → add to the appropriate section.
- A deploy / setup step changed → update `## Running locally` or `## Deploying`.

**Don't update README.md** for internal refactors, RLS migrations the user doesn't see, capability-cap renames if behavior is unchanged, or back-end-only optimizations.

If both files are unchanged after this pass, that's a perfectly valid outcome — say "docs already match" in the commit summary and move on.

### 5. Stage explicit paths

Use `git status -s` output to drive `git add` calls with **specific filenames**, not `git add -A` or `git add .`. Always exclude (unless the user asks otherwise):

- `.env*` files (could contain credentials)
- `.agents/`, `.claude/settings.local.json`, `.vscode/`, `.mcp.json`, `.idea/` (local tooling)
- `*.zip`, `*.tar.gz` (backup archives)
- `supabase/.temp/`, `node_modules/`, `dist/`, `.next/`, `out/` (tooling state and build artifacts)
- `web/`, untracked top-level paths whose purpose is unclear
- Any binary that wasn't part of the session's work

For tracked-modified files, prefer `git add -u <path>` per file or just listing them; for new files, `git add <path>` explicitly.

If the user has untracked files in `.claude/skills/<feature>/SKILL.md` that the session created, **include** them — they're project-level reusable skills, not local config. Existing `.claude/skills/<downloaded>/` (e.g., from the Anthropic skill marketplace) can be left untracked unless the user has signaled they want them shared.

After staging, run `git status -s` again to verify the staged set is what you intended. Show the user the staged list before committing.

### 6. Compose the commit message

Title: comma-separated themes, in the project's existing case style. Read recent commits with `git log -5 --oneline` to match — typically Title-cased or sentence-case.

Body: short bullets explaining the *why* of each theme, not the *what*. The diff already shows what; the message should preserve context the diff doesn't (motivation, follow-up steps, why this approach over alternatives if it's interesting).

Use a HEREDOC for the body (multi-line):

```
git commit -m "$(cat <<'EOF'
<title>

- <theme 1>: <why> + <key files or shape>
- <theme 2>: <why>
- <theme 3>: <why>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Always include the `Co-Authored-By` trailer when Claude wrote significant amounts of the diff.

### 7. Run the commit

Don't skip hooks (`--no-verify`) and don't bypass signing unless the user explicitly asked. If a pre-commit hook fails, the commit didn't happen — fix the underlying issue, re-stage if needed, and run a fresh commit. **Never** use `--amend` after a hook failure (it would clobber the previous commit).

After commit succeeds, run `git log -1 --stat | head -8` to confirm and report:

> Committed as `<short-sha>` on `<branch>` — `<files-changed-count>` files, `+<insertions>/−<deletions>`.

### 8. Don't push

Even if the user said "ok push that out", stop at commit unless they explicitly typed `push` or said "push to remote". Pushing is visible to others and can't be undone for force-pushes; require explicit authorization per the project's safety protocol.

## Worked example

User: "commit work, also update README and CLAUDE.md if necessary"

1. `git status -s` shows 30 modified + 15 new files spanning a teacher-role RLS migration, a new image-upload flow, a new user-detail tab, and the danger-zone refactor.
2. Themes: teacher caps + RLS, image upload (question + logo), sticker progress tab, user delete + reset reorg, Luigi/Yoshi seed.
3. CLAUDE.md needs: new RPC entries (`reset_user_data`, `admin_user_owned_stickers`, `admin_user_owned_stickers`), Roles + capabilities (teacher slice + `users.delete`), upload-bucket paragraph in Reward pipeline section.
4. README.md needs: Users bullet (mention Eliminar + Recompensas tab; remove the row-level Reset reference), Schools bullet (mention Subir for logo).
5. Stage list excludes `supabase/.temp/cli-latest`, `.claude/settings.local.json`, `web/`, and any unrelated `.png` icon files; includes the new skill at `.claude/skills/add-stickers-from-folder/SKILL.md`.
6. Title: `Teacher role, image upload, user delete + reset, sticker tab, Nintendo +Luigi/Yoshi`. Body: 5 bullets, one per theme, explaining the why.
7. `git commit -m "$(cat <<'EOF' … EOF)"` succeeds. Commit shipped.
8. Don't push.
