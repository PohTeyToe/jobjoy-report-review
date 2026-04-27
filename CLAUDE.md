# CLAUDE.md — jobjoy-report-review

Standalone pin-annotation webapp for reviewing 6 JobJoy Sample 1 report design variants.
Click anywhere on a variant, drop a comment, threads land in Supabase. Admin dashboard
triages feedback.

- GitHub: https://github.com/PohTeyToe/jobjoy-report-review
- Live: https://jobjoy-report-review.vercel.app/
- Source variants: https://github.com/PohTeyToe/jobjoy-design-experiments

## Quick commands

| Command                            | What it does                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `pnpm install`                     | Install deps (pnpm 9, Node 20)                                                                                |
| `pnpm sync-variants`               | Clone design-experiments into `.cache/`, stage variant HTML into `static/variants/`. Run before `pnpm build`. |
| `pnpm dev`                         | SvelteKit dev server                                                                                          |
| `pnpm run check`                   | svelte-kit sync + svelte-check (type check)                                                                   |
| `pnpm test`                        | Vitest unit tests (126 tests across 19 files)                                                                 |
| `pnpm exec playwright test --list` | Parse Playwright specs without running them (17 specs across 10 files)                                        |
| `pnpm run build`                   | Production build (adapter-static)                                                                             |

## Current state (post-Phase 6)

All planned phases shipped. App is live at https://jobjoy-report-review.vercel.app/ and
**not yet sent to George** — admin URL was rotated and the secret value lives outside
this repo (session-private; not in any doc, env file, or vercel.json checked into git).

### Architecture (current)

- **Identity:** Supabase Anonymous Auth. `auth.signInAnonymously()` on first visit; the
  Supabase JS SDK persists the JWT in localStorage natively. **No more hand-rolled
  localStorage UUID** — that was migrated out in PR #23.
- **`reviewers` table:** `id uuid` is FK'd to `auth.users(id)`. `getIdentity()` in
  `src/lib/identity.ts` reads `auth.getSession()` and looks up the row by `auth.uid()`.
- **RLS (post-#23):** every `design_review.*` table uses `to authenticated` for
  INSERT/UPDATE/DELETE, gated on `reviewer_id = auth.uid()`. SELECT remains broadly
  readable (anon + authenticated) so the admin secret URL and realtime subscriptions
  still work for unauthenticated reads.
- **Variant rendering:** closed shadow DOM via `src/lib/VariantRenderer.svelte`.
  Variant content is fetched at runtime from `static/variants/<slug>/index.html`.
- **Variant normalization:** `src/lib/variant-normalize.css` is injected as the **first**
  `<style>` in the shadow root. It enforces 8.5×11 Letter geometry, consistent
  margins, per-page borders, sticky title bar offsets across all 6 variants. Survives
  `pnpm sync-variants` because it lives in `src/lib/`, not `static/variants/`.
- **Document chrome:** `src/lib/DocumentFrame.svelte` wraps the renderer with PDF-style
  chrome (sticky title bar showing variant name + live "Page X of N" indicator).
- **Pin coord math:** `COORD_EPSILON = 1e-3` in `src/lib/pin-store.svelte.ts` because
  Postgres `real` (float4) truncates 64-bit JS coords by ~1e-6 on roundtrip. The temp →
  real-pin dedup matches within this tolerance. **Don't lower this constant.**
- **Delete UX:** trash chip on the author's own pins/comments, 5s Undo toast via
  `src/lib/UndoToast.svelte` (single-instance), realtime DELETE broadcast.
- **Cross-author restore RPC:** `design_review.restore_pin_with_comments(pin jsonb,
comments jsonb)`. SECURITY DEFINER. Inserts the pin and restores foreign-author
  comments using their original `reviewer_id`. Caller-author guard:
  `auth.uid() = (pin->>'reviewer_id')::uuid`. Comment `pin_id` always uses the local
  variable from the pin insert — **never trusts the client-supplied field** (HIGH
  cross-pin injection bug fixed pre-merge in PR #24 review).

### Migration ledger

The Supabase migration history table is **not authoritative** on this project — apply
migrations via the Management API, not `supabase db push`. Pattern:

```bash
curl -X POST https://api.supabase.com/v1/projects/kuvojgdateaosaeiqbbb/database/query \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @supabase/migrations/<file>.sql
```

The Phase 1 base schema (the `design_review` schema, `reviewers` / `pins` / `comments`
/ `variant_picks` tables, initial RLS) was applied directly via the Management API and
is **not in `supabase/migrations/`**. Files in that folder are incremental changes
since Phase 3:

| File                                                      | What it does                                                                                                                                                           |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260424211836_design_review_pins_update.sql`            | Phase 3: anon UPDATE on `pins` for the resolve/unresolve toggle (pre-anon-auth).                                                                                       |
| `20260424211837_design_review_grants.sql`                 | Schema USAGE + table-level GRANTs for anon + authenticated; record of PostgREST `db_schema` config change to include `design_review`.                                  |
| `20260424211838_design_review_picks_delete_policy.sql`    | DELETE policy on `variant_picks` so `/pick` resubmit (delete-then-insert) doesn't silently filter all rows.                                                            |
| `20260426000001_design_review_auth_uid_migration.sql`     | Migrate `reviewers.id` from server-generated uuid → `auth.uid()`. FK to `auth.users`.                                                                                  |
| `20260426000002_design_review_authenticated_rls.sql`      | Rewrite all `design_review.*` RLS from anon-permissive → `to authenticated` + `auth.uid()` checks. SELECT stays anon-readable.                                         |
| `20260426000003_design_review_replica_identity_full.sql`  | `REPLICA IDENTITY FULL` on `pins` + `comments`. Required so realtime DELETE events ship every column (without it, filtered DELETE subscriptions silently drop events). |
| `20260426000004_design_review_pin_update_author_only.sql` | Tighten the resolve-toggle policy from `using(true) with check(true)` → author-only `auth.uid() = reviewer_id`. PR #23 review follow-up.                               |
| `20260426000005_design_review_restore_pin_rpc.sql`        | `restore_pin_with_comments` SECURITY DEFINER RPC — full Undo for pins with cross-author replies. PR #24.                                                               |

### Critical gotchas

1. **Closed shadow DOM means `host.children.length === 0`** — by design. To verify a
   variant rendered, take a screenshot or click the host (composer popover triggers
   via `composedPath()`). Never assert on host children directly.
2. **CSS variables: `:root` → `:host` rewrite.** Variant stylesheets define color
   tokens on `:root`. Inside a closed shadow root `:root` matches nothing.
   `VariantRenderer.svelte` rewrites top-level `:root` selectors to `:host` when
   copying variant `<style>` content into the shadow root. **Don't remove this** —
   every variant's color tokens depend on it. (Discovered while debugging the
   taste-frontend p6 IPP diagram in PR #21 — the bug was actually present across all
   variants, just most visible there.)
3. **Migration ledger is unreliable.** Apply via Management API curl, never
   `supabase db push`. Push will replay files for migrations already applied to prod
   and fail with "already exists" errors.
4. **`PUBLIC_ADMIN_SECRET` is build-time** (`$env/static/public`). Must be set in
   **all three** Vercel environments (production, preview, development) AND as a
   GitHub Actions secret consumed by the deploy-preview workflow via
   `vercel pull --environment=preview`. If preview env is missing the secret, the
   workflow fails with `"PUBLIC_ADMIN_SECRET is not exported by virtual:env/static/public"`.
5. **`vercel env add ... preview` is interactive** (asks for branch). Add
   non-interactively via the REST API: `curl -X POST .../v10/projects/<id>/env` with
   `target: ["preview"]`.
6. **Husky hooks are mandatory.** Pre-push runs `pnpm run check && pnpm test`.
   Pre-commit runs prettier. **Never use `--no-verify`** per project rules.
7. **PR title commitlint** allows only the standard conventional-commit types:
   `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `ci`, `style`.
   `refine` is **not** allowed (caught the hard way mid-Phase-6).
8. **Anonymous Auth must be enabled at the project level.** Toggle via
   `PATCH /v1/projects/<id>/config/auth` with `external_anonymous_users_enabled: true`.
   Without it, `signInAnonymously()` returns 422.
9. **Variant content lives in a separate public repo** (`jobjoy-design-experiments`).
   `pnpm run sync-variants` clones/pulls into `.cache/` and stages
   `static/variants/`. **Never edit `static/variants/*/index.html` directly** —
   those edits get blown away on next sync. All cross-variant fixes go in
   `variant-normalize.css` (shadow-injected) instead.

## Workflow rules for agents

1. Create a feature branch from main: `git checkout -b feat/description`,
   `fix/description`, or `chore/description`.
2. Make changes, run `pnpm run check` and `pnpm test` to verify.
3. Commit and push: `git push -u origin <branch-name>`.
4. Create a PR via `gh pr create` — CI runs, Claude reviews the PR, Vercel posts a
   preview URL.
5. Check CI: `gh pr checks <pr-number>` — fix any failures.
6. Read Claude's review: `gh pr view <pr-number> --comments` — address feedback if
   needed.
7. If you pushed code changes after the review, comment `@claude please re-review
this PR` and wait for the updated review.
8. Merge when green: `gh pr merge <pr-number> --squash --delete-branch`.

Never push directly to main — except for **docs-only changes** (`.md` files, no
code).

### Mandatory playwright loop for any UI change

The user has zero tolerance for "I addressed it via stylesheet" claims without
browser evidence. Every UI fix needs a BEFORE/AFTER screenshot pair. Save to
`.tmp-<feature>/before/` and `.tmp-<feature>/after/`. These dirs should be
gitignored.

### Test data hygiene

- **Per-session prefix:** use `<feature-name>-test-` as the reviewer-name prefix.
- **End-of-sweep cleanup:** `delete from auth.users where id in (select id from
design_review.reviewers where name like '<prefix>-%')` — the cascade clears the
  design_review tables too.
- **Cross-tab tests** (realtime, cross-author flows, spoof rejection) need
  **separate playwright-cli sessions** (`-s session-A`, `-s session-B`). Same
  browser tabs share localStorage and therefore share `auth.uid()`.

## CI/CD

Full pipeline documented in `.github/CI_CD.md`. Workflows: `ci.yml` (test+build),
`claude-review.yml` (AI review), `codeql.yml` (security), `commit-lint.yml`,
`review-reminder.yml`, `vercel-preview.yml`, plus Dependabot. Secrets:
`CLAUDE_CODE_OAUTH_TOKEN`, `VERCEL_TOKEN`, `PUBLIC_ADMIN_SECRET`,
`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`.
