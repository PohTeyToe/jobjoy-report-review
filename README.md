# JobJoy Report Review

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

Phase 0 — scaffold (this commit). Phases 1–6: variant rendering → identity + pins → threads + realtime → admin dashboard → pick surface → pre-George polish. See the handoff plan in the originating agent session for the full spec.
