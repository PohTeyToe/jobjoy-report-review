# JobJoy Report Review

[![CI](https://github.com/PohTeyToe/jobjoy-report-review/actions/workflows/ci.yml/badge.svg)](https://github.com/PohTeyToe/jobjoy-report-review/actions/workflows/ci.yml)
[![CodeQL](https://github.com/PohTeyToe/jobjoy-report-review/actions/workflows/codeql.yml/badge.svg)](https://github.com/PohTeyToe/jobjoy-report-review/actions/workflows/codeql.yml)
[![Claude Review](https://github.com/PohTeyToe/jobjoy-report-review/actions/workflows/claude-review.yml/badge.svg)](https://github.com/PohTeyToe/jobjoy-report-review/actions/workflows/claude-review.yml)

Standalone pin-annotation webapp for reviewing the six JobJoy Sample 1 report design variants. Click anywhere on a page, drop a comment, everything lands in Supabase. Admin dashboard triages feedback.

## Stack

- SvelteKit 2 + Svelte 5 + TypeScript
- Tailwind v4 (CSS-first config)
- `@supabase/supabase-js` — schema `design_review` in the shared JobJoy Supabase project
- `adapter-static` → Vercel
- Vitest + Playwright, wired into CI

## Dev

```bash
pnpm install
pnpm sync-variants   # clones PohTeyToe/jobjoy-design-experiments into .cache/ and stages static/variants/
pnpm dev
```

## Environment

Copy `.env.example` to `.env.local`. Real values live in Vercel project envs.

| Var                        | What                                        |
| -------------------------- | ------------------------------------------- |
| `PUBLIC_SUPABASE_URL`      | JobJoy Supabase URL                         |
| `PUBLIC_SUPABASE_ANON_KEY` | Anon key (public-safe; RLS enforces access) |
| `PUBLIC_ADMIN_SECRET`      | URL-secret gate for `/admin/<secret>`       |

## Phases

Phase 0 — scaffold. Phases 1-5: variant rendering → identity + pins → threads + realtime → admin dashboard → pick surface. Phase 6 (this PR): pre-George polish — PDF-style document chrome around the variant render, shadow-injected normalization stylesheet, empty/loading/error states on every surface, focus-trap + retry buttons, deep-routes regression spec.

### Document chrome (Phase 6)

`/review` now wraps the variant in a `DocumentFrame` component: off-white app background, white card capped at 8.5in (Letter width) with a subtle border + drop shadow, and a header bar showing the variant title and a live "Page X of N" indicator that updates as the user scrolls. Cross-variant fixes ride on `src/lib/variant-normalize.css`, injected as the first `<style>` inside the closed shadow root so per-variant rules still cascade on top — survives `pnpm sync-variants`.
