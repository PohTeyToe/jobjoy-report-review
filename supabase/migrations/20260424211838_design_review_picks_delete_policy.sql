-- /pick resubmit deletes the reviewer's prior 6 rows then inserts fresh rows.
-- Without this DELETE policy on variant_picks, anon-role DELETE silently
-- filters all rows (Postgres RLS behaviour) and resubmits accumulate
-- duplicate rows. Caught by live-site QA after Phase 5 ship.

create policy "anon delete picks" on design_review.variant_picks
  for delete to anon using (true);
