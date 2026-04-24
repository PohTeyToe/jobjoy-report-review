-- Phase 3: allow anon reviewers to update pins (resolve / unresolve threads).
--
-- Phase 1 created INSERT + SELECT policies on design_review.pins for the anon
-- role, but UPDATE was deliberately omitted because pins were treated as
-- append-only at that point. Phase 3 adds a "Resolve thread" toggle, which
-- mutates pins.resolved_at, so anon needs UPDATE permission.
--
-- This is intentionally permissive (mirrors the rest of the design_review
-- schema, which is anon-writable while we're in invite-only review mode and
-- behind an unguessable URL). When we later promote to authenticated reviewer
-- accounts, all four tables tighten together.

create policy "anon update pins resolved" on design_review.pins
  for update to anon using (true) with check (true);
