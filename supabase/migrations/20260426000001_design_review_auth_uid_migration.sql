-- Phase: anon-auth + author-only delete
--
-- Migrate `design_review.reviewers.id` from a server-generated uuid to the
-- caller's `auth.uid()`. After this runs, every reviewer row is FK-linked to
-- a real `auth.users` row (an anonymous-auth user). RLS in the next migration
-- enforces author-only INSERT/UPDATE/DELETE on top of this.
--
-- Rollout strategy:
--   1. wipe ALL design_review.* row-data — this project hasn't shipped to
--      real reviewers yet (only George's pre-auth placeholder + a leftover
--      polish-r2-tester row). Confirmed by the user.
--   2. drop the auto-generating default on reviewers.id.
--   3. add the FK reviewers.id -> auth.users.id ON DELETE CASCADE.
--      Cascade so deleting an auth.users row (e.g. compliance request) also
--      removes the reviewer row, which cascades through pins/comments/picks.
--
-- Idempotent: safe to re-run — uses `if exists` / `if not exists` guards and
-- wraps the destructive truncate in a single transaction so a partial
-- failure rolls back atomically. Postgres DDL is transactional.

begin;

-- 1. Wipe all row-data. ON DELETE CASCADE on existing FKs (pins.reviewer_id,
-- comments.reviewer_id, variant_picks.reviewer_id) handles the cleanup.
truncate table design_review.reviewers cascade;

-- 2. Drop the gen_random_uuid() default on the id column. The id MUST be
-- supplied by the client (= auth.uid()) at insert time.
alter table design_review.reviewers
  alter column id drop default;

-- 3. Add FK to auth.users(id). Drop first if it already exists so re-runs
-- of this migration don't blow up on a duplicate constraint name.
alter table design_review.reviewers
  drop constraint if exists reviewers_id_fkey_auth_users;

alter table design_review.reviewers
  add constraint reviewers_id_fkey_auth_users
  foreign key (id) references auth.users(id) on delete cascade;

commit;
