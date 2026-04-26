-- Phase: anon-auth + author-only delete (review followup)
--
-- The earlier `auth update pin resolved` policy used `using(true) with
-- check(true)` so any authenticated reviewer could trigger the resolve
-- toggle. That is broader than necessary: a reviewer could also issue
-- `update pins set x_pct=0, variant='other-slug' where id=...` on someone
-- else's pin and RLS would not object.
--
-- Tighten to author-only update. Cross-author resolve was a non-goal —
-- nobody on this project has asked for it. If it becomes needed later
-- the right pattern is a SECURITY DEFINER function (`resolve_pin(uuid)`)
-- that flips just `resolved_at`, not a permissive UPDATE policy.
--
-- Per Claude review #2.
--
-- Idempotent.

drop policy if exists "auth update pin resolved" on design_review.pins;

create policy "auth update own pin" on design_review.pins
  for update to authenticated
  using (reviewer_id = auth.uid())
  with check (reviewer_id = auth.uid());
