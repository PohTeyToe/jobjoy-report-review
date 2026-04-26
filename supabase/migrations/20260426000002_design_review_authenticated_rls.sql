-- Phase: anon-auth + author-only delete
--
-- Rewrite RLS on every design_review.* table from the old anon-permissive
-- model to an authenticated + auth.uid() model. SELECT remains broadly
-- readable (anon + authenticated) so:
--   (a) the admin secret-URL surface — which uses the anon JWT — keeps
--       reading every reviewer's pins/picks/comments, and
--   (b) realtime broadcasts continue reaching subscribers, which Supabase
--       Realtime gates on SELECT permission.
--
-- Author-only INSERT/UPDATE/DELETE ensures one anon user can't mutate
-- another's content even by hand-crafting REST calls — RLS rejects the
-- write when reviewer_id != auth.uid().
--
-- Wrapped in a single transaction. If any policy create fails, the whole
-- migration rolls back, leaving prod policies unchanged.

begin;

-- ============================================================================
-- reviewers
-- ============================================================================
drop policy if exists "anon insert reviewers"        on design_review.reviewers;
drop policy if exists "anon read reviewers"          on design_review.reviewers;
drop policy if exists "anon update reviewers last_seen" on design_review.reviewers;

-- Self-insert only: client must set id = auth.uid().
create policy "auth insert own reviewer" on design_review.reviewers
  for insert to authenticated
  with check (id = auth.uid());

-- Everyone (incl. unauthenticated admin-secret-URL session) can read names.
create policy "public read reviewers" on design_review.reviewers
  for select to anon, authenticated
  using (true);

-- Self-update only (last_seen_at, name).
create policy "auth update own reviewer" on design_review.reviewers
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ============================================================================
-- pins
-- ============================================================================
drop policy if exists "anon insert pins"           on design_review.pins;
drop policy if exists "anon read pins"             on design_review.pins;
drop policy if exists "anon update pins resolved"  on design_review.pins;

create policy "auth insert own pin" on design_review.pins
  for insert to authenticated
  with check (reviewer_id = auth.uid());

create policy "public read pins" on design_review.pins
  for select to anon, authenticated
  using (true);

-- UPDATE allowed for anyone authenticated — this is the resolve toggle.
-- Pins can be resolved by reviewers other than the original author (a
-- design choice — peer-resolve is fine in a small review group). If we
-- ever want author-only resolve, tighten this to reviewer_id = auth.uid().
create policy "auth update pin resolved" on design_review.pins
  for update to authenticated
  using (true)
  with check (true);

-- NEW: author-only delete.
create policy "auth delete own pin" on design_review.pins
  for delete to authenticated
  using (reviewer_id = auth.uid());

-- ============================================================================
-- comments
-- ============================================================================
drop policy if exists "anon insert comments" on design_review.comments;
drop policy if exists "anon read comments"   on design_review.comments;

create policy "auth insert own comment" on design_review.comments
  for insert to authenticated
  with check (reviewer_id = auth.uid());

create policy "public read comments" on design_review.comments
  for select to anon, authenticated
  using (true);

-- NEW: author-only delete.
create policy "auth delete own comment" on design_review.comments
  for delete to authenticated
  using (reviewer_id = auth.uid());

-- ============================================================================
-- variant_picks
-- ============================================================================
drop policy if exists "anon insert picks" on design_review.variant_picks;
drop policy if exists "anon read picks"   on design_review.variant_picks;
drop policy if exists "anon delete picks" on design_review.variant_picks;

create policy "auth insert own pick" on design_review.variant_picks
  for insert to authenticated
  with check (reviewer_id = auth.uid());

create policy "public read picks" on design_review.variant_picks
  for select to anon, authenticated
  using (true);

create policy "auth delete own pick" on design_review.variant_picks
  for delete to authenticated
  using (reviewer_id = auth.uid());

commit;
