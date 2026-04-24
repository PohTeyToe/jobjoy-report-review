# CI/CD Pipeline Documentation

Complete reference for all GitHub Actions workflows, secrets, and troubleshooting for
`jobjoy-report-review`.

## Workflows Overview

| Workflow        | File                  | Triggers                     | Purpose                                                  |
| --------------- | --------------------- | ---------------------------- | -------------------------------------------------------- |
| CI              | `ci.yml`              | push to main, PR             | Type check + unit tests + playwright parse + smoke build |
| Claude Review   | `claude-review.yml`   | PR open/reopen + `@claude`   | AI code review                                           |
| CodeQL          | `codeql.yml`          | PR + weekly (Monday 6am UTC) | Security scanning (javascript-typescript)                |
| Commit Lint     | `commit-lint.yml`     | PR title                     | Conventional commit enforcement                          |
| Review Reminder | `review-reminder.yml` | PR synchronize               | Stale review detection                                   |
| Vercel Preview  | `vercel-preview.yml`  | PR (frontend paths)          | Preview deploy URLs on PRs                               |
| Dependabot      | `dependabot.yml`      | Weekly schedule              | Dependency updates                                       |

All workflows use concurrency groups — pushing new commits to a PR branch cancels
in-progress runs (except Claude review, which completes).

---

## ci.yml — Build & Test

Runs on every push to `main` and every PR targeting `main`. Steps:

1. `pnpm install --frozen-lockfile`
2. `pnpm run check` (svelte-kit sync + svelte-check)
3. `pnpm test` (vitest unit)
4. `pnpm exec playwright test --list` — verifies E2E specs parse. Full browser run is
   deferred to phase 6 (needs `playwright install --with-deps` which is slow).
5. `pnpm run build` — smoke check that the SvelteKit graph typechecks and bundles.
   Uses placeholder `PUBLIC_SUPABASE_URL`/`PUBLIC_SUPABASE_ANON_KEY`/`PUBLIC_ADMIN_SECRET`
   so `$env/static/public` imports resolve. The build output is discarded.

---

## claude-review.yml — AI Code Review

### Configuration

- Review + auto-review via `anthropics/claude-code-action@v1` (Opus)
- Intent classifier via Claude CLI (`claude-haiku-4-5-20251001`)

### Jobs

1. `classify` — Haiku classifier on `@claude` comments, outputs `review` or `assist`
2. `auto-review` — runs on PR open/reopen with full `REVIEW_PROMPT`
3. `claude-review` — runs when classifier picks `review`
4. `claude-assist` — runs when classifier picks `assist`
5. `claude-review-assist` — `@claude` in inline review comments

### Usage

- Auto review: opens automatically on new PRs
- Ask a question: `@claude <your question>`
- Re-review after changes: `@claude please re-review this PR`

### Troubleshooting

| Problem                          | Fix                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| Review not posted                | Check Actions tab. Ensure prompt includes `gh pr comment` posting instructions             |
| `401 Workflow validation failed` | Workflow must exist on `main` with identical content. Push to main first, rebase PR branch |
| Review takes 15+ minutes         | Ensure `Bash(git diff:*)` and `Bash(git log:*)` are in the tool allowlist                  |
| Classifier always returns assist | Check `classify` job logs for Claude CLI install errors                                    |

---

## Secrets Reference

| Secret                    | Purpose                                                | Source                      |
| ------------------------- | ------------------------------------------------------ | --------------------------- |
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude Code OAuth for PR review bot + Haiku classifier | Shell env `$CC_OAUTH_TOKEN` |
| `VERCEL_TOKEN`            | Vercel CLI preview deploys                             | Shell env `$VERCEL_TOKEN`   |

Note: `ANTHROPIC_API_KEY` is NOT required. The classifier uses the Claude CLI with the
OAuth token. The `CLAUDE_CODE_OAUTH_TOKEN` secret is set from `$CC_OAUTH_TOKEN` (the
user's global CLAUDE.md renames it to avoid Claude Code auto-detection).

Set with:

```
printf '%s' "$CC_OAUTH_TOKEN" | gh secret set CLAUDE_CODE_OAUTH_TOKEN
printf '%s' "$VERCEL_TOKEN" | gh secret set VERCEL_TOKEN
```

---

## Dependabot

Automated dependency update PRs for:

- `github-actions` — weekly (Monday), max 3 open PRs
- `npm` (pnpm lockfile) — weekly (Monday), max 5 open PRs

PRs are auto-labeled (`dependencies` + `ci`/`frontend`) for easy filtering.

---

## vercel-preview.yml — Frontend Preview Deploys

### Triggers

PRs targeting `main` with changes to `src/**`, `static/**`, `scripts/**`, `*.ts`, `*.js`,
`package.json`, `pnpm-lock.yaml`, `svelte.config.js`, `vite.config.ts`, `vitest.config.ts`,
`tsconfig.json`, `vercel.json`, or the workflow file itself.

### How it works

1. Resets git author to repo owner (Vercel Hobby plan requirement)
2. `pnpm install --frozen-lockfile`
3. `pnpm sync-variants` — stages variant HTML into `static/variants/` (required before build)
4. `vercel pull` → `vercel build` → `vercel deploy --prebuilt`
5. Posts/updates a "Preview Deploy" PR comment with URL, deployment history, build logs

### Troubleshooting

| Problem                      | Fix                                                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Build fails                  | Check build logs in the PR comment `<details>` section                                                           |
| Variants missing in preview  | Ensure `pnpm sync-variants` succeeded — check the source repo `PohTeyToe/jobjoy-design-experiments` is reachable |
| No preview URL               | Check if `VERCEL_TOKEN` secret is valid. Regenerate at vercel.com/account/tokens                                 |
| "Commit author not a member" | The reset-author step didn't run. Check Actions log                                                              |

---

## codeql.yml — Security Scanning

### Triggers

- Push to `main`
- PRs targeting `main`
- Weekly schedule: Monday 6am UTC

### Jobs

Single job: `analyze-javascript` for `javascript-typescript`. No build step needed.
Results appear in the Security tab of the repository.

---

## commit-lint.yml — Conventional Commits

Validates PR titles match conventional commit format. Enforced types:
`feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `ci`, `style`.
PR title must be 72 characters or fewer.

---

## review-reminder.yml — Review Freshness

Fires on PR `synchronize`. If commits land after the last Claude review, sets a pending
commit status and posts a reminder to comment `@claude please re-review this PR`.
