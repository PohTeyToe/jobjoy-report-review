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

## Features

All planned phases shipped. The app is live at https://jobjoy-report-review.vercel.app/.

- Closed-shadow-DOM variant rendering with cross-variant normalization (`variant-normalize.css`).
- Click-to-drop pins with threaded comments and realtime sync.
- **Supabase Anonymous Auth** identity (`auth.signInAnonymously()`) — JWT persisted natively by the Supabase SDK. RLS on every `design_review.*` table enforces author-only writes via `auth.uid() = reviewer_id`.
- **Author-only delete with 5-second Undo** (trash chip on own pins/comments, single-instance toast).
- **Cross-author restore RPC** (`design_review.restore_pin_with_comments`) — SECURITY DEFINER, caller-author guarded, restores foreign-author replies under their original `reviewer_id`.
- `/admin/<secret>` triage dashboard with filters and CSV/markdown export.
- `/pick` surface for ranking the 6 variants with notes.
- PDF-style document chrome (`DocumentFrame.svelte`) with sticky title + live "Page X of N".

See `CLAUDE.md` for the migration ledger, gotchas, and architecture details.

### Document chrome (Phase 6)

`/review` now wraps the variant in a `DocumentFrame` component: off-white app background, white card capped at 8.5in (Letter width) with a subtle border + drop shadow, and a header bar showing the variant title and a live "Page X of N" indicator that updates as the user scrolls. Cross-variant fixes ride on `src/lib/variant-normalize.css`, injected as the first `<style>` inside the closed shadow root so per-variant rules still cascade on top — survives `pnpm sync-variants`.
