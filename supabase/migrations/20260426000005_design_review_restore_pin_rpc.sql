-- Phase: v2 follow-up — secure restore RPC for full Undo on cross-author threads.
--
-- Problem this solves
-- -------------------
-- The author-only RLS on `design_review.comments` says:
--     for insert to authenticated with check (reviewer_id = auth.uid())
-- which means the deleting user (the pin author) cannot restore foreign
-- comments authored by *other* reviewers when they undo a pin delete. The
-- client previously logged a warning and partially restored (pin + own
-- replies only), losing every reply from another reviewer.
--
-- Solution
-- --------
-- A SECURITY DEFINER function that runs as the function owner (postgres,
-- which bypasses RLS), with an explicit guard:
--   * The caller MUST be the pin's original author (input pin.reviewer_id
--     equals auth.uid()), otherwise we raise. This preserves the
--     "author-only delete/restore" invariant — no other reviewer can use
--     this function to inject rows on someone else's pin.
--
-- Inputs are jsonb so the client can ship the snapshot it already has from
-- `deletePin()` without needing matching SQL types. The function maps the
-- known columns and ignores extras.
--
-- Idempotent: `create or replace function`.

create or replace function design_review.restore_pin_with_comments(
  pin jsonb,
  comments jsonb
) returns uuid
language plpgsql
security definer
-- Lock down search_path so a malicious caller can't shadow design_review
-- objects via session search_path manipulation.
set search_path = design_review, pg_temp
as $$
declare
  caller uuid := auth.uid();
  pin_author uuid := nullif(pin->>'reviewer_id', '')::uuid;
  pin_id uuid;
begin
  if caller is null then
    raise exception 'restore_pin_with_comments: not authenticated';
  end if;
  if pin_author is null then
    raise exception 'restore_pin_with_comments: pin.reviewer_id is required';
  end if;
  if pin_author <> caller then
    raise exception 'restore_pin_with_comments: caller % is not the pin author %', caller, pin_author;
  end if;

  insert into design_review.pins (
    id, variant, page_index, x_pct, y_pct, reviewer_id, resolved_at, created_at
  )
  values (
    nullif(pin->>'id', '')::uuid,
    pin->>'variant',
    (pin->>'page_index')::int,
    (pin->>'x_pct')::real,
    (pin->>'y_pct')::real,
    pin_author,
    nullif(pin->>'resolved_at', '')::timestamptz,
    coalesce(nullif(pin->>'created_at', '')::timestamptz, now())
  )
  returning id into pin_id;

  if comments is not null and jsonb_typeof(comments) = 'array' then
    insert into design_review.comments (
      id, pin_id, reviewer_id, body, created_at
    )
    select
      nullif(c->>'id', '')::uuid,
      coalesce(nullif(c->>'pin_id', '')::uuid, pin_id),
      nullif(c->>'reviewer_id', '')::uuid,
      c->>'body',
      coalesce(nullif(c->>'created_at', '')::timestamptz, now())
    from jsonb_array_elements(comments) as c;
  end if;

  return pin_id;
end;
$$;

-- Restrict execution: anon must NOT be able to call this. Only authenticated
-- users (real auth.uid() present) may invoke; the body still rejects unless
-- they own the pin.
revoke all on function design_review.restore_pin_with_comments(jsonb, jsonb) from public;
revoke all on function design_review.restore_pin_with_comments(jsonb, jsonb) from anon;
grant execute on function design_review.restore_pin_with_comments(jsonb, jsonb) to authenticated;
