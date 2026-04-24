# CLAUDE.md — jobjoy-report-review

Standalone pin-annotation webapp for reviewing 6 JobJoy Sample 1 report design variants.
Click anywhere on a variant, drop a comment, threads land in Supabase. Admin dashboard
triages feedback.

- GitHub: https://github.com/PohTeyToe/jobjoy-report-review
- Vercel: (set once first deploy completes)
- Source variants: https://github.com/PohTeyToe/jobjoy-design-experiments

## Quick commands

| Command                            | What it does                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `pnpm install`                     | Install deps (pnpm 9, Node 20)                                                                                |
| `pnpm sync-variants`               | Clone design-experiments into `.cache/`, stage variant HTML into `static/variants/`. Run before `pnpm build`. |
| `pnpm dev`                         | SvelteKit dev server                                                                                          |
| `pnpm run check`                   | svelte-kit sync + svelte-check (type check)                                                                   |
| `pnpm test`                        | Vitest unit tests                                                                                             |
| `pnpm exec playwright test --list` | Parse Playwright specs without running them                                                                   |
| `pnpm run build`                   | Production build (adapter-static)                                                                             |

## Development workflow (agents must follow)

1. Create a feature branch from main: `git checkout -b feat/description`, `fix/description`, or `chore/description`
2. Make changes, run `pnpm run check` and `pnpm test` to verify
3. Commit and push: `git push -u origin <branch-name>`
4. Create a PR via `gh pr create` — CI runs, Claude reviews the PR, Vercel posts a preview URL
5. Check CI: `gh pr checks <pr-number>` — fix any failures
6. Read Claude's review: `gh pr view <pr-number> --comments` — address feedback if needed
7. If you pushed code changes after the review, comment `@claude please re-review this PR` and wait for the updated review
8. Merge when green: `gh pr merge <pr-number> --squash --delete-branch`

Never push directly to main — except for **docs-only changes** (`.md` files, no code).

PR titles must follow conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `perf:`, `ci:`, `style:`

## CI/CD

Full pipeline documented in `.github/CI_CD.md`. Workflows: `ci.yml` (test+build),
`claude-review.yml` (AI review), `codeql.yml` (security), `commit-lint.yml`,
`review-reminder.yml`, `vercel-preview.yml`, plus Dependabot. Secrets:
`CLAUDE_CODE_OAUTH_TOKEN`, `VERCEL_TOKEN`.

## Phase roadmap

- **Phase 0** — Scaffold (SvelteKit + Tailwind v4 + Vitest + Playwright + variant sync + CI/CD). DONE.
- **Phase 1** — Variant rendering in Shadow DOM, route `/variants/[slug]`.
- **Phase 2** — Identity (localStorage name) + click-to-drop pin creation, persisted to Supabase.
- **Phase 3** — Pin threads (replies) + realtime subscriptions.
- **Phase 4** — Admin dashboard at `/admin/<secret>`, triage + resolve flows.
- **Phase 5** — Pick surface (George picks winning variant / variant-element combos).
- **Phase 6** — Pre-George polish: full Playwright E2E in CI, a11y pass, copy review.
